from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from libs.contracts.evidence import KnowledgeGraphFact
from libs.utils.medical_text import normalize_search_text

PREDICATE_PRIORITIES = {
    "safety_gate": 0.42,
    "renal_adjustment": 0.35,
    "dose_guard": 0.32,
    "special_population": 0.28,
    "monitoring": 0.20,
    "candidate_product": 0.14,
    "local_catalog": 0.10,
    "contraindicated": 0.36,
    "avoid": 0.30,
    "warning": 0.22,
    "treat": 0.18,
    "recommend": 0.16,
}

CLINICAL_ENTITY_ALIASES = {
    "paracetamol": ["paracetamol", "acetaminophen"],
    "acetaminophen": ["acetaminophen", "paracetamol"],
    "fievre": ["fievre", "fever", "pyrexia"],
    "fever": ["fever", "fievre", "pyrexia"],
    "pyrexia": ["pyrexia", "fever", "fievre"],
    "asthma": ["asthma", "asthme", "bronchospasm", "bronchodilator", "beta agonist", "beta2 agonist"],
    "asthme": ["asthme", "asthma", "bronchospasm", "bronchodilator", "beta agonist", "beta2 agonist"],
    "salbutamol": ["salbutamol", "albuterol", "bronchodilator", "beta agonist", "beta2 agonist"],
    "albuterol": ["albuterol", "salbutamol", "bronchodilator", "beta agonist", "beta2 agonist"],
    "bronchodilator": ["bronchodilator", "salbutamol", "albuterol", "beta agonist", "beta2 agonist"],
    "bronchospasm": ["bronchospasm", "asthma", "asthme", "salbutamol", "albuterol"],
    "grippe": ["grippe", "influenza", "flu", "upper respiratory tract infection"],
    "influenza": ["influenza", "grippe", "flu", "upper respiratory tract infection"],
    "ibuprofen": ["ibuprofen", "nsaid", "anti inflammatory", "anti inflammatory drug"],
    "nsaid": ["nsaid", "ibuprofen", "anti inflammatory", "anti inflammatory drug"],
    "acenocoumarol": ["acenocoumarol", "acénocoumarol", "sintrom", "anticoagulant", "avk", "vitamin k antagonist", "vka"],
    "sintrom": ["sintrom", "acenocoumarol", "acénocoumarol", "anticoagulant", "avk", "vitamin k antagonist", "vka"],
    "warfarin": ["warfarin", "anticoagulant", "vitamin k antagonist", "vka", "bleeding", "cyp2c9", "vkorc1"],
    "anticoagulant": ["anticoagulant", "warfarin", "acenocoumarol", "sintrom", "avk", "vka", "bleeding"],
    "bleeding": ["bleeding", "melaena", "melena", "coagulopathy", "haemorrhage", "hemorrhage", "gastrointestinal bleeding"],
    "cyp2c9": ["cyp2c9", "warfarin", "pharmacogenomic", "pharmacogenetic"],
    "vkorc1": ["vkorc1", "warfarin", "pharmacogenomic", "pharmacogenetic"],
    "renal": ["renal", "kidney", "renal impairment", "insuffisance renale"],
    "kidney": ["kidney", "renal", "renal impairment"],
    "impairment": ["impairment", "renal impairment", "kidney disease"],
}


class Neo4jClient:
    def __init__(
        self,
        backend: str = "stub",
        fixture_path: Path | None = None,
        json_path: Path | None = None,
        csv_path: Path | None = None,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str = "neo4j",
    ) -> None:
        self.backend = backend
        self.fixture_path = fixture_path or Path(__file__).resolve().parents[2] / "examples" / "demo_fixtures" / "kg_facts_stub.json"
        self.json_path = json_path
        self.csv_path = csv_path
        self.uri = uri
        self.user = user
        self.password = password
        self.database = database
        self._driver = None
        self._kuzu_db = None
        self._kuzu_conn = None
        self._facts_cache: list[KnowledgeGraphFact] | None = None

    def fetch_related_facts(self, query: str, limit: int = 5, filters: dict[str, str] | None = None) -> list[KnowledgeGraphFact]:
        if self.backend in {"kuzu", "kuzu_file", "kuzu_safety"}:
            results = self._fetch_from_kuzu(query=query, limit=limit, filters=filters)
            if results:
                return results
            # Patch22 exact Kaggle fix: if the Kuzu wheel cannot open/query the
            # materialized Hetionet/PrimeKG DB, fall back to the CSV export that
            # is shipped next to db.kuzu in the same Kaggle asset. This keeps
            # backup_only measurable without pretending the primary KG supplied
            # those facts. The MultiKGRetriever still tags the returned facts as
            # backup_kg_1/support_only.
            results = self._fetch_from_hetionet_primekg_csv_export(query=query, limit=limit, filters=filters)
            if results:
                return results
        if self.backend == "neo4j":
            results = self._fetch_from_neo4j(query=query, limit=limit, filters=filters)
            if results:
                return results
        facts = self._load_facts()
        query_lower = normalize_search_text(query)
        query_tokens = _expand_query_tokens([token for token in query_lower.split() if len(token) > 2])
        scored = self._score_facts(facts, query_tokens, filters, strict_entity_anchor=False)
        if not scored:
            entity_terms = _canonical_entity_terms(query_lower)
            if entity_terms:
                scored = self._score_facts(facts, entity_terms, filters, strict_entity_anchor=True)
        ranked = sorted(scored, key=lambda x: x.score, reverse=True)
        return ranked[:limit]

    def _score_facts(
        self,
        facts: list[KnowledgeGraphFact],
        query_tokens: list[str],
        filters: dict[str, str] | None,
        *,
        strict_entity_anchor: bool,
    ) -> list[KnowledgeGraphFact]:
        scored: list[KnowledgeGraphFact] = []
        if not query_tokens:
            return scored
        for fact in facts:
            if not self._matches_filters(fact, filters):
                continue
            text = normalize_search_text(f"{fact.subject} {fact.predicate} {fact.object}")
            overlap_terms = [token for token in query_tokens if token in text]
            if not overlap_terms:
                continue
            if strict_entity_anchor and not _has_zero_drift_anchor(overlap_terms, text):
                continue
            predicate_bonus = self._predicate_bonus(fact.predicate)
            score = float(fact.score or 0.0) + (0.09 * len(overlap_terms)) + predicate_bonus
            scored.append(fact.model_copy(update={"score": round(score, 3)}))
        return scored

    def _load_facts(self) -> list[KnowledgeGraphFact]:
        if self._facts_cache is not None:
            return self._facts_cache
        if self.backend in {"cdss_csv_dir", "kuzu_csv_dir", "hetionet_primekg_csv_dir"}:
            self._facts_cache = self._load_cdss_csv_dir()
            return self._facts_cache
        if self.backend == "csv":
            if self.csv_path is None or not self.csv_path.exists():
                return []
            with self.csv_path.open('r', encoding='utf-8-sig', newline='') as fh:
                reader = csv.DictReader(fh)
                self._facts_cache = [fact for row in reader if (fact := self._normalize_csv_record(row)) is not None]
                return self._facts_cache
        path = self.fixture_path if self.backend == "stub" or self.json_path is None else self.json_path
        if not path.exists():
            return []
        if path.suffix.lower() == '.jsonl':
            items = [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
        else:
            payload = json.loads(path.read_text(encoding='utf-8-sig'))
            items = payload['items'] if isinstance(payload, dict) and 'items' in payload else payload
        out = []
        for item in items:
            normalized = self._normalize_record(item)
            if normalized is not None:
                out.append(normalized)
        self._facts_cache = out
        return out

    def _load_cdss_csv_dir(self) -> list[KnowledgeGraphFact]:
        if self.csv_path is None:
            return []
        base_path = self.csv_path if self.csv_path.is_dir() else self.csv_path.parent
        if not base_path.exists():
            return []
        file_kinds = {
            "cdss_drug_disease_edges.csv": "drug_disease",
            "cdss_drug_gene_edges.csv": "drug_gene",
            "cdss_disease_gene_edges.csv": "disease_gene",
        }
        facts: list[KnowledgeGraphFact] = []
        for filename, kind in file_kinds.items():
            path = base_path / filename
            if not path.exists():
                continue
            with path.open("r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    fact = self._normalize_cdss_edge_record(row, kind)
                    if fact is not None:
                        facts.append(fact)
        return facts

    def _fetch_from_kuzu(self, query: str, limit: int, filters: dict[str, str] | None = None) -> list[KnowledgeGraphFact]:
        conn = self._get_kuzu_connection()
        if conn is None:
            return []
        terms = self._kuzu_terms(query, filters)
        if not terms:
            return []
        out: list[KnowledgeGraphFact] = []
        per_term_limit = max(int(limit), 5)
        for term in terms[:8]:
            pattern = f"(?i).*{_regex_escape(term)}.*"
            df = self._execute_kuzu_fact_query(conn, term=term, pattern=pattern, limit=per_term_limit)
            if df is None:
                continue
            for _, row in df.iterrows():
                predicate = str(row.get("predicate", "related_to") or "related_to")
                category = str(row.get("category", "") or "")
                severity = str(row.get("severity", "") or "")
                source_system = str(row.get("source_system", "kg_export") or "kg_export")
                evidence_text = str(row.get("evidence_text", "") or "")
                score = 0.58 + self._predicate_bonus(predicate)
                if "interaction" in normalize_search_text(category + " " + predicate):
                    score += 0.12
                if severity:
                    score += 0.06
                obj = str(row.get("object", "") or "")
                if category or severity:
                    obj = f"{obj} [category={category}; severity={severity}]"
                subject = str(row.get("subject", term) or term)
                if not subject or not predicate or not obj:
                    continue
                out.append(
                    KnowledgeGraphFact(
                        subject=subject,
                        predicate=predicate,
                        object=obj,
                        score=round(min(score, 0.98), 3),
                        provenance=f"kuzu_kg:{source_system}:{evidence_text}"[:500],
                    )
                )
        return _dedupe_kg_facts(sorted(out, key=lambda item: item.score, reverse=True))[:limit]

    def _find_hetionet_primekg_csv_root(self) -> Path | None:
        """Return the folder containing Hetionet/PrimeKG nodes.csv + edges.csv.

        The Kaggle asset reviewed for Patch22 contains:
        hetionet_primekg_kuzu_full/hetionet_primekg_kuzu_full/db.kuzu
        plus sibling nodes.csv/edges.csv.  When csv_path points to db.kuzu,
        the CSV root is therefore csv_path.parent.
        """
        if self.csv_path is None:
            return None
        candidates: list[Path] = []
        p = Path(self.csv_path)
        if p.is_dir():
            candidates.extend([p, p.parent])
        else:
            candidates.extend([p.parent, p.parent.parent])
        for base in candidates:
            if base and (base / "nodes.csv").exists() and (base / "edges.csv").exists():
                return base
        return None

    def _fetch_from_hetionet_primekg_csv_export(self, query: str, limit: int, filters: dict[str, str] | None = None) -> list[KnowledgeGraphFact]:
        """Schema-specific CSV fallback for the Kaggle Hetionet/PrimeKG backup.

        This is intentionally used only after live Kuzu retrieval returns no
        facts. It scans the portable CSV export generated with the Kuzu backup
        and returns a small ranked subset for diagnostic source-mode probes.
        """
        base = self._find_hetionet_primekg_csv_root()
        if base is None:
            return []
        terms = self._kuzu_terms(query, filters)
        if not terms:
            return []
        norm_terms = [normalize_search_text(t) for t in terms if normalize_search_text(t)]
        if not norm_terms:
            return []

        nodes_path = base / "nodes.csv"
        edges_path = base / "edges.csv"
        nodes: dict[str, dict[str, str]] = {}
        matched_node_ids: set[str] = set()
        try:
            with nodes_path.open("r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    node_id = str(row.get("node_id") or row.get("id") or "")
                    if not node_id:
                        continue
                    name = str(row.get("name") or row.get("label") or row.get("norm_name") or node_id)
                    info = {
                        "name": name,
                        "label": str(row.get("label") or ""),
                        "type_family": str(row.get("type_family") or row.get("type") or ""),
                        "source": str(row.get("source") or ""),
                        "db_id": str(row.get("db_id") or ""),
                        "norm_name": str(row.get("norm_name") or ""),
                    }
                    nodes[node_id] = info
                    node_text = normalize_search_text(" ".join([node_id, *info.values()]))
                    if any(t in node_text for t in norm_terms):
                        matched_node_ids.add(node_id)
        except Exception:
            return []

        # If no entity matched, relation-only queries can still be useful, but
        # avoid scanning the whole huge file for very short/noisy terms.
        relation_terms = {t for t in norm_terms if len(t) >= 5}
        if not matched_node_ids and not relation_terms:
            return []

        out: list[KnowledgeGraphFact] = []
        max_collect = max(int(limit) * 8, 80)
        try:
            with edges_path.open("r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    src = str(row.get("src") or row.get("source") or "")
                    dst = str(row.get("dst") or row.get("target") or "")
                    rel_type = str(row.get("rel_type") or row.get("relation") or row.get("rel_table") or "RELATED")
                    rel_text = normalize_search_text(" ".join(str(row.get(k) or "") for k in ["rel_type", "relation", "source", "origin", "rel_table"]))
                    endpoint_match = src in matched_node_ids or dst in matched_node_ids
                    relation_match = bool(relation_terms and any(t in rel_text for t in relation_terms))
                    if not endpoint_match and not relation_match:
                        continue
                    src_info = nodes.get(src, {})
                    dst_info = nodes.get(dst, {})
                    subject = src_info.get("name") or src
                    obj = dst_info.get("name") or dst
                    if not subject or not obj:
                        continue
                    subject_type = src_info.get("type_family") or ""
                    object_type = dst_info.get("type_family") or ""
                    origin = str(row.get("source") or row.get("origin") or "hetionet_primekg")
                    rel_table = str(row.get("rel_table") or "")
                    object_text = str(obj)
                    context = [part for part in (object_type, rel_table, f"origin={origin}") if part]
                    if context:
                        object_text = f"{object_text} [{' ; '.join(context)}]"
                    fact = KnowledgeGraphFact(
                        subject=str(subject),
                        predicate=str(rel_type),
                        object=object_text,
                        score=0.58 + self._predicate_bonus(rel_type),
                        provenance=f"hetionet_primekg_csv:{origin}",
                    )
                    if not self._matches_filters(fact, filters):
                        continue
                    text = normalize_search_text(f"{fact.subject} {fact.predicate} {fact.object}")
                    overlap = sum(1 for t in norm_terms if t in text)
                    score = min(0.95, float(fact.score or 0.0) + 0.05 * overlap + (0.03 if endpoint_match else 0.0))
                    out.append(fact.model_copy(update={"score": round(score, 3)}))
                    if len(out) >= max_collect:
                        break
        except Exception:
            return []

        return _dedupe_kg_facts(sorted(out, key=lambda item: item.score, reverse=True))[:limit]

    def _execute_kuzu_fact_query(self, conn: Any, *, term: str, pattern: str, limit: int):
        """Run schema-tolerant Kuzu queries for primary and Hetionet/PrimeKG exports.

        Patch22 originally queried only ``(Entity)-[:KG_REL]->(Entity)`` with
        CDSS-specific optional properties.  The Kaggle Hetionet/PrimeKG backup
        export uses the same ``Entity`` node table but its relationship table is
        ``RELATED`` and its core names are generally stored under ``name``.
        Referencing a missing Kuzu property raises, so we try conservative
        query variants from richest to minimal instead of assuming one schema.
        """
        params = {"term": term, "term_lower": normalize_search_text(term), "pattern": pattern, "limit": limit}
        query_variants = [
            # Hetionet/PrimeKG Kaggle export: minimal exact schema from the KG build notebook.
            # This variant avoids coalesce and regex so it works on older Kuzu wheels.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE lower(d.name) CONTAINS $term_lower
               OR lower(o.name) CONTAINS $term_lower
               OR lower(r.rel_type) CONTAINS $term_lower
               OR lower(r.relation) CONTAINS $term_lower
            RETURN d.name AS subject, r.rel_type AS predicate, o.name AS object,
                   r.source AS source_system, r.rel_table AS category,
                   r.coasserted_key AS evidence_text
            LIMIT $limit
            """,
            # Hetionet/PrimeKG Kaggle export: exact schema from the KG build notebook.
            # Prefer CONTAINS/lower() over regex because some Kuzu versions used on
            # Kaggle raise on =~ while still supporting Cypher string containment.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE lower(d.name) CONTAINS $term_lower
               OR lower(d.norm_name) CONTAINS $term_lower
               OR lower(d.label) CONTAINS $term_lower
               OR lower(o.name) CONTAINS $term_lower
               OR lower(o.norm_name) CONTAINS $term_lower
               OR lower(o.label) CONTAINS $term_lower
               OR lower(r.rel_type) CONTAINS $term_lower
               OR lower(r.relation) CONTAINS $term_lower
            RETURN
                d.name AS subject,
                coalesce(r.rel_type, r.relation, 'RELATED') AS predicate,
                o.name AS object,
                d.type_family AS subject_type,
                o.type_family AS object_type,
                coalesce(r.source, r.origin, 'hetionet_primekg') AS source_system,
                r.rel_table AS category,
                r.coasserted_key AS evidence_text
            LIMIT $limit
            """,
            # Same schema, but anchored on IDs/db_ids for drug names that appear
            # as identifiers rather than labels in some exports.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE lower(d.node_id) CONTAINS $term_lower
               OR lower(d.db_id) CONTAINS $term_lower
               OR lower(o.node_id) CONTAINS $term_lower
               OR lower(o.db_id) CONTAINS $term_lower
               OR lower(r.rel_type) CONTAINS $term_lower
               OR lower(r.relation) CONTAINS $term_lower
            RETURN
                coalesce(d.name, d.label, d.node_id) AS subject,
                coalesce(r.rel_type, r.relation, 'RELATED') AS predicate,
                coalesce(o.name, o.label, o.node_id) AS object,
                d.type_family AS subject_type,
                o.type_family AS object_type,
                coalesce(r.source, r.origin, 'hetionet_primekg') AS source_system,
                r.rel_table AS category,
                r.coasserted_key AS evidence_text
            LIMIT $limit
            """,
            # CDSS primary export: rich edge metadata.
            """
            MATCH (d:Entity)-[r:KG_REL]->(o:Entity)
            WHERE d.canonical = $term OR d.label =~ $pattern OR o.label =~ $pattern
            RETURN
                d.label AS subject,
                r.relation AS predicate,
                o.label AS object,
                r.relation_category AS category,
                r.severity_hint AS severity,
                r.source_system AS source_system,
                r.evidence_text AS evidence_text
            LIMIT $limit
            """,
            # CDSS primary export: minimal properties.
            """
            MATCH (d:Entity)-[r:KG_REL]->(o:Entity)
            WHERE d.canonical = $term OR d.label =~ $pattern OR o.label =~ $pattern
            RETURN d.label AS subject, r.relation AS predicate, o.label AS object
            LIMIT $limit
            """,
            # Hetionet/PrimeKG Kaggle export: relationship table RELATED, names in `name`,
            # relation family in `rel_type`, and source system in `source`.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.name =~ $pattern OR o.name =~ $pattern OR r.rel_type =~ $pattern
            RETURN d.name AS subject, r.rel_type AS predicate, o.name AS object,
                   d.type_family AS subject_type, o.type_family AS object_type,
                   r.source AS source_system
            LIMIT $limit
            """,
            # Variant using relation property name from older exports.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.name =~ $pattern OR o.name =~ $pattern OR r.relation =~ $pattern
            RETURN d.name AS subject, r.relation AS predicate, o.name AS object,
                   d.type_family AS subject_type, o.type_family AS object_type,
                   r.source AS source_system
            LIMIT $limit
            """,
            # Variant with node labels instead of names.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.label =~ $pattern OR o.label =~ $pattern OR r.rel_type =~ $pattern
            RETURN d.label AS subject, r.rel_type AS predicate, o.label AS object,
                   r.source AS source_system
            LIMIT $limit
            """,
            # Variant with node identifiers and relation property.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.node_id =~ $pattern OR o.node_id =~ $pattern OR r.rel_type =~ $pattern
            RETURN d.node_id AS subject, r.rel_type AS predicate, o.node_id AS object,
                   r.source AS source_system
            LIMIT $limit
            """,
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.id =~ $pattern OR o.id =~ $pattern OR r.rel_type =~ $pattern
            RETURN d.id AS subject, r.rel_type AS predicate, o.id AS object,
                   r.source AS source_system
            LIMIT $limit
            """,
            # Last resort: RELATED table without relation property.
            """
            MATCH (d:Entity)-[r:RELATED]->(o:Entity)
            WHERE d.name =~ $pattern OR o.name =~ $pattern
            RETURN d.name AS subject, 'RELATED' AS predicate, o.name AS object
            LIMIT $limit
            """,
        ]
        for statement in query_variants:
            try:
                df = conn.execute(statement, params).get_as_df()
            except Exception:
                continue
            if df is not None and len(df) > 0:
                return df
        return None

    def _get_kuzu_connection(self):
        if self._kuzu_conn is not None:
            return self._kuzu_conn
        if self.csv_path is None or not self.csv_path.exists():
            return None
        try:
            import kuzu  # type: ignore
            self._kuzu_db = kuzu.Database(str(self.csv_path))
            self._kuzu_conn = kuzu.Connection(self._kuzu_db)
            return self._kuzu_conn
        except Exception:
            self._kuzu_db = None
            self._kuzu_conn = None
            return None

    def _kuzu_terms(self, query: str, filters: dict[str, str] | None) -> list[str]:
        terms: list[str] = []
        filters = filters or {}
        for key in ["active_ingredient", "dci", "drug", "ingredient"]:
            value = filters.get(key)
            if value:
                terms.extend(_expand_filter_terms(str(value)))
        query_norm = normalize_search_text(query)
        terms.extend(_canonical_entity_terms(query_norm))
        terms.extend([token for token in query_norm.split() if len(token) >= 5])
        return list(dict.fromkeys(term for term in terms if term))

    def _fetch_from_neo4j(self, query: str, limit: int, filters: dict[str, str] | None = None) -> list[KnowledgeGraphFact]:
        driver = self._get_driver()
        if driver is None:
            return []
        terms = [token.strip().lower() for token in normalize_search_text(query).split() if len(token.strip()) >= 4][:8]
        if not terms:
            return []
        cypher = """
        MATCH (a)-[r]->(b)
        WHERE any(term IN $terms WHERE
            toLower(coalesce(a.name, a.display_name, a.label, '')) CONTAINS term OR
            toLower(coalesce(b.name, b.display_name, b.label, '')) CONTAINS term OR
            toLower(type(r)) CONTAINS term
        )
        RETURN coalesce(a.name, a.display_name, a.label, head(labels(a)), 'unknown') AS subject,
               type(r) AS predicate,
               coalesce(b.name, b.display_name, b.label, head(labels(b)), 'unknown') AS object
        LIMIT $limit
        """
        out: list[KnowledgeGraphFact] = []
        try:
            with driver.session(database=self.database) as session:
                rows = session.run(cypher, {"terms": terms, "limit": max(limit * 5, limit)})
                for row in rows:
                    subject = str(row.get("subject", "unknown"))
                    predicate = str(row.get("predicate", "related_to"))
                    obj = str(row.get("object", "unknown"))
                    score = self._overlap_score(normalize_search_text(f"{subject} {predicate} {obj}"), terms) + self._predicate_bonus(predicate)
                    out.append(KnowledgeGraphFact(subject=subject, predicate=predicate, object=obj, score=round(score, 3), provenance='neo4j_live'))
        except Exception:
            return []
        return [fact for fact in sorted(out, key=lambda x: x.score, reverse=True) if self._matches_filters(fact, filters)][:limit]

    def _get_driver(self):
        if self._driver is not None:
            return self._driver
        if not self.uri or not self.user or self.password is None:
            return None
        try:
            from neo4j import GraphDatabase  # type: ignore
            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        except Exception:
            self._driver = None
        return self._driver

    @staticmethod
    def _normalize_record(item: dict[str, Any]) -> KnowledgeGraphFact | None:
        if not isinstance(item, dict):
            return None
        subject = _first(item, 'subject', 'source_name', 'drug', 'from')
        predicate = _first(item, 'predicate', 'relation', 'type')
        obj = _first(item, 'object', 'target_name', 'disease', 'to')
        if not subject or not predicate or not obj:
            return None
        return KnowledgeGraphFact(subject=str(subject), predicate=str(predicate), object=str(obj), score=float(item.get('score', 0.0) or 0.0), provenance=str(item.get('provenance', item.get('source', 'kg_file'))))

    @staticmethod
    def _normalize_csv_record(item: dict[str, Any]) -> KnowledgeGraphFact | None:
        disease = _first(item, 'disease')
        evidence_type = _first(item, 'evidence_type')
        line = _first(item, 'line')
        if not disease or not evidence_type or not line:
            return None
        route = _first(item, 'route') or ''
        vulnerability = _first(item, 'vulnerability') or ''
        priority = float(item.get('priority', 0) or 0)
        predicate = evidence_type if not route else f'{evidence_type}:{route}'
        score = 0.40 + (0.02 * priority) + (0.05 if vulnerability else 0.0)
        return KnowledgeGraphFact(subject=str(disease), predicate=predicate, object=str(line), score=round(score, 3), provenance=str(item.get('source', 'kg_csv')))

    @staticmethod
    def _normalize_cdss_edge_record(item: dict[str, Any], kind: str) -> KnowledgeGraphFact | None:
        subject = _first(item, 'source_node_name', 'source_name', 'src_name', 'src', 'source')
        obj = _first(item, 'target_node_name', 'target_name', 'dst_name', 'dst', 'target')
        predicate = _first(item, 'relation', 'rel_type', 'relation_family', 'rel_table', 'edge_key') or kind
        if not subject or not obj:
            return None
        source_type = _first(item, 'source_type_family', 'source_type', 'src_type', 'source_label') or ''
        target_type = _first(item, 'target_type_family', 'target_type', 'dst_type', 'target_label') or ''
        origin = _first(item, 'origin', 'source_system', 'kg_source') or _first(item, 'source') or 'hetionet_primekg'
        rel_table = _first(item, 'rel_table') or ''
        coasserted = _first(item, 'coasserted_key') or ''

        predicate_text = str(predicate)
        if source_type or target_type:
            predicate_text = f"{predicate_text}:{source_type}->{target_type}".strip(':')
        object_text = str(obj)
        context = [part for part in (target_type, rel_table, f"origin={origin}") if part]
        if context:
            object_text = f"{object_text} [{' ; '.join(context)}]"

        score = {
            "drug_disease": 0.58,
            "drug_gene": 0.50,
            "disease_gene": 0.48,
        }.get(kind, 0.45)
        predicate_norm = normalize_search_text(predicate_text)
        if any(term in predicate_norm for term in ("contraindication", "contraindicated", "treat", "indication", "palliate", "off_label", "synergistic")):
            score += 0.12
        if coasserted:
            score += 0.04
        if "primekg" in normalize_search_text(origin) and "hetionet" in normalize_search_text(origin):
            score += 0.03

        provenance = f"cdss_kg:{kind}:{origin}"
        return KnowledgeGraphFact(
            subject=str(subject),
            predicate=predicate_text,
            object=object_text,
            score=round(min(score, 0.92), 3),
            provenance=provenance,
        )

    @staticmethod
    def _matches_filters(fact: KnowledgeGraphFact, filters: dict[str, str] | None) -> bool:
        if not filters:
            return True
        subject = normalize_search_text(fact.subject)
        predicate = normalize_search_text(fact.predicate)
        obj = normalize_search_text(fact.object)
        for key, value in filters.items():
            expected = normalize_search_text(value)
            if not expected:
                continue
            if key == 'route' and expected not in predicate and not _is_route_agnostic_kg_fact(fact):
                return False
            expected_terms = _expand_filter_terms(expected)
            if key == 'disease' and not any(term in subject or term in obj for term in expected_terms):
                return False
            if key == 'vulnerability' and not any(term in obj or term in predicate for term in expected_terms):
                return False
        return True

    @staticmethod
    def _overlap_score(text: str, terms: list[str]) -> float:
        overlap = sum(1 for term in terms if term in text)
        return 0.35 + (0.12 * overlap)

    @staticmethod
    def _predicate_bonus(predicate: str) -> float:
        pred = normalize_search_text(predicate)
        for key, bonus in PREDICATE_PRIORITIES.items():
            if key in pred:
                return bonus
        return 0.0


def _regex_escape(value: str) -> str:
    import re
    return re.escape(str(value or ""))


def _dedupe_kg_facts(facts: list[KnowledgeGraphFact]) -> list[KnowledgeGraphFact]:
    seen: set[tuple[str, str, str]] = set()
    out: list[KnowledgeGraphFact] = []
    for fact in facts:
        key = (fact.subject.lower(), fact.predicate.lower(), fact.object.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(fact)
    return out


def _first(item: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = item.get(key)
        if value not in (None, ''):
            return str(value)
    return None


def _expand_query_tokens(tokens: list[str]) -> list[str]:
    out: list[str] = []
    for token in tokens:
        out.extend(CLINICAL_ENTITY_ALIASES.get(token, [token]))
    return list(dict.fromkeys(out))


def _canonical_entity_terms(query: str) -> list[str]:
    terms: list[str] = []
    for key, aliases in CLINICAL_ENTITY_ALIASES.items():
        if key in query or any(alias in query for alias in aliases):
            terms.extend(aliases)
    return list(dict.fromkeys(term for term in terms if len(term) >= 3))


def _has_zero_drift_anchor(overlap_terms: list[str], text: str) -> bool:
    anchor_terms = {
        "paracetamol", "acetaminophen", "fever", "fievre", "pyrexia",
        "asthma", "asthme", "salbutamol", "albuterol", "bronchodilator",
        "bronchospasm", "influenza", "grippe",
    }
    return any(term in anchor_terms and term in text for term in overlap_terms)


def _expand_filter_terms(value: str) -> list[str]:
    tokens = [token for token in normalize_search_text(value).split() if token]
    if not tokens:
        return []
    expanded = _expand_query_tokens(tokens)
    phrase = normalize_search_text(value)
    if phrase and phrase not in expanded:
        expanded.insert(0, phrase)
    return expanded


def _is_route_agnostic_kg_fact(fact: KnowledgeGraphFact) -> bool:
    # Some KG facts are safety relations and must be available during prescription routing.
    # normalize_search_text turns punctuation/underscores into spaces, so a provenance like
    # 'cdss_kg:drug_disease:...' becomes 'cdss kg drug disease ...'.
    # CDSS CSV edge exports and safety predicates are intentionally route-agnostic.
    provenance_raw = str(fact.provenance or "").lower()
    provenance = normalize_search_text(fact.provenance or "")
    predicate = normalize_search_text(fact.predicate or "")
    if provenance_raw.startswith("cdss_kg") or provenance.startswith("cdss kg"):
        return True
    return any(
        token in predicate
        for token in [
            "contraindication",
            "contraindicated",
            "interaction",
            "warning",
            "safety",
            "renal",
            "hepatic",
            "pregnancy",
            "risk",
        ]
    )

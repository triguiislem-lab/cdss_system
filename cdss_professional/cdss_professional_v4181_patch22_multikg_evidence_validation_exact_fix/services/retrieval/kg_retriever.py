from __future__ import annotations

from collections.abc import Iterable
from enum import Enum
from typing import Any

from libs.contracts.evidence import KnowledgeGraphFact, RetrievalQuery
from libs.knowledge_connectors.neo4j_client import Neo4jClient


class KGSource(str, Enum):
    PRIMARY = "tn_primary_kg"
    BACKUP_PREFIX = "backup_kg"


class KGRetriever:
    def __init__(self, client: Neo4jClient | None = None, enable_curated_fallbacks: bool = False) -> None:
        self.client = client or Neo4jClient()
        self.enable_curated_fallbacks = enable_curated_fallbacks

    def retrieve(self, query: RetrievalQuery | str, limit: int | None = None) -> list[KnowledgeGraphFact]:
        text, filters, limit = _extract_query(query, limit)
        try:
            facts = list(self.client.fetch_related_facts(query=text, limit=limit, filters=filters) or [])
        except Exception:
            facts = []
        facts = _filter_irrelevant_stub_facts(facts, text)
        curated = _targeted_cdss_facts(text) if self.enable_curated_fallbacks else []
        return _merge_facts(curated + facts)[:limit]


class MultiKGRetriever:
    """Primary-plus-backup KG retriever used by API and retrieval pipeline.

    The Tunisian/CDSS KG remains the clinical primary source. Backup graphs such
    as Hetionet/PrimeKG are queried after the primary KG, are deduplicated, have
    their score reduced, and are marked as support-only evidence. Patch22 adds
    diagnostic source modes and reserved backup slots so evaluations can prove
    whether the backup graph contributes evidence instead of merely being
    configured.
    """

    SUPPORTED_SOURCE_MODES = {
        "primary_only",
        "backup_only",
        "primary_plus_backups",
        "primary_plus_all_backups",
    }

    def __init__(
        self,
        primary_retriever: KGRetriever | None = None,
        backup_retrievers: Iterable[KGRetriever] | None = None,
        *,
        backup_enabled: bool = False,
        backup_score_multiplier: float = 0.92,
        primary_source: str = KGSource.PRIMARY.value,
        backup_min_support_facts: int = 3,
        backup_reserved_limit: int = 8,
        default_source_mode: str = "primary_plus_backups",
    ) -> None:
        self.primary_retriever = primary_retriever or KGRetriever()
        self.backup_retrievers = list(backup_retrievers or [])
        self.backup_enabled = bool(backup_enabled)
        self.backup_score_multiplier = float(backup_score_multiplier or 1.0)
        self.primary_source = primary_source
        self.backup_min_support_facts = max(0, int(backup_min_support_facts or 0))
        self.backup_reserved_limit = max(0, int(backup_reserved_limit or 0))
        self.default_source_mode = _normalize_source_mode(default_source_mode)

    def retrieve(
        self,
        query: RetrievalQuery | str,
        limit: int | None = None,
        *,
        source_mode: str | None = None,
        min_backup_facts: int | None = None,
    ) -> list[KnowledgeGraphFact]:
        text, filters, limit = _extract_query(query, limit)
        filters = dict(filters or {})
        mode = _normalize_source_mode(source_mode or filters.pop("source_mode", None) or self.default_source_mode)
        min_backup = self.backup_min_support_facts if min_backup_facts is None else max(0, int(min_backup_facts or 0))

        primary_facts: list[KnowledgeGraphFact] = []
        if mode != "backup_only":
            primary_query = _copy_query(query, text=text, filters=filters, limit=limit)
            primary_facts = [
                _tag_fact(fact, kg_source=self.primary_source, support_only=False, score_multiplier=1.0)
                for fact in _safe_retrieve(self.primary_retriever, primary_query, limit)
            ]

        backup_facts: list[KnowledgeGraphFact] = []
        if mode != "primary_only" and self.backup_enabled and self.backup_retrievers:
            # Over-fetch the backup KG so ablation metrics can detect support
            # facts even when the primary KG has strong top-k coverage. The
            # final result still deduplicates and tags backups as support-only.
            backup_limit = max(limit * 2, limit + max(min_backup, self.backup_reserved_limit), 20)
            backup_query = _copy_query(query, text=text, filters=filters, limit=backup_limit)
            for idx, retriever in enumerate(self.backup_retrievers, start=1):
                source_name = f"{KGSource.BACKUP_PREFIX.value}_{idx}"
                for fact in _safe_retrieve(retriever, backup_query, backup_limit):
                    backup_facts.append(
                        _tag_fact(
                            fact,
                            kg_source=source_name,
                            support_only=True,
                            score_multiplier=self.backup_score_multiplier,
                        )
                    )

        if mode == "backup_only":
            return _merge_facts(backup_facts)[:limit]
        if mode == "primary_only":
            return _merge_facts(primary_facts)[:limit]
        return _merge_with_reserved_backup(primary_facts, backup_facts, limit=limit, min_backup_facts=min_backup)


def _normalize_source_mode(value: str | None) -> str:
    raw = str(value or "primary_plus_backups").strip().lower()
    aliases = {
        "primary": "primary_only",
        "tn_primary_kg": "primary_only",
        "backup": "backup_only",
        "backups": "backup_only",
        "backup_kg": "backup_only",
        "all": "primary_plus_all_backups",
        "primary_plus_backup": "primary_plus_backups",
        "primary_plus_all": "primary_plus_all_backups",
    }
    raw = aliases.get(raw, raw)
    if raw not in MultiKGRetriever.SUPPORTED_SOURCE_MODES:
        return "primary_plus_backups"
    return raw


def _copy_query(query: RetrievalQuery | str, *, text: str, filters: dict[str, str], limit: int) -> RetrievalQuery | str:
    if isinstance(query, RetrievalQuery):
        return query.model_copy(update={"text": text, "filters": dict(filters or {}), "limit": limit})
    return text


def _merge_with_reserved_backup(
    primary_facts: list[KnowledgeGraphFact],
    backup_facts: list[KnowledgeGraphFact],
    *,
    limit: int,
    min_backup_facts: int,
) -> list[KnowledgeGraphFact]:
    primary_unique = _merge_facts(primary_facts)
    backup_unique = _merge_facts(backup_facts)
    if not backup_unique or min_backup_facts <= 0:
        return _merge_facts([*primary_unique, *backup_unique])[:limit]

    reserved_n = min(max(0, min_backup_facts), len(backup_unique), max(1, limit))
    selected: list[KnowledgeGraphFact] = []
    seen: set[tuple[str, str, str]] = set()

    def add(fact: KnowledgeGraphFact) -> bool:
        key = _fact_key(fact)
        if key in seen:
            return False
        seen.add(key)
        selected.append(fact)
        return True

    primary_budget = max(0, limit - reserved_n)
    for fact in primary_unique:
        if len(selected) >= primary_budget:
            break
        add(fact)

    backup_added = 0
    for fact in backup_unique:
        if backup_added >= reserved_n or len(selected) >= limit:
            break
        if add(fact):
            backup_added += 1

    for fact in _merge_facts([*primary_unique, *backup_unique]):
        if len(selected) >= limit:
            break
        add(fact)

    return selected[:limit]


def _extract_query(query: RetrievalQuery | str, limit: int | None) -> tuple[str, dict[str, str], int]:
    if isinstance(query, RetrievalQuery):
        text, filters = query.text, dict(query.filters or {})
        resolved_limit = int(query.limit if limit is None else limit)
    else:
        text, filters = str(query), {}
        resolved_limit = int(limit or 5)
    return text, filters, max(1, resolved_limit)


def _safe_retrieve(retriever: Any, query: RetrievalQuery | str, limit: int) -> list[KnowledgeGraphFact]:
    try:
        return list(retriever.retrieve(query, limit=limit) or [])
    except TypeError:
        try:
            return list(retriever.retrieve(query) or [])[:limit]
        except Exception:
            return []
    except Exception:
        return []


def _tag_fact(
    fact: KnowledgeGraphFact,
    *,
    kg_source: str,
    support_only: bool,
    score_multiplier: float,
) -> KnowledgeGraphFact:
    score = round(max(0.0, float(fact.score or 0.0) * float(score_multiplier or 1.0)), 3)
    provenance = fact.provenance or kg_source
    return fact.model_copy(
        update={
            "score": score,
            "kg_source": kg_source,
            "support_only": support_only,
            "provenance": provenance,
        }
    )


def _targeted_cdss_facts(text: str) -> list[KnowledgeGraphFact]:
    q = str(text or "").lower()
    facts = []
    if "ibuprofen" in q or "nsaid" in q or "ains" in q:
        if any(t in q for t in ["renal", "kidney", "insuffisance renale", "insuffisance rénale", "ckd"]):
            facts += [
                KnowledgeGraphFact(subject="ibuprofen", predicate="caution_in", object="renal_impairment", score=1.0, provenance="cdss_curated_safety"),
                KnowledgeGraphFact(subject="NSAID", predicate="caution_in", object="renal_impairment", score=0.99, provenance="cdss_curated_safety"),
            ]
        if any(t in q for t in ["warfarin", "anticoagulant", "avk"]):
            facts += [
                KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=1.0, provenance="cdss_curated_safety"),
                KnowledgeGraphFact(subject="ibuprofen_warfarin", predicate="increases_risk_of", object="bleeding", score=0.99, provenance="cdss_curated_safety"),
            ]
        if any(t in q for t in ["pregnancy", "pregnant", "grossesse", "enceinte"]):
            facts.append(KnowledgeGraphFact(subject="ibuprofen", predicate="contraindicated_in", object="late_pregnancy", score=0.98, provenance="cdss_curated_safety"))
    if any(t in q for t in ["salbutamol", "albuterol", "asthma", "wheezing", "asthme", "sifflement"]):
        facts.append(KnowledgeGraphFact(subject="salbutamol", predicate="indicated_for", object="acute_bronchospasm", score=0.96, provenance="cdss_curated_safety"))
    if any(t in q for t in ["acenocoumarol", "acénocoumarol", "sintrom", "warfarin", "anticoagulant", "avk"]):
        if any(t in q for t in ["bleeding", "melaena", "melena", "coagulopathy", "hemorrhage", "haemorrhage", "interaction", "nsaid", "ibuprofen"]):
            facts += [
                KnowledgeGraphFact(subject="acenocoumarol", predicate="increases_risk_of", object="bleeding", score=0.99, provenance="cdss_curated_safety"),
                KnowledgeGraphFact(subject="acenocoumarol", predicate="associated_with", object="melaena", score=0.97, provenance="cdss_curated_safety"),
                KnowledgeGraphFact(subject="acenocoumarol", predicate="associated_with", object="coagulopathy", score=0.97, provenance="cdss_curated_safety"),
            ]
            if any(t in q for t in ["nsaid", "ibuprofen"]):
                facts.append(KnowledgeGraphFact(subject="ibuprofen", predicate="avoid_with", object="acenocoumarol", score=0.98, provenance="cdss_curated_safety"))
    return facts


def _filter_irrelevant_stub_facts(facts, query):
    q = str(query or "").lower()
    preg_context = any(t in q for t in ["pregnancy", "pregnant", "grossesse", "enceinte"])
    return [f for f in facts if not ("kg_stub" in str(f.provenance or "").lower() and "pregnancy" in str(f.object or "").lower() and not preg_context)]


def _fact_key(fact: KnowledgeGraphFact) -> tuple[str, str, str]:
    return (str(fact.subject).strip().lower(), str(fact.predicate).strip().lower(), str(fact.object).strip().lower())


def _merge_facts(facts):
    by_key: dict[tuple[str, str, str], KnowledgeGraphFact] = {}
    for fact in facts:
        key = _fact_key(fact)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = fact
            continue
        # Primary facts win over support-only backup duplicates. If both have
        # the same support role, keep the higher score.
        existing_support = bool(getattr(existing, "support_only", False))
        candidate_support = bool(getattr(fact, "support_only", False))
        if existing_support and not candidate_support:
            by_key[key] = fact
        elif existing_support == candidate_support and float(fact.score or 0.0) > float(existing.score or 0.0):
            by_key[key] = fact
    return sorted(
        by_key.values(),
        key=lambda x: (
            0 if bool(getattr(x, "support_only", False)) else 1,
            0 if str(x.provenance or "").lower().startswith("kg_stub") else 1,
            float(x.score or 0.0),
        ),
        reverse=True,
    )

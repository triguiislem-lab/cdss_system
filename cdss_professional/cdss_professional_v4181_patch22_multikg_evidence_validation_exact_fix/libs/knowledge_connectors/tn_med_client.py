from __future__ import annotations

import json
import os
import re
import sqlite3
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from libs.contracts.evidence import EvidenceChunk


DEFAULT_TN_MED_ROOT = Path("/kaggle/input/datasets/islemtrigui6/tn-med-db-v1")


def _tn_med_db_path_score(path: Path) -> tuple[int, int]:
    """Score candidate TN_Med.db paths.

    Higher is better. Prefer explicit TN Med/data-tn datasets and larger DB files.
    """
    s = str(path).lower()
    score = 0
    if path.name == "TN_Med.db":
        score += 20
    if "tn-med-db-v1" in s or "tn_med" in s or "tn-med" in s:
        score += 40
    if "data-tn" in s or "tn" in s:
        score += 10
    if "/database/" in s or "\\database\\" in s:
        score += 10
    try:
        size_mb = int(path.stat().st_size // (1024 * 1024))
    except Exception:
        size_mb = 0
    return (score, size_mb)


class TNMedEnrichmentClient:
    """Structured enrichment connector for the TN Med DB v1 datasource.

    This connector is intentionally separate from ``LocalFormularyClient``:

    * LocalFormularyClient remains the primary local product/localization source.
    * TN Med DB v1 enriches medicines with therapeutic class, subclass,
      substances, indications, price/reimbursement, raw evidence summaries, and
      candidate heuristic-rule summaries.

    The implementation is schema-tolerant because notebooks/export versions can
    use slightly different French/English column names. It detects core columns
    at runtime and degrades gracefully when optional tables are missing.
    """

    def __init__(
        self,
        db_path: Path | str | None = None,
        data_root: Path | str | None = None,
        enabled: bool = True,
        max_support_samples: int = 5,
    ) -> None:
        self.enabled = bool(enabled)
        self.data_root = Path(data_root) if data_root else Path(os.environ.get("TN_MED_DATA_ROOT") or DEFAULT_TN_MED_ROOT)
        self.db_path = self._resolve_db_path(Path(db_path) if db_path else None)
        self.max_support_samples = max(1, int(max_support_samples or 5))

    def is_available(self) -> bool:
        return bool(self.enabled and self.db_path and self.db_path.exists())

    def health_check(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "enabled": self.enabled,
            "db_path": str(self.db_path or ""),
            "db_exists": bool(self.db_path and self.db_path.exists()),
            "available": self.is_available(),
            "tables": {},
        }
        if not self.is_available():
            return out
        try:
            with self._connect() as con:
                for table in [
                    "medicaments",
                    "substances_actives",
                    "medicament_substance",
                    "classes_therapeutiques",
                    "sous_classes_therapeutiques",
                    "medicament_classification",
                    "indications_medicament",
                    "prix_remboursement",
                    "preuves_cliniques_brutes",
                    "regles_heuristiques",
                ]:
                    if self._table_exists(con, table):
                        out["tables"][table] = con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        except Exception as exc:
            out["error"] = str(exc)
            out["available"] = False
        return out

    def search(self, query: str, limit: int = 5, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Return structured TN Med profiles for a medicine/product/DCI/AMM query."""
        if not self.is_available() or not str(query or "").strip():
            return []
        limit = max(1, int(limit or 5))
        filters = filters or {}
        with self._connect() as con:
            if not self._table_exists(con, "medicaments"):
                return []
            med_cols = self._columns(con, "medicaments")
            id_col = _find_col(med_cols, ["id_medicament", "medicament_id", "id", "medicine_id"])
            name_col = _find_col(med_cols, ["nom_medicament", "nom", "medicament", "name", "local_product_name", "product_name", "designation"])
            dci_col = _find_col(med_cols, ["dci_raw", "dci", "active_ingredient_raw", "substance", "substance_active", "principe_actif"])
            amm_col = _find_col(med_cols, ["amm", "num_amm", "numero_amm", "code_amm", "autorisation"])
            if not id_col:
                return []
            candidates = self._search_medicaments(con, query, med_cols, id_col, name_col, dci_col, amm_col, limit, filters)
            return [self._build_profile(con, row, med_cols, id_col, name_col, dci_col, amm_col) for row in candidates]

    def retrieve_chunks(self, query: str, limit: int = 5, filters: dict[str, Any] | None = None) -> list[EvidenceChunk]:
        """Return TN Med enrichment as EvidenceChunk objects for fusion.

        Classification, indication and price/reimbursement are structured
        enrichment. Raw clinical evidence and heuristic rules are emitted as
        support-only summaries requiring validation.
        """
        chunks: list[EvidenceChunk] = []
        for profile in self.search(query, limit=limit, filters=filters):
            chunks.extend(self._profile_to_chunks(profile))
        return chunks[: max(1, int(limit or 5)) * 5]

    def get_by_product_name(self, product_name: str, limit: int = 5) -> list[dict[str, Any]]:
        return self.search(product_name, limit=limit, filters={"match_mode": "product"})

    def get_by_active_ingredient(self, ingredient: str, limit: int = 5) -> list[dict[str, Any]]:
        return self.search(ingredient, limit=limit, filters={"match_mode": "ingredient"})

    def get_by_amm(self, amm: str, limit: int = 5) -> list[dict[str, Any]]:
        return self.search(amm, limit=limit, filters={"match_mode": "amm"})

    def _resolve_db_path(self, explicit: Path | None) -> Path | None:
        """Resolve TN_Med.db robustly in Kaggle/offline datasets.

        Patch23 originally trusted TN_MED_DB_PATH/TN_MED_DATA_ROOT too strongly.
        In Kaggle, dataset slugs can mount under different folders, for example:
        /kaggle/input/tn-med-db-v1/database/TN_Med.db
        /kaggle/input/datasets/islemtrigui6/tn-med-db-v1/database/TN_Med.db
        /kaggle/input/datasets/islemtrigui6/data-tn/tn-med-db-v1/database/TN_Med.db

        If the configured path is stale, this method now falls back to a bounded
        recursive scan and prefers paths that clearly belong to the TN Med source.
        """
        candidates: list[Path] = []

        def add_candidate(value: Path | str | None) -> None:
            if not value:
                return
            p = Path(value)
            candidates.append(p)
            if p.is_dir():
                candidates.extend([
                    p / "database" / "TN_Med.db",
                    p / "TN_Med.db",
                ])

        add_candidate(explicit)

        env_path = os.environ.get("TN_MED_DB_PATH")
        if env_path:
            add_candidate(env_path)

        env_root = os.environ.get("TN_MED_DATA_ROOT") or os.environ.get("TN_MED_ROOT")
        if env_root:
            add_candidate(env_root)

        for root in [self.data_root, DEFAULT_TN_MED_ROOT, Path("/kaggle/input"), Path.cwd()]:
            add_candidate(root)

        existing = [p for p in candidates if p and p.exists() and p.is_file() and p.name == "TN_Med.db"]
        if existing:
            return sorted(existing, key=_tn_med_db_path_score, reverse=True)[0]

        # Last-resort recursive detection. Include /kaggle/input because Kaggle
        # dataset mount names are not stable across accounts/slugs.
        search_roots: list[Path] = []
        for root in [self.data_root, DEFAULT_TN_MED_ROOT, Path("/kaggle/input"), Path.cwd()]:
            if root and root.exists() and root.is_dir() and root not in search_roots:
                search_roots.append(root)

        matches: list[Path] = []
        for root in search_roots:
            try:
                matches.extend(root.rglob("TN_Med.db"))
            except Exception:
                continue

        matches = [p for p in matches if p.exists() and p.is_file()]
        if matches:
            return sorted(matches, key=_tn_med_db_path_score, reverse=True)[0]

        return explicit or (self.data_root / "database" / "TN_Med.db")


    def _connect(self) -> sqlite3.Connection:
        """Open TN_Med.db in read-only mode when possible.

        Kaggle input datasets are read-only. Using a read-only immutable URI avoids
        SQLite journal/lock issues and is faster for static benchmark/runtime DBs.
        """
        try:
            uri = f"file:{Path(self.db_path).as_posix()}?mode=ro&immutable=1"
            con = sqlite3.connect(uri, uri=True, timeout=30)
        except Exception:
            con = sqlite3.connect(str(self.db_path), timeout=30)
        con.row_factory = sqlite3.Row
        return con

    @staticmethod
    def _table_exists(con: sqlite3.Connection, table: str) -> bool:
        return bool(con.execute("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?", (table,)).fetchone())

    @staticmethod
    @lru_cache(maxsize=128)
    def _cached_columns(db_path: str, table: str) -> tuple[str, ...]:
        con = sqlite3.connect(db_path)
        try:
            rows = con.execute(f'PRAGMA table_info("{table}")').fetchall()
            return tuple(row[1] for row in rows)
        finally:
            con.close()

    def _columns(self, con: sqlite3.Connection, table: str) -> list[str]:
        if not self.db_path:
            return []
        try:
            return list(self._cached_columns(str(self.db_path), table))
        except Exception:
            rows = con.execute(f'PRAGMA table_info("{table}")').fetchall()
            return [row[1] for row in rows]

    def _search_medicaments(
        self,
        con: sqlite3.Connection,
        query: str,
        med_cols: list[str],
        id_col: str,
        name_col: str | None,
        dci_col: str | None,
        amm_col: str | None,
        limit: int,
        filters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        q = str(query or "").strip()
        q_like = f"%{q.lower()}%"
        mode = str(filters.get("match_mode") or "").lower()
        searchable: list[str] = []
        if mode == "product" and name_col:
            searchable = [name_col]
        elif mode == "ingredient" and dci_col:
            searchable = [dci_col]
        elif mode == "amm" and amm_col:
            searchable = [amm_col]
        else:
            searchable = [c for c in [name_col, dci_col, amm_col] if c]
            for extra in ["nom_commercial", "dosage", "forme", "classe", "sous_classe"]:
                if extra in med_cols and extra not in searchable:
                    searchable.append(extra)
        if not searchable:
            searchable = [id_col]
        where = " OR ".join([f'LOWER(COALESCE("{col}", "")) LIKE ?' for col in searchable])
        sql = f'SELECT * FROM "medicaments" WHERE {where} LIMIT ?'
        rows = [dict(row) for row in con.execute(sql, [q_like] * len(searchable) + [limit * 3])]
        if not rows and q:
            # Small accent-insensitive Python fallback over the compact medicines table.
            all_rows = [dict(row) for row in con.execute(f'SELECT * FROM "medicaments" LIMIT 20000')]
            nq = _norm(q)
            rows = [row for row in all_rows if any(nq in _norm(row.get(col, "")) for col in searchable)][: limit * 3]
        return rows[:limit]

    def _build_profile(
        self,
        con: sqlite3.Connection,
        med_row: dict[str, Any],
        med_cols: list[str],
        id_col: str,
        name_col: str | None,
        dci_col: str | None,
        amm_col: str | None,
    ) -> dict[str, Any]:
        med_id = _clean(med_row.get(id_col))
        product_name = _clean(med_row.get(name_col)) if name_col else ""
        dci_raw = _clean(med_row.get(dci_col)) if dci_col else ""
        amm = _clean(med_row.get(amm_col)) if amm_col else ""
        profile = {
            "tn_med_medicine_id": med_id,
            "product_name": product_name,
            "active_ingredient_raw": dci_raw,
            "amm": amm,
            "medicine_row": dict(med_row),
        }
        profile.update(self._substances(con, med_id))
        profile.update(self._classification(con, med_id))
        profile.update(self._indications(con, med_id))
        profile.update(self._price_reimbursement(con, med_id))
        profile.update(self._support_table_summary(con, "preuves_cliniques_brutes", med_id, amm, product_name, dci_raw, "raw_clinical_evidence"))
        profile.update(self._support_table_summary(con, "regles_heuristiques", med_id, amm, product_name, dci_raw, "heuristic_rules"))
        return profile

    def _substances(self, con: sqlite3.Connection, med_id: str) -> dict[str, Any]:
        if not (self._table_exists(con, "medicament_substance") and self._table_exists(con, "substances_actives")):
            return {"substances": [], "substance_count": 0}
        ms_cols = self._columns(con, "medicament_substance")
        s_cols = self._columns(con, "substances_actives")
        ms_med = _find_col(ms_cols, ["id_medicament", "medicament_id", "medicine_id"])
        ms_sub = _find_col(ms_cols, ["id_substance", "substance_id", "substance_active_id", "active_substance_id"])
        s_id = _find_col(s_cols, ["id_substance", "substance_id", "id", "active_substance_id"])
        s_name = _find_col(s_cols, ["dci_raw", "nom_substance", "substance", "dci", "name", "libelle", "substance_active"])
        if not (ms_med and ms_sub and s_id):
            return {"substances": [], "substance_count": 0}
        select_name = f's."{s_name}"' if s_name else f's."{s_id}"'
        sql = f'''
            SELECT {select_name} AS substance_name
            FROM "medicament_substance" ms
            LEFT JOIN "substances_actives" s ON CAST(ms."{ms_sub}" AS TEXT)=CAST(s."{s_id}" AS TEXT)
            WHERE CAST(ms."{ms_med}" AS TEXT)=?
        '''
        items = [_clean(row[0]) for row in con.execute(sql, (med_id,)).fetchall()]
        items = _unique([x for x in items if x])
        return {"substances": items, "substance_count": len(items)}

    def _classification(self, con: sqlite3.Connection, med_id: str) -> dict[str, Any]:
        out = {"therapeutic_classes": [], "therapeutic_subclasses": [], "classification_rows": 0}
        if not self._table_exists(con, "medicament_classification"):
            return out
        mc_cols = self._columns(con, "medicament_classification")
        mc_med = _find_col(mc_cols, ["id_medicament", "medicament_id", "medicine_id"])
        mc_class = _find_col(mc_cols, ["id_classe", "classe_id", "class_id", "classe_therapeutique_id"])
        mc_sub = _find_col(mc_cols, ["id_sous_classe", "sous_classe_id", "subclass_id", "sous_classe_therapeutique_id"])
        if not mc_med:
            return out
        rows = [dict(row) for row in con.execute(f'SELECT * FROM "medicament_classification" WHERE CAST("{mc_med}" AS TEXT)=?', (med_id,))]
        out["classification_rows"] = len(rows)
        classes: list[str] = []
        subclasses: list[str] = []
        if rows and mc_class and self._table_exists(con, "classes_therapeutiques"):
            c_cols = self._columns(con, "classes_therapeutiques")
            c_id = _find_col(c_cols, ["id_classe", "classe_id", "id", "class_id"])
            c_name = _find_col(c_cols, ["nom_classe", "classe", "libelle", "name", "classe_therapeutique"])
            if c_id:
                for row in rows:
                    value = _clean(row.get(mc_class))
                    if not value:
                        continue
                    record = con.execute(f'SELECT * FROM "classes_therapeutiques" WHERE CAST("{c_id}" AS TEXT)=? LIMIT 1', (value,)).fetchone()
                    if record:
                        rd = dict(record)
                        classes.append(_clean(rd.get(c_name)) if c_name else value)
        if rows and mc_sub and self._table_exists(con, "sous_classes_therapeutiques"):
            sc_cols = self._columns(con, "sous_classes_therapeutiques")
            sc_id = _find_col(sc_cols, ["id_sous_classe", "sous_classe_id", "id", "subclass_id"])
            sc_name = _find_col(sc_cols, ["nom_sous_classe", "sous_classe", "libelle", "name", "sous_classe_therapeutique"])
            if sc_id:
                for row in rows:
                    value = _clean(row.get(mc_sub))
                    if not value:
                        continue
                    record = con.execute(f'SELECT * FROM "sous_classes_therapeutiques" WHERE CAST("{sc_id}" AS TEXT)=? LIMIT 1', (value,)).fetchone()
                    if record:
                        rd = dict(record)
                        subclasses.append(_clean(rd.get(sc_name)) if sc_name else value)
        out["therapeutic_classes"] = _unique(classes)
        out["therapeutic_subclasses"] = _unique(subclasses)
        return out

    def _indications(self, con: sqlite3.Connection, med_id: str) -> dict[str, Any]:
        if not self._table_exists(con, "indications_medicament"):
            return {"indications": [], "indication_rows": 0}
        cols = self._columns(con, "indications_medicament")
        med_col = _find_col(cols, ["id_medicament", "medicament_id", "medicine_id"])
        if not med_col:
            return {"indications": [], "indication_rows": 0}
        value_cols = [c for c in cols if any(k in _norm(c) for k in ["indication", "pathologie", "maladie", "diagnostic", "sympt"])]
        rows = [dict(row) for row in con.execute(f'SELECT * FROM "indications_medicament" WHERE CAST("{med_col}" AS TEXT)=?', (med_id,))]
        texts = []
        for row in rows:
            for col in value_cols or cols:
                val = _clean(row.get(col))
                if val and col != med_col:
                    texts.append(val)
        return {"indications": _unique(texts, 40), "indication_rows": len(rows)}

    def _price_reimbursement(self, con: sqlite3.Connection, med_id: str) -> dict[str, Any]:
        if not self._table_exists(con, "prix_remboursement"):
            return {"price_reimbursement": [], "price_rows": 0}
        cols = self._columns(con, "prix_remboursement")
        med_col = _find_col(cols, ["id_medicament", "medicament_id", "medicine_id"])
        if not med_col:
            return {"price_reimbursement": [], "price_rows": 0}
        useful = [c for c in cols if any(k in _norm(c) for k in ["prix", "price", "rembourse", "taux", "ppv", "ph", "date"])]
        rows = [dict(row) for row in con.execute(f'SELECT * FROM "prix_remboursement" WHERE CAST("{med_col}" AS TEXT)=? LIMIT 12', (med_id,))]
        summaries = []
        for row in rows:
            parts = [f"{col}={_clean(row.get(col))}" for col in useful if _clean(row.get(col))]
            if parts:
                summaries.append("; ".join(parts))
        return {"price_reimbursement": _unique(summaries, 10), "price_rows": len(rows)}

    def _support_table_summary(self, con: sqlite3.Connection, table: str, med_id: str, amm: str, product_name: str, dci_raw: str, prefix: str) -> dict[str, Any]:
        out = {f"{prefix}_rows": 0, f"{prefix}_samples": []}
        if not self._table_exists(con, table):
            return out
        cols = self._columns(con, table)
        predicates: list[str] = []
        params: list[str] = []
        for col, value in [
            (_find_col(cols, ["id_medicament", "medicament_id", "medicine_id"]), med_id),
            (_find_col(cols, ["amm", "num_amm", "numero_amm", "code_amm"]), amm),
            (_find_col(cols, ["nom_medicament", "medicament", "product_name", "local_product_name", "nom"]), product_name),
            (_find_col(cols, ["dci_raw", "dci", "active_ingredient_raw", "substance"]), dci_raw),
        ]:
            if col and value:
                predicates.append(f'CAST("{col}" AS TEXT)=?')
                params.append(str(value))
        if not predicates:
            return out
        where = " OR ".join(predicates)
        try:
            count = con.execute(f'SELECT COUNT(*) FROM "{table}" WHERE {where}', params).fetchone()[0]
            rows = [dict(row) for row in con.execute(f'SELECT * FROM "{table}" WHERE {where} LIMIT ?', params + [self.max_support_samples])]
        except Exception:
            return out
        samples = []
        text_cols = [c for c in cols if any(k in _norm(c) for k in ["texte", "text", "contenu", "section", "rule", "regle", "preuve", "evidence", "type"])] or cols[:8]
        for row in rows:
            parts = [f"{col}={_clean(row.get(col))}" for col in text_cols if _clean(row.get(col))]
            if parts:
                samples.append("; ".join(parts))
        return {f"{prefix}_rows": int(count or 0), f"{prefix}_samples": _unique(samples, self.max_support_samples)}

    def _profile_to_chunks(self, profile: dict[str, Any]) -> list[EvidenceChunk]:
        chunks: list[EvidenceChunk] = []
        product = profile.get("product_name") or "TN Med product"
        active = profile.get("active_ingredient_raw") or ", ".join(profile.get("substances") or [])
        base_metadata = {
            "source_system": "tn_med_db_v1",
            "dataset": "tn_med_db_v1",
            "tn_med_medicine_id": profile.get("tn_med_medicine_id"),
            "product_name": product,
            "active_ingredient": active,
            "amm": profile.get("amm"),
            "clinically_authoritative": False,
        }
        if profile.get("therapeutic_classes") or profile.get("therapeutic_subclasses") or profile.get("substances"):
            content = " | ".join([
                f"Produit: {product}",
                f"DCI/Substances: {', '.join(profile.get('substances') or [active])}",
                f"Classe thérapeutique: {', '.join(profile.get('therapeutic_classes') or [])}",
                f"Sous-classe thérapeutique: {', '.join(profile.get('therapeutic_subclasses') or [])}",
            ])
            chunks.append(EvidenceChunk(
                source="tn_med_db_v1",
                title=f"TN Med classification - {product}",
                content=content,
                score=0.96,
                metadata={**base_metadata, "section_kind": "therapeutic_classification", "retrieval_role": "structured_enrichment", "accepted_for_runtime_retrieval": True, "requires_rcp_verification": False, "quality_tier": "A"},
            ))
        if profile.get("indications"):
            chunks.append(EvidenceChunk(
                source="tn_med_db_v1",
                title=f"TN Med indications - {product}",
                content="Indications structurées: " + " | ".join(profile.get("indications") or []),
                score=0.92,
                metadata={**base_metadata, "section_kind": "indication", "retrieval_role": "structured_enrichment", "accepted_for_runtime_retrieval": True, "requires_rcp_verification": False, "quality_tier": "A"},
            ))
        if profile.get("price_reimbursement"):
            chunks.append(EvidenceChunk(
                source="tn_med_db_v1",
                title=f"TN Med prix/remboursement - {product}",
                content="Prix/remboursement: " + " | ".join(profile.get("price_reimbursement") or []),
                score=0.86,
                metadata={**base_metadata, "section_kind": "price_reimbursement", "retrieval_role": "structured_enrichment", "accepted_for_runtime_retrieval": True, "requires_rcp_verification": False, "quality_tier": "B"},
            ))
        if profile.get("raw_clinical_evidence_rows"):
            chunks.append(EvidenceChunk(
                source="tn_med_db_v1",
                title=f"TN Med raw clinical evidence summary - {product}",
                content=f"Raw clinical evidence rows: {profile.get('raw_clinical_evidence_rows')}. Samples: " + " | ".join(profile.get("raw_clinical_evidence_samples") or []),
                score=0.70,
                metadata={**base_metadata, "section_kind": "raw_clinical_evidence_summary", "retrieval_role": "support_only", "accepted_for_runtime_retrieval": False, "requires_rcp_verification": True, "quality_tier": "C"},
            ))
        if profile.get("heuristic_rules_rows"):
            chunks.append(EvidenceChunk(
                source="tn_med_db_v1",
                title=f"TN Med candidate heuristic rules - {product}",
                content=f"Candidate heuristic rule rows: {profile.get('heuristic_rules_rows')}. Samples: " + " | ".join(profile.get("heuristic_rules_samples") or []),
                score=0.65,
                metadata={**base_metadata, "section_kind": "candidate_heuristic_rules", "retrieval_role": "support_only", "accepted_for_runtime_retrieval": False, "requires_rcp_verification": True, "quality_tier": "C"},
            ))
        return chunks


def _find_col(columns: Iterable[str], candidates: list[str]) -> str | None:
    cols = list(columns or [])
    lower = {c.lower(): c for c in cols}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    candidate_norms = [(_norm(c), c) for c in candidates]
    for col in cols:
        ncol = _norm(col)
        for ncand, _ in candidate_norms:
            if ncand and (ncand == ncol or ncand in ncol or ncol in ncand):
                return col
    return None


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _unique(values: Iterable[str], max_items: int = 80) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = _clean(value)
        if not clean or clean.lower() in {"nan", "none", "null"}:
            continue
        marker = clean.lower()
        if marker not in seen:
            seen.add(marker)
            out.append(clean)
        if len(out) >= max_items:
            break
    return out

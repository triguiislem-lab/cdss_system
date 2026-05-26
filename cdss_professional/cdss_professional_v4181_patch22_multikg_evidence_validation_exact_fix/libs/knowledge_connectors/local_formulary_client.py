from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Any

from libs.contracts.evidence import LocalProductEvidence


class LocalFormularyClient:
    """Loads Tunisian/local formulary candidates from configurable backends.

    Supported backends:
    - ``stub``: bundled JSON fixture
    - ``json`` / ``jsonl``: file-backed product corpus
    - ``csv``: tabular AMM/catalog export
    - ``sqlite`` / ``tn_localization_sqlite``: generated ``tn_localization.sqlite`` runtime DB
    """

    def __init__(
        self,
        backend: str = "csv",
        fixture_path: Path | None = None,
        catalog_path: Path | None = None,
    ) -> None:
        self.backend = backend
        self.fixture_path = fixture_path or Path(__file__).resolve().parents[2] / "examples" / "demo_fixtures" / "local_formulary_stub.json"
        self.catalog_path = catalog_path or Path(os.environ.get("LOCALIZATION_DB_PATH") or os.environ.get("TN_LOCALIZATION_SQLITE_PATH") or os.environ.get("LOCAL_FORMULARY_CATALOG_PATH") or Path(__file__).resolve().parents[2] / "data" / "runtime" / "tn_master_amm_catalog.csv")

    def load_products(self) -> list[LocalProductEvidence]:
        if self.backend == "stub":
            return self._load_json_like(self.fixture_path)
        if self.backend in {"json", "jsonl"}:
            if self.catalog_path is None:
                return self._load_json_like(self.fixture_path)
            return self._load_json_like(self.catalog_path)
        if self.backend == "csv":
            if self.catalog_path is None or not self.catalog_path.exists():
                return []
            return self._load_csv(self.catalog_path)
        if self.backend in {"sqlite", "sqlite_tn_localization", "tn_localization_sqlite"}:
            if self.catalog_path is None or not self.catalog_path.exists():
                return []
            return self._load_sqlite_localization(self.catalog_path)
        return self._load_json_like(self.fixture_path)

    def _load_json_like(self, path: Path) -> list[LocalProductEvidence]:
        if not path.exists():
            return []
        if path.suffix.lower() == ".jsonl":
            items = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        else:
            payload = json.loads(path.read_text(encoding="utf-8"))
            items = payload["items"] if isinstance(payload, dict) and "items" in payload else payload
        out: list[LocalProductEvidence] = []
        for item in items:
            normalized = self._normalize_record(item)
            if normalized is not None:
                out.append(normalized)
        return out

    def _load_csv(self, path: Path) -> list[LocalProductEvidence]:
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            return _dedupe_products([
                product
                for row in reader
                if (product := self._normalize_record(row)) is not None
            ])

    def _load_sqlite_localization(self, path: Path) -> list[LocalProductEvidence]:
        import sqlite3

        con = sqlite3.connect(path)
        con.row_factory = sqlite3.Row
        try:
            query = """
            SELECT
                medicine_id,
                source_row_id,
                local_product_name,
                active_ingredient_raw,
                active_ingredient_canonical,
                active_ingredient_list,
                strength_raw,
                strength_normalized,
                form_raw,
                form_normalized,
                route_inferred,
                presentation,
                lab,
                country,
                amm,
                source_system,
                evidence_status,
                price,
                classification,
                is_combination,
                ingredient_count,
                accepted_evidence_count,
                evidence_section_count,
                localization_eligible,
                strict_mono_localization_eligible
            FROM medicines
            WHERE COALESCE(localization_eligible, 1) = 1
            """
            rows = [dict(row) for row in con.execute(query)]
        finally:
            con.close()
        return _dedupe_products([product for row in rows if (product := self._normalize_record(row)) is not None])

    @staticmethod
    def _normalize_record(item: dict[str, Any]) -> LocalProductEvidence | None:
        if not isinstance(item, dict):
            return None
        name = _first(item, "product_name", "local_product_name", "name", "specialite", "speciality", "nom", "brand_name")
        ingredient = _first(item, "active_ingredient", "active_ingredient_canonical", "active_ingredient_raw", "ingredient", "dci", "nom_generique", "inn", "substance", "composition")
        strength = _first(item, "strength", "strength_normalized", "strength_raw", "dosage", "dose", "teneur") or ""
        dosage_form = _first(item, "dosage_form", "form", "form_normalized", "form_raw", "forme", "presentation") or "unknown"
        market = _first(item, "market", "country", "pays") or "TN"
        if not name or not ingredient:
            return None
        metadata = dict(item)
        for key in ["product_name", "local_product_name", "name", "specialite", "speciality", "nom", "brand_name", "active_ingredient", "active_ingredient_canonical", "active_ingredient_raw", "ingredient", "dci", "nom_generique", "inn", "substance", "composition", "strength", "strength_normalized", "strength_raw", "dosage", "dose", "teneur", "dosage_form", "form", "form_normalized", "form_raw", "forme", "presentation", "market", "country", "pays", "score"]:
            metadata.pop(key, None)
        metadata.setdefault("source", item.get("source_system") or ("tn_localization_sqlite" if str(market).upper() == "TN" else "local_formulary"))
        metadata.setdefault("indication", item.get("indication", ""))
        metadata.setdefault("market_status", item.get("market_status", ""))
        combo = _looks_like_combination(str(ingredient))
        metadata.setdefault("is_combination", combo)
        metadata.setdefault("ingredient_count", 2 if combo else 1)
        metadata.setdefault("strict_mono_localization_eligible", not combo)
        if item.get("route_inferred") and not metadata.get("route"):
            metadata["route"] = item.get("route_inferred")
        if item.get("strict_mono_localization_eligible") is not None:
            metadata["strict_mono_localization_eligible"] = item.get("strict_mono_localization_eligible")
        if item.get("localization_eligible") is not None:
            metadata["localization_eligible"] = item.get("localization_eligible")
        return LocalProductEvidence(
            product_name=str(name),
            active_ingredient=str(ingredient),
            strength=str(strength),
            dosage_form=str(dosage_form),
            market=str(market),
            score=float(item.get("score", 0.0) or 0.0),
            metadata=metadata,
        )


def _first(item: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _dedupe_products(products: list[LocalProductEvidence]) -> list[LocalProductEvidence]:
    seen: dict[tuple[str, str, str, str], LocalProductEvidence] = {}
    out: list[LocalProductEvidence] = []
    for product in products:
        key = (
            product.product_name.strip().lower(),
            product.active_ingredient.strip().lower(),
            product.strength.strip().lower(),
            product.dosage_form.strip().lower(),
        )
        if key in seen:
            existing = seen[key]
            amm = str(product.metadata.get("amm", "")).strip()
            existing_amm = str(existing.metadata.get("amm", "")).strip()
            if amm and amm != existing_amm:
                duplicate_amms = list(existing.metadata.get("duplicate_amms", []))
                if amm not in duplicate_amms:
                    duplicate_amms.append(amm)
                existing.metadata["duplicate_amms"] = duplicate_amms
            continue
        seen[key] = product
        out.append(product)
    return out


def _looks_like_combination(value: str) -> bool:
    text = value.lower()
    known = [
        "paracetam", "amoxicill", "clavulan", "ibuprofen", "diclofen", "naprox",
        "dextromethorph", "doxylamine", "phenylephrine", "pseudoephed", "caffeine",
        "salbutamol", "cetiriz", "omepraz", "metformin", "aspirin", "codeine",
    ]
    hits = {token for token in known if token in text}
    return "+" in value or "/" in value or len(hits) >= 2 or any(token in text for token in [" association", "associe", "associes", "combine"])

from __future__ import annotations

import csv
import os
import sqlite3
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SYNONYMS_PATH = Path(os.environ.get("DCI_SYNONYMS_PATH") or ROOT_DIR / "data" / "runtime" / "tn_dci_synonyms.csv")

_BASE_CANONICAL = {
    "paracetamol": "paracetamol",
    "paracetamolum": "paracetamol",
    "acetaminophen": "paracetamol",
    "doliprane": "paracetamol",
    "adol": "paracetamol",
    "salbutamol": "salbutamol",
    "albuterol": "salbutamol",
    "ventoline": "salbutamol",
    "ventolin": "salbutamol",
    "aerol": "salbutamol",
    "ibuprofen": "ibuprofen",
    "ibuprofene": "ibuprofen",
    "ibuprofenee": "ibuprofen",
    "ibuprofena": "ibuprofen",
    "brufen": "ibuprofen",
    "diclofenac": "diclofenac",
    "diclofenac sodium": "diclofenac",
    "naproxen": "naproxen",
    "amoxicillin": "amoxicillin",
    "amoxicilline": "amoxicillin",
    "amoxal": "amoxicillin",
    "amoxicillin clavulanic acid": "amoxicillin + clavulanic acid",
    "amoxicilline acide clavulanique": "amoxicillin + clavulanic acid",
    "amoxicillin clavulanate": "amoxicillin + clavulanic acid",
    "augmentin": "amoxicillin + clavulanic acid",
    "amoclan": "amoxicillin + clavulanic acid",
    "cetirizine": "cetirizine",
    "cetirizinee": "cetirizine",
    "cetrizine": "cetirizine",
    "omeprazole": "omeprazole",
    "omeprazol": "omeprazole",
    "metformin": "metformin",
    "metformine": "metformin",
    "glucophage": "metformin",
    "warfarin": "warfarin",
    "acenocoumarol": "acenocoumarol",
    "sintrom": "acenocoumarol",
    "oral rehydration salts": "oral_rehydration_salts",
    "ors": "oral_rehydration_salts",
    "sels de rehydratation orale": "oral_rehydration_salts",
    "sro": "oral_rehydration_salts",
    "alginate": "alginate",
    "anti reflux alginate": "alginate",
    "artificial tears": "artificial_tears",
    "larmes artificielles": "artificial_tears",
    "saline nasal spray": "saline_nasal_spray",
    "spray nasal salin": "saline_nasal_spray",
    "spray melhi": "saline_nasal_spray",
    "benzoyl peroxide": "benzoyl_peroxide_topical",
    "peroxyde de benzoyle": "benzoyl_peroxide_topical",
    "psyllium": "psyllium",
    "chlorhexidine": "chlorhexidine_mouthwash",
    "bain de bouche chlorhexidine": "chlorhexidine_mouthwash",
    "dexpanthenol": "dexpanthenol_topical",
    "aciclovir topical": "aciclovir_topical",
    "acyclovir topical": "aciclovir_topical",
    "aciclovir": "aciclovir_topical",
    "dimenhydrinate": "dimenhydrinate",
    "lidocaine topical": "lidocaine_topical",
    "lidocaine": "lidocaine_topical",
    "diclofenac topical": "diclofenac_topical",
    "diclofenac gel": "diclofenac_topical",
    "iron": "iron",
    "fer": "iron",
}


def normalize_dci_text(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("µ", "u")
    text = text.replace("+", " + ").replace("/", " ")
    text = re.sub(r"[^a-z0-9\u0600-\u06FF+]+", " ", text)
    return " ".join(text.split())


def _load_sqlite_synonym_rows() -> list[tuple[str, str]]:
    """Load alias -> DCI mappings from the real Kaggle localization SQLite.

    This is the production path. The bundled CSV synonym file is only a local
    development fallback.
    """
    db = Path(os.environ.get("LOCALIZATION_DB_PATH") or os.environ.get("TN_LOCALIZATION_SQLITE_PATH") or "")
    if not db.exists():
        return []
    rows: list[tuple[str, str]] = []
    try:
        con = sqlite3.connect(str(db))
        con.row_factory = sqlite3.Row
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        for table in ["medicine_aliases", "medicines"]:
            if table not in tables:
                continue
            cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
            alias_cols = [c for c in cols if c.lower() in {"alias", "alias_text", "normalized_alias", "name", "product_name", "local_product_name", "brand_name", "trade_name"}]
            dci_cols = [c for c in cols if c.lower() in {"dci", "canonical_dci", "active_ingredient", "active_ingredient_raw", "active_ingredient_canonical", "ingredient", "substance"}]
            if not alias_cols or not dci_cols:
                # Flexible fallback: use text-like columns without reading BLOBs.
                alias_cols = alias_cols or [c for c in cols if any(k in c.lower() for k in ["alias", "name", "product"])]
                dci_cols = dci_cols or [c for c in cols if any(k in c.lower() for k in ["dci", "ingredient", "substance"])]
            if not alias_cols or not dci_cols:
                continue
            for row in con.execute(f"SELECT * FROM {table}"):
                data = dict(row)
                dci = next((str(data.get(c) or "") for c in dci_cols if str(data.get(c) or "").strip()), "")
                if not dci:
                    continue
                for c in alias_cols + dci_cols:
                    alias = str(data.get(c) or "").strip()
                    if alias:
                        rows.append((alias, dci))
        con.close()
    except Exception:
        return []
    return rows


@lru_cache(maxsize=1)
def _synonym_map() -> dict[str, str]:
    mapping = dict(_BASE_CANONICAL)
    for alias, canonical_value in _load_sqlite_synonym_rows():
        alias_norm = normalize_dci_text(alias)
        canonical_norm = normalize_dci_text(canonical_value)
        if alias_norm and canonical_norm:
            mapping[alias_norm] = mapping.get(canonical_norm, canonical_norm)
    path = DEFAULT_SYNONYMS_PATH
    if path.exists():
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                canonical = normalize_dci_text(row.get("canonical_dci") or row.get("dci") or row.get("canonical") or "")
                alias = normalize_dci_text(row.get("alias") or row.get("synonym") or row.get("text") or "")
                if not canonical or not alias:
                    continue
                canonical = mapping.get(canonical, canonical.replace(" + ", " + ").replace(" ", "_") if canonical in {"oral rehydration salts"} else canonical)
                mapping[alias] = canonical
    # preserve preferred spellings
    mapping["amoxicillin + clavulanic acid"] = "amoxicillin + clavulanic acid"
    mapping["amoxicillin clavulanic acid"] = "amoxicillin + clavulanic acid"
    mapping["oral rehydration salts"] = "oral_rehydration_salts"
    mapping["alginate"] = "alginate"
    mapping["artificial tears"] = "artificial_tears"
    mapping["saline nasal spray"] = "saline_nasal_spray"
    mapping["benzoyl peroxide"] = "benzoyl_peroxide_topical"
    mapping["chlorhexidine"] = "chlorhexidine_mouthwash"
    mapping["dexpanthenol"] = "dexpanthenol_topical"
    mapping["aciclovir"] = "aciclovir_topical"
    mapping["dimenhydrinate"] = "dimenhydrinate"
    mapping["lidocaine"] = "lidocaine_topical"
    mapping["diclofenac topical"] = "diclofenac_topical"
    return mapping


def canonicalize_dci(value: str | None) -> str:
    norm = normalize_dci_text(value)
    if not norm:
        return ""
    mapping = _synonym_map()
    if norm in mapping:
        return mapping[norm]
    # handle common accidental final-e spelling from accent stripping/LLM outputs
    if norm.endswith("ee") and norm[:-1] in mapping:
        return mapping[norm[:-1]]
    if norm.endswith("e") and norm[:-1] in mapping:
        return mapping[norm[:-1]]
    return norm.replace(" + ", " + ")


def canonicalize_dci_list(values) -> list[str]:
    out: list[str] = []
    for value in values or []:
        c = canonicalize_dci(str(value))
        if c and c not in out:
            out.append(c)
    return out

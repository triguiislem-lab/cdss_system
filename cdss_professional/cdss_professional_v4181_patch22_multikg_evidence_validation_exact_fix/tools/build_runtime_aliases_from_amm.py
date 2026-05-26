from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT_DIR / "data" / "runtime" / "tn_master_amm_catalog.csv"
DEFAULT_EXISTING = ROOT_DIR / "data" / "runtime" / "tn_medication_aliases.csv"
DEFAULT_OUTPUT = DEFAULT_EXISTING

COMMON_CANONICAL = {
    "amoxicilline": "amoxicillin",
    "amoxicilline acide clavulanique": "amoxicillin + clavulanic acid",
    "amoxicilline clavulanique": "amoxicillin + clavulanic acid",
    "amoxicilline clavulanate": "amoxicillin + clavulanic acid",
    "acide clavulanique amoxicilline": "amoxicillin + clavulanic acid",
    "ibuprofene": "ibuprofen",
    "ibuprofène": "ibuprofen",
    "diclofenac": "diclofenac",
    "diclofénac": "diclofenac",
    "paracetamol": "paracetamol",
    "paracétamol": "paracetamol",
    "salbutamol": "salbutamol",
    "acenocoumarol": "acenocoumarol",
    "acénocoumarol": "acenocoumarol",
    "metformine": "metformin",
    "omeprazole": "omeprazole",
    "oméprazole": "omeprazole",
    "cetirizine": "cetirizine",
    "cétirizine": "cetirizine",
    "loperamide": "loperamide",
    "lopéramide": "loperamide",
    "ramipril": "ramipril",
    "enalapril": "enalapril",
    "atorvastatine": "atorvastatin",
    "furosemide": "furosemide",
    "furosémide": "furosemide",
    "aspirine": "aspirin",
    "acid acetylsalicylique": "aspirin",
    "acide acetylsalicylique": "aspirin",
}

SKIP_ALIASES = {"", "na", "n a", "none", "unknown", "solution", "comprime", "gelule", "capsule"}
FIELDS = ["alias", "canonical_dci", "product_name", "alias_type", "source", "confidence"]


def normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("µ", "u")
    text = re.sub(r"[^a-z0-9\u0600-\u06FF+/% .-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def canonicalize_dci(value: str) -> str:
    raw = normalize(value)
    raw = raw.replace("/", " + ") if "+" in raw or "/" in raw else raw
    raw = re.sub(r"\b(de|du|des|sodique|sodium|chlorhydrate|hydrochloride|hydrate|hemihydrate)\b", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if raw in COMMON_CANONICAL:
        return COMMON_CANONICAL[raw]
    if "amoxicill" in raw and ("clavulan" in raw or "clav" in raw):
        return "amoxicillin + clavulanic acid"
    if "amoxicill" in raw:
        return "amoxicillin"
    if "paracetam" in raw or "acetaminophen" in raw:
        return "paracetamol"
    if "ibuprofen" in raw or "ibuprof" in raw:
        return "ibuprofen"
    if "salbutamol" in raw or "albuterol" in raw:
        return "salbutamol"
    if "acenocoumar" in raw:
        return "acenocoumarol"
    if "metformin" in raw or "metformin" in raw or "metformine" in raw:
        return "metformin"
    if "omepraz" in raw:
        return "omeprazole"
    if "cetiriz" in raw:
        return "cetirizine"
    if "loperamid" in raw:
        return "loperamide"
    if "atorvastat" in raw:
        return "atorvastatin"
    return raw


def alias_ok(alias: str) -> bool:
    a = normalize(alias)
    if a in SKIP_ALIASES:
        return False
    if len(a) < 3 or len(a) > 80:
        return False
    # Avoid high-noise vaccine/biologic descriptions becoming broad aliases.
    if len(a.split()) > 8 and not any(token in a for token in ["amoxic", "paracetam", "salbutam", "ibuprof", "diclofen", "omepraz", "metformin"]):
        return False
    return True


def read_existing(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return [{k: str(v or "") for k, v in row.items()} for row in csv.DictReader(fh)]


def build(catalog_path: Path, existing_path: Path | None = None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for row in read_existing(existing_path) if existing_path else []:
        key = (normalize(row.get("alias")), canonicalize_dci(row.get("canonical_dci", "")))
        if key[0] and key[1] and key not in seen:
            row["alias"] = key[0]
            row["canonical_dci"] = key[1]
            rows.append(row)
            seen.add(key)
    if not catalog_path.exists():
        return rows
    with catalog_path.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            dci = canonicalize_dci(row.get("dci", ""))
            brand = row.get("brand_name", "") or row.get("product_name", "")
            if not dci:
                continue
            candidates = [
                (dci, "dci", "0.84"),
                (brand, "brand", "0.88"),
            ]
            # Add a simplified brand without parentheses, dosage suffixes, or extra whitespace.
            clean_brand = re.sub(r"\([^)]*\)", " ", str(brand or ""))
            clean_brand = re.sub(r"\b\d+(?:[.,]\d+)?\s*(mg|g|mcg|ug|ui|iu|%|ml)\b", " ", clean_brand, flags=re.I)
            clean_brand = normalize(clean_brand)
            if clean_brand and clean_brand != normalize(brand):
                candidates.append((clean_brand, "brand_variant", "0.80"))
            for alias, alias_type, confidence in candidates:
                a = normalize(alias)
                key = (a, dci)
                if not alias_ok(alias) or key in seen:
                    continue
                rows.append({
                    "alias": a,
                    "canonical_dci": dci,
                    "product_name": str(brand or ""),
                    "alias_type": alias_type,
                    "source": "amm_catalog_generated",
                    "confidence": confidence,
                })
                seen.add(key)
    return sorted(rows, key=lambda r: (r.get("canonical_dci", ""), r.get("alias_type", ""), r.get("alias", "")))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate medication alias CSV from the Tunisian AMM catalog.")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--existing", type=Path, default=DEFAULT_EXISTING)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    rows = build(args.catalog, args.existing)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows([{k: row.get(k, "") for k in FIELDS} for row in rows])
    print(f"wrote {len(rows)} aliases to {args.output}")


if __name__ == "__main__":
    main()

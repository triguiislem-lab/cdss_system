from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "data" / "runtime"

REQUIRED_FILES = {
    "medication_aliases": RUNTIME / "tn_medication_aliases.csv",
    "class_to_dci": RUNTIME / "tn_class_to_dci_map.csv",
    "dci_safety_profiles": RUNTIME / "tn_dci_safety_profiles.csv",
    "indication_therapy_map": RUNTIME / "tn_indication_therapy_map.csv",
    "prescription_evidence_corpus": RUNTIME / "tn_prescription_evidence_corpus.jsonl",
    "amm_catalog": RUNTIME / "tn_master_amm_catalog.csv",
    "dci_synonyms": RUNTIME / "tn_dci_synonyms.csv",
    "dosing_rules": RUNTIME / "tn_dci_dosing_rules.csv",
    "alias_quality_overrides": RUNTIME / "tn_alias_quality_overrides.csv",
}


def _count_csv(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return sum(1 for _ in csv.DictReader(fh))


def _count_jsonl(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def verify() -> dict:
    checks = {}
    ok = True
    for name, path in REQUIRED_FILES.items():
        exists = path.exists()
        rows = 0
        if exists:
            rows = _count_jsonl(path) if path.suffix == ".jsonl" else _count_csv(path)
        checks[name] = {"path": str(path.relative_to(ROOT)), "exists": exists, "rows": rows}
        ok = ok and exists and rows > 0
    checks["ok"] = ok
    return checks


if __name__ == "__main__":
    print(json.dumps(verify(), ensure_ascii=False, indent=2))

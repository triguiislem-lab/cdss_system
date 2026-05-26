from __future__ import annotations

import json
import os
from pathlib import Path

EXPECTED = {
    "VECTOR_BACKEND": "faiss",
    "KG_BACKEND": "kuzu",
    "LOCAL_FORMULARY_BACKEND": "sqlite_tn_localization",
}
REQUIRED_PATHS = {
    "LOCALIZATION_DB_PATH": None,
    "EVIDENCE_FAISS_PATH": None,
    "EVIDENCE_METADATA_PATH": None,
    "KG_KUZU_DB_PATH": None,
}
FORBIDDEN_PRIMARY_MARKERS = [
    "data/runtime/tn_master_kg_edges.csv",
    "data/runtime/tn_prescription_evidence_corpus.jsonl",
    "data/runtime/tn_master_amm_catalog.csv",
]

def main() -> int:
    failures = []
    for key, expected in EXPECTED.items():
        actual = os.environ.get(key, "")
        if actual != expected:
            failures.append(f"{key}: expected {expected!r}, got {actual!r}")
    for key in REQUIRED_PATHS:
        value = os.environ.get(key, "")
        if not value or not Path(value).exists():
            failures.append(f"{key}: missing or does not exist -> {value!r}")
    env_text = "\n".join(f"{k}={v}" for k, v in os.environ.items())
    for marker in FORBIDDEN_PRIMARY_MARKERS:
        if marker in env_text:
            failures.append(f"Forbidden primary demo runtime marker found: {marker}")
    report = {
        "status": "FAIL" if failures else "PASS",
        "failures": failures,
        "backends": {k: os.environ.get(k) for k in EXPECTED},
        "paths": {k: os.environ.get(k) for k in REQUIRED_PATHS},
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())

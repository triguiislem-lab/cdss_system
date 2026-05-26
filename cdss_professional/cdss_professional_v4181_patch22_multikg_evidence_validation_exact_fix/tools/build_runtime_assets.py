from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run() -> dict:
    steps = []
    alias_builder = ROOT / "tools" / "build_runtime_aliases_from_amm.py"
    if alias_builder.exists():
        proc = subprocess.run([sys.executable, str(alias_builder)], cwd=str(ROOT), text=True, capture_output=True)
        steps.append({"step": "build_runtime_aliases_from_amm", "returncode": proc.returncode, "stdout": proc.stdout[-1000:], "stderr": proc.stderr[-1000:]})
    required = [
        "data/runtime/tn_medication_aliases.csv",
        "data/runtime/tn_dci_synonyms.csv",
        "data/runtime/tn_class_to_dci_map.csv",
        "data/runtime/tn_dci_safety_profiles.csv",
        "data/runtime/tn_dci_dosing_rules.csv",
        "data/runtime/tn_indication_therapy_map.csv",
        "data/runtime/tn_prescription_evidence_corpus.jsonl",
    ]
    assets = {path: (ROOT / path).exists() for path in required}
    return {"ok": all(assets.values()) and all(s.get("returncode", 0) == 0 for s in steps), "steps": steps, "assets": assets}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))

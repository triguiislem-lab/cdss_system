from __future__ import annotations

import argparse
import json
from pathlib import Path

def main() -> None:
    parser = argparse.ArgumentParser(description="Manual annotation helper for converted MTS-Dialog Level 1 cases.")
    parser.add_argument("--input", type=Path, default=Path("examples/evaluation/level1_mts_dialog_unlabeled.json"))
    parser.add_argument("--output", type=Path, default=Path("examples/evaluation/level1_mts_dialog_annotated.json"))
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    cases = data.get("cases", [])[: args.limit]
    annotated = []

    print("Manual Level 1 annotation helper")
    print("Press Enter to keep defaults. Use comma-separated values for lists. Ctrl+C stops.")
    for i, case in enumerate(cases, start=1):
        exp = dict(case.get("expected_extraction", {}))
        print("=" * 80)
        print(f"[{i}/{len(cases)}] {case.get('case_id')}")
        print((case.get("consultation", {}).get("doctor_notes", "") or "")[:2500])
        exp["symptoms"] = _ask_list("symptoms", exp.get("symptoms", []))
        exp["duration_days"] = _ask_optional_int("duration_days", exp.get("duration_days"))
        exp["allergies"] = _ask_list("allergies", exp.get("allergies", []))
        exp["current_medications"] = _ask_list("current_medications", exp.get("current_medications", []))
        exp["pregnancy_risk"] = _ask_bool("pregnancy_risk", exp.get("pregnancy_risk", False))
        exp["renal_risk"] = _ask_bool("renal_risk", exp.get("renal_risk", False))
        exp["hepatic_risk"] = _ask_bool("hepatic_risk", exp.get("hepatic_risk", False))
        exp["allergy_risk"] = _ask_bool("allergy_risk", exp.get("allergy_risk", bool(exp.get("allergies"))))
        exp["red_flags"] = _ask_list("red_flags", exp.get("red_flags", []))
        exp["missing_critical_information"] = _ask_list("missing_critical_information", exp.get("missing_critical_information", []))
        exp["needs_manual_labeling"] = False
        case["expected_extraction"] = exp
        annotated.append(case)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({**data, "description": "Manually annotated MTS-Dialog Level 1 cases.", "cases": annotated}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved annotated file: {args.output}")

def _ask_list(name: str, default: list) -> list[str]:
    raw = input(f"{name} [{', '.join(map(str, default or []))}]: ").strip()
    return list(default or []) if not raw else [x.strip() for x in raw.split(",") if x.strip()]

def _ask_optional_int(name: str, default):
    raw = input(f"{name} [{default if default is not None else ''}]: ").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        print("Invalid integer, keeping default.")
        return default

def _ask_bool(name: str, default: bool) -> bool:
    raw = input(f"{name} [{'y' if default else 'n'}]: ").strip().lower()
    if not raw:
        return bool(default)
    return raw in {"y", "yes", "true", "1", "oui", "o"}

if __name__ == "__main__":
    main()

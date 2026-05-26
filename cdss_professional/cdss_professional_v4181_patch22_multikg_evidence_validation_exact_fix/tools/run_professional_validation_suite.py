from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def check_case_id_leakage() -> dict:
    offenders: list[dict] = []
    for base in ["services", "libs", "apps"]:
        for path in (ROOT / base).rglob("*.py"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for i, line in enumerate(text.splitlines(), start=1):
                if "case_id" in line and "benchmark" not in line.lower():
                    offenders.append({"path": str(path.relative_to(ROOT)), "line": i, "text": line.strip()[:160]})
    return {"ok": len(offenders) == 0, "offenders": offenders[:50], "offender_count": len(offenders)}


def check_activation_defaults() -> dict:
    from libs.config import RuntimePipelineConfig

    c = RuntimePipelineConfig()
    expected = {
        "safety_policy_mode": "audit",
        "clinical_action_enabled": False,
        "medical_order_extraction_mode": "off",
        "post_generation_validator_mode": "off",
        "multilingual_retrieval_enabled": False,
        "professional_validation_enabled": True,
    }
    actual = {k: getattr(c, k) for k in expected}
    return {"ok": actual == expected, "expected": expected, "actual": actual}


def check_multilingual_offline_safety() -> dict:
    from services.retrieval.multilingual_stack import MultilingualRetrievalStack

    stack = MultilingualRetrievalStack()
    return stack.validate_offline_assets()


def run_policy_benchmark() -> dict:
    from tools.run_policy_rule_benchmark import main as policy_main

    metrics = policy_main()
    return {"returncode": 0, "metrics": metrics}


def run_staged_smoke() -> dict:
    from tools.run_staged_activation_smoke import main as smoke_main

    rc = smoke_main()
    return {"returncode": rc}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="professional_validation_report.json")
    args = parser.parse_args()

    report: dict = {"checks": {}}
    report["checks"]["activation_defaults"] = check_activation_defaults()
    report["checks"]["multilingual_offline_safety"] = check_multilingual_offline_safety()
    report["checks"]["case_id_leakage"] = check_case_id_leakage()
    report["policy_benchmark"] = run_policy_benchmark()
    report["staged_activation_smoke"] = run_staged_smoke()

    ok = True
    ok = ok and report["checks"]["activation_defaults"]["ok"]
    ok = ok and report["checks"]["multilingual_offline_safety"].get("offline_safe", False)
    ok = ok and report["checks"]["case_id_leakage"]["ok"]
    ok = ok and report["policy_benchmark"]["metrics"]["failure_count"] == 0
    ok = ok and report["staged_activation_smoke"]["returncode"] == 0
    report["ok"] = ok

    (ROOT / args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import json
from pathlib import Path

from tools.benchmark_utils import compute_level2_metrics, build_level2_failure_map, write_json


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate CDSS benchmark outputs into one report.")
    parser.add_argument("--out-dir", type=Path, default=Path("."))
    parser.add_argument("--output-prefix", type=str, default="overall")
    args = parser.parse_args()

    out_dir = args.out_dir
    level1_quick = load_json(out_dir / "api_level1_extraction_benchmark.json")
    level1_full = load_json(out_dir / "api_level1_full_50_benchmark.json")
    level2_quick = load_json(out_dir / "api_level2_quick_benchmark.json") or load_json(out_dir / "api_production_like_benchmark.json")

    level2_rows = []
    batch_files = sorted(out_dir.glob("api_level2_batch_*.json"))
    for path in batch_files:
        data = load_json(path) or {}
        level2_rows.extend(data.get("rows", []))

    if not level2_rows and level2_quick:
        level2_rows = level2_quick.get("rows", [])

    retrieval = load_json(out_dir / "retrieval_quality_metrics.json")
    localization = load_json(out_dir / "localization_quality_metrics.json")
    kg = load_json(out_dir / "kg_quality_metrics.json")

    level2_metrics = compute_level2_metrics(level2_rows) if level2_rows else {}
    failure_map = build_level2_failure_map(level2_rows) if level2_rows else []

    overall = {
        "level1_quick_metrics": (level1_quick or {}).get("metrics"),
        "level1_full_metrics": (level1_full or {}).get("metrics"),
        "level2_metrics": level2_metrics,
        "retrieval_metrics": (retrieval or {}).get("metrics"),
        "localization_metrics": (localization or {}).get("metrics"),
        "kg_metrics": (kg or {}).get("metrics"),
        "source_files": {
            "level2_batches": [str(path) for path in batch_files],
            "level2_quick": "api_level2_quick_benchmark.json" if (out_dir / "api_level2_quick_benchmark.json").exists() else "api_production_like_benchmark.json",
        },
    }

    write_json(out_dir / f"{args.output_prefix}_metrics.json", overall)
    write_json(out_dir / "failure_map.json", {"level2_failure_map": failure_map})
    write_json(out_dir / "performance_summary.json", {
        "stage_duration_summary_all_cases": level2_metrics.get("stage_duration_summary_all_cases"),
        "stage_duration_summary_prescription_cases": level2_metrics.get("stage_duration_summary_prescription_cases"),
        "stage_duration_summary_review_cases": level2_metrics.get("stage_duration_summary_review_cases"),
        "retrieval_substage_summary_prescription_cases": level2_metrics.get("retrieval_substage_summary_prescription_cases"),
    })
    write_json(out_dir / "evidence_quality_summary.json", {
        "evidence_confidence_counts": level2_metrics.get("evidence_confidence_counts"),
        "retrieval_accepted_evidence_rate": level2_metrics.get("retrieval_accepted_evidence_rate"),
        "local_evidence_rate": level2_metrics.get("local_evidence_rate"),
        "fallback_evidence_rate": level2_metrics.get("fallback_evidence_rate"),
        "broad_vector_fallback_used_rate_prescription_cases": level2_metrics.get("broad_vector_fallback_used_rate_prescription_cases"),
    })
    print(json.dumps(overall, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

EXCLUDE_PARTS = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}
EXCLUDE_PREFIXES = ("data/audit/trace-", "data/feedback/by_trace/", "data/feedback/datasets/", "examples/demo_fixtures/")
EXCLUDE_SUFFIXES = (".pyc", ".pyo")
EXCLUDE_FILES = {
    "data/feedback/clinician_feedback.jsonl",
    "data/feedback/clinician_feedback.sqlite",
    "reports/patch7_data_driven_evaluation.json",
}


def should_exclude(rel: str) -> bool:
    path = Path(rel)
    if any(part in EXCLUDE_PARTS for part in path.parts):
        return True
    if rel.endswith(EXCLUDE_SUFFIXES):
        return True
    if rel in EXCLUDE_FILES:
        return True
    if any(rel.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
        return True
    if rel.startswith("data/feedback/") and rel.endswith((".sqlite", ".sqlite-wal", ".sqlite-shm")):
        return True
    if rel.startswith("reports/") and rel.endswith(".json"):
        return True
    if rel in {"policy_rule_benchmark_results.json", "professional_validation_report.json", "staged_activation_smoke_report.json", "release_file_manifest.json"}:
        return True
    return False


def package(root: Path, output: Path) -> None:
    root = root.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(root.rglob("*")):
            if not file.is_file():
                continue
            rel = file.relative_to(root).as_posix()
            if should_exclude(rel):
                continue
            zf.write(file, arcname=root.name + "/" + rel)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    package(Path(args.root), Path(args.output))

#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_feedback_datasets(input_path: Path, output_dir: Path) -> dict[str, Any]:
    events = _load_jsonl(input_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    buckets = {
        "approved_cases": [],
        "edited_cases": [],
        "rejected_cases": [],
        "incomplete_cases": [],
    }
    reason_counts: Counter[str] = Counter()
    field_counts: Counter[str] = Counter()
    decision_counts: Counter[str] = Counter()
    route_decisions: dict[str, Counter[str]] = defaultdict(Counter)

    for event in events:
        decision = event.get("decision") or "unknown"
        decision_counts[decision] += 1
        route_decisions[str(event.get("draft_route") or "unknown")][decision] += 1
        for code in event.get("reason_codes") or []:
            reason_counts[str(code)] += 1
        edits = list(event.get("field_edits") or []) + list(event.get("inferred_field_edits") or [])
        for edit in edits:
            field = str(edit.get("field") or "unknown")
            field_counts[field] += 1
        if decision == "approved_as_is":
            buckets["approved_cases"].append(event)
        elif decision == "approved_with_edits":
            buckets["edited_cases"].append(event)
        elif decision == "rejected":
            buckets["rejected_cases"].append(event)
        else:
            buckets["incomplete_cases"].append(event)

    for name, rows in buckets.items():
        _write_jsonl(output_dir / f"{name}.jsonl", rows)

    total = len(events)
    approved_total = decision_counts.get("approved_as_is", 0) + decision_counts.get("approved_with_edits", 0)
    blocked_but_approved = sum(
        1
        for event in events
        if event.get("draft_blocked") is True and event.get("decision") in {"approved_as_is", "approved_with_edits"}
    )
    safety_miss_codes = {
        "unsafe_medication",
        "contraindication_missed",
        "allergy_missed",
        "pregnancy_risk_missed",
        "renal_adjustment_missed",
        "hepatic_adjustment_missed",
        "emergency_case_should_not_prescribe",
        "non_pharma_case_should_not_prescribe",
    }
    summary = {
        "total_feedback_events": total,
        "decision_counts": dict(decision_counts),
        "approval_rate": approved_total / total if total else 0.0,
        "edit_rate": decision_counts.get("approved_with_edits", 0) / total if total else 0.0,
        "rejection_rate": decision_counts.get("rejected", 0) / total if total else 0.0,
        "incomplete_decision_rate": (decision_counts.get("revise_requested", 0) + decision_counts.get("more_info_requested", 0)) / total if total else 0.0,
        "blocked_but_approved_count": blocked_but_approved,
        "blocked_but_approved_rate": blocked_but_approved / approved_total if approved_total else 0.0,
        "wrong_dose_frequency": reason_counts.get("wrong_dose", 0),
        "bad_localization_frequency": reason_counts.get("bad_local_product", 0) + reason_counts.get("local_product_changed", 0),
        "missing_evidence_frequency": reason_counts.get("insufficient_evidence", 0),
        "safety_miss_frequency": sum(reason_counts.get(code, 0) for code in safety_miss_codes),
        "reason_code_counts": dict(reason_counts),
        "field_edit_counts": dict(field_counts),
        "route_decision_counts": {route: dict(counts) for route, counts in route_decisions.items()},
        "policy": "Feedback datasets are for offline evaluation/governance only; no live automatic retraining.",
    }
    (output_dir.parent / "feedback_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Clinician feedback error taxonomy",
        "",
        f"Total feedback events: {total}",
        "",
        "## Decisions",
    ]
    for key, value in decision_counts.most_common():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Reason codes"])
    if reason_counts:
        for key, value in reason_counts.most_common():
            lines.append(f"- {key}: {value}")
    else:
        lines.append("- None recorded")
    lines.extend(["", "## Most edited fields"])
    if field_counts:
        for key, value in field_counts.most_common(25):
            lines.append(f"- {key}: {value}")
    else:
        lines.append("- None recorded")
    lines.extend(["", "## Governance note", "Feedback is stored for offline evaluation and governed improvement only. Do not use it for automatic live retraining."])
    (output_dir.parent / "error_taxonomy.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build offline learning/evaluation datasets from clinician feedback JSONL.")
    parser.add_argument("--input", default="data/feedback/clinician_feedback.jsonl")
    parser.add_argument("--output-dir", default="data/feedback/datasets")
    args = parser.parse_args()
    summary = build_feedback_datasets(Path(args.input), Path(args.output_dir))
    print(json.dumps({"ok": True, **summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

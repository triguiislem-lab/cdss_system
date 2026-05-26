from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.container import get_pipeline  # noqa: E402
from libs.config import get_settings
from services.llm.qwen_provider import shared_transformers_status  # noqa: E402
from libs.contracts.commands import DraftPrescriptionCommand  # noqa: E402
from libs.contracts.patient import ConsultationInput, PatientProfile  # noqa: E402
from libs.utils.medical_text import normalize_search_text  # noqa: E402


DEFAULT_CASES = ROOT / "examples" / "evaluation" / "pipeline_cases.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run complete CDSS pipeline evaluation metrics.")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--output", type=Path, default=Path("cdss_pipeline_metrics.json"))
    parser.add_argument("--markdown-output", type=Path, default=Path("cdss_pipeline_metrics.md"))
    parser.add_argument("--generation-backend", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--max-cases", type=int, default=0, help="Limit case count for heavy Qwen runs. 0 means all.")
    args = parser.parse_args()

    if args.generation_backend:
        os.environ["GENERATION_BACKEND"] = args.generation_backend
    if args.model:
        os.environ["GENERATION_MODEL"] = args.model
        os.environ["LLM_MODEL"] = args.model
    try:
        get_settings.cache_clear()
    except Exception:
        pass

    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    if isinstance(cases, dict):
        cases = cases.get("cases", [])
    if args.max_cases > 0:
        cases = cases[: args.max_cases]

    started = time.perf_counter()
    rows = [_run_case(case) for case in cases]
    report = _build_report(rows, total_ms=round((time.perf_counter() - started) * 1000, 2))
    report = _json_safe(report)

    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    args.markdown_output.write_text(_markdown_report(report), encoding="utf-8")
    print(json.dumps(report["metrics"], indent=2, ensure_ascii=False))
    print(f"\nSaved JSON: {args.output}")
    print(f"Saved Markdown: {args.markdown_output}")


def _run_case(case: dict[str, Any]) -> dict[str, Any]:
    command = DraftPrescriptionCommand(
        request_id=case["request_id"],
        patient=PatientProfile.model_validate(case["patient"]),
        consultation=ConsultationInput.model_validate(case["consultation"]),
    )
    started = time.perf_counter()
    error = None
    result = None
    try:
        result = get_pipeline().draft(command)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    if result is None:
        return {
            "case_id": case.get("case_id"),
            "description": case.get("description", ""),
            "ok": False,
            "error": error,
            "duration_ms": duration_ms,
            "expected": _expected(case),
        }

    predicted_symptoms = list(result.snapshot.normalized_symptoms)
    predicted_conditions = list(result.snapshot.suspected_conditions or result.snapshot.disease_tags)
    predicted_meds = [med.active_ingredient for med in result.draft_plan.medications]
    localized_meds = [item.local_product_name for item in result.proposal.localized_medications]
    generation_notes = list(result.draft_plan.generation_notes or [])
    model_usage = _model_usage(generation_notes, result)
    vector_chunks = result.evidence.vector_chunks
    graph_facts = result.evidence.graph_facts
    local_products = result.evidence.local_products
    retrieval_diagnostics = result.evidence.retrieval_diagnostics or {}
    kg_source_counts = dict(retrieval_diagnostics.get("kg_source_counts", {}) or {})
    backup_kg_facts_n = sum(count for source, count in kg_source_counts.items() if str(source).startswith("backup_kg"))
    primary_kg_facts_n = int(kg_source_counts.get("tn_primary_kg", 0) or 0)
    fallback_evidence_count = sum(1 for chunk in vector_chunks if bool(getattr(chunk, "metadata", {}) or {}).get("fallback_used"))

    expected_route = case.get("expected_route")
    expected_symptoms = case.get("expected_symptoms", []) or []
    expected_conditions = case.get("expected_conditions", []) or []
    expected_meds = case.get("expected_active_ingredients", []) or []

    row = {
        "case_id": case.get("case_id"),
        "description": case.get("description", ""),
        "ok": True,
        "error": None,
        "duration_ms": duration_ms,
        "status": result.status,
        "blocked": result.blocked,
        "route": result.snapshot.route_recommendation,
        "triage": result.draft_plan.triage_recommendation,
        "route_debug": {
            "route_reason": result.snapshot.extracted_context.get("route_reason"),
            "blocking_reason": result.snapshot.extracted_context.get("blocking_reason"),
            "missing_critical_information": result.snapshot.extracted_context.get("missing_critical_information")
            or result.snapshot.missing_critical_information,
            "review_triggers": result.snapshot.extracted_context.get("review_triggers", []),
            "llm_level1_extraction": result.snapshot.extracted_context.get("llm_level1_extraction", {}),
        },
        "expected": _expected(case),
        "predicted": {
            "symptoms": predicted_symptoms,
            "conditions": predicted_conditions,
            "medications": predicted_meds,
            "localized_medications": localized_meds,
        },
        "scores": {
            "route_match": result.snapshot.route_recommendation == expected_route if expected_route else None,
            "symptom_f1": _f1(predicted_symptoms, expected_symptoms),
            "condition_f1": _f1(predicted_conditions, expected_conditions),
            "medication_hit": _contains_all(predicted_meds, expected_meds),
            "localized_hit": bool(localized_meds) if expected_meds else len(localized_meds) == 0,
            "vector_coverage": len(vector_chunks) >= int(case.get("expected_min_vector_chunks", 0) or 0),
            "kg_coverage": len(graph_facts) >= int(case.get("expected_min_kg_facts", 0) or 0),
            "local_coverage": len(local_products) >= int(case.get("expected_min_local_products", 0) or 0),
        },
        "counts": {
            "vector_chunks": len(vector_chunks),
            "kg_facts": len(graph_facts),
            "local_products": len(local_products),
            "draft_medications": len(result.draft_plan.medications),
            "localized_medications": len(result.proposal.localized_medications),
            "safety_findings": len(result.safety.findings),
            "critical_findings": result.safety.critical_count,
            "warning_findings": result.safety.warning_count,
            "primary_kg_facts": primary_kg_facts_n,
            "backup_kg_facts": backup_kg_facts_n,
            "kg_support_only": int(retrieval_diagnostics.get("kg_support_only_count", 0) or 0),
            "fallback_evidence": fallback_evidence_count,
        },
        "model_usage": {
            **model_usage,
            "vector_reranker_used": any(chunk.metadata.get("reranker_model_used") for chunk in vector_chunks),
            "local_reranker_used": any(product.metadata.get("reranker_model_used") for product in local_products),
        },
        "retrieval_diagnostics": {
            "kg_source_counts": kg_source_counts,
            "kg_support_only_count": retrieval_diagnostics.get("kg_support_only_count", 0),
            "source_attribution": retrieval_diagnostics.get("source_attribution", []),
            "backup_kg_facts_n": backup_kg_facts_n,
            "primary_kg_facts_n": primary_kg_facts_n,
            "fallback_evidence_count": fallback_evidence_count,
        },
        "top_evidence": {
            "vector": vector_chunks[0].model_dump() if vector_chunks else None,
            "kg": graph_facts[0].model_dump() if graph_facts else None,
            "local": local_products[0].model_dump() if local_products else None,
        },
        "stage_traces": [
            {
                "stage": trace.stage_name.value if hasattr(trace.stage_name, "value") else str(trace.stage_name),
                "status": trace.status,
                "duration_ms": round(trace.duration_ms, 2),
                "detail": trace.detail,
            }
            for trace in result.stage_traces
        ],
        "generation_notes": generation_notes,
    }
    return row


def _expected(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "route": case.get("expected_route"),
        "symptoms": case.get("expected_symptoms", []) or [],
        "conditions": case.get("expected_conditions", []) or [],
        "active_ingredients": case.get("expected_active_ingredients", []) or [],
        "min_vector_chunks": int(case.get("expected_min_vector_chunks", 0) or 0),
        "min_kg_facts": int(case.get("expected_min_kg_facts", 0) or 0),
        "min_local_products": int(case.get("expected_min_local_products", 0) or 0),
    }


def _build_report(rows: list[dict[str, Any]], total_ms: float) -> dict[str, Any]:
    ok_rows = [row for row in rows if row.get("ok")]
    settings = get_settings()
    metrics = {
        "case_count": len(rows),
        "ok_count": len(ok_rows),
        "error_count": len(rows) - len(ok_rows),
        "total_duration_ms": total_ms,
        "avg_case_duration_ms": _mean([row.get("duration_ms", 0) for row in ok_rows]),
        "route_accuracy": _rate(row["scores"]["route_match"] for row in ok_rows if row["scores"]["route_match"] is not None),
        "symptom_macro_f1": _mean([row["scores"]["symptom_f1"] for row in ok_rows]),
        "condition_macro_f1": _mean([row["scores"]["condition_f1"] for row in ok_rows]),
        "medication_hit_rate": _rate(row["scores"]["medication_hit"] for row in ok_rows),
        "localization_hit_rate": _rate(row["scores"]["localized_hit"] for row in ok_rows),
        "vector_coverage_rate": _rate(row["scores"]["vector_coverage"] for row in ok_rows),
        "kg_coverage_rate": _rate(row["scores"]["kg_coverage"] for row in ok_rows),
        "local_formulary_coverage_rate": _rate(row["scores"]["local_coverage"] for row in ok_rows),
        "vector_nonempty_rate": _rate(row["counts"]["vector_chunks"] > 0 for row in ok_rows),
        "kg_nonempty_rate": _rate(row["counts"]["kg_facts"] > 0 for row in ok_rows),
        "local_formulary_nonempty_rate": _rate(row["counts"]["local_products"] > 0 for row in ok_rows),
        "llm_model_usage_rate": _rate(row["model_usage"]["llm_model_used"] for row in ok_rows),
        "llm_output_parseable_rate": _rate(row["model_usage"]["llm_output_parseable"] for row in ok_rows if row["model_usage"]["llm_model_used"]),
        "llm_fallback_used_rate": _rate(row["model_usage"]["fallback_used"] for row in ok_rows),
        "final_plan_generated_rate": _rate(row["model_usage"]["final_plan_generated"] for row in ok_rows),
        "medication_structure_complete_rate": _rate(row["model_usage"]["medication_structure_complete"] for row in ok_rows if row["counts"]["draft_medications"] > 0),
        "vector_reranker_usage_rate": _rate(row["model_usage"]["vector_reranker_used"] for row in ok_rows),
        "local_reranker_usage_rate": _rate(row["model_usage"]["local_reranker_used"] for row in ok_rows),
        "blocked_rate": _rate(row.get("blocked") for row in ok_rows),
        "primary_kg_facts_mean": _mean([row["counts"].get("primary_kg_facts", 0) for row in ok_rows]),
        "backup_kg_facts_mean": _mean([row["counts"].get("backup_kg_facts", 0) for row in ok_rows]),
        "backup_kg_used_rate": _rate(row["counts"].get("backup_kg_facts", 0) > 0 for row in ok_rows),
        "kg_support_only_mean": _mean([row["counts"].get("kg_support_only", 0) for row in ok_rows]),
        "vector_fallback_used_rate": _rate(row["counts"].get("fallback_evidence", 0) > 0 for row in ok_rows),
        "fallback_evidence_count_mean": _mean([row["counts"].get("fallback_evidence", 0) for row in ok_rows]),
    }
    metrics.update(_safety_gate_metrics(ok_rows))
    metrics["kg_coverage_note"] = "Use kg_nonempty_rate for real KG contribution; kg_coverage_rate may pass cases whose expected_min_kg_facts is 0."
    metrics["stage_avg_duration_ms"] = _stage_averages(ok_rows)
    metrics["route_confusion"] = dict(
        Counter(f"{row['expected']['route']}->{row.get('route')}" for row in ok_rows)
    )
    return {
        "runtime": {
            "generation_backend": os.environ.get("GENERATION_BACKEND") or settings.generation_backend,
            "generation_model": os.environ.get("GENERATION_MODEL") or os.environ.get("LLM_MODEL") or settings.generation_model or settings.llm_model,
            "shared_qwen_model_cache": shared_transformers_status(),
            "vector_backend": os.environ.get("VECTOR_BACKEND") or settings.vector_backend,
            "vector_embedding_model": os.environ.get("VECTOR_EMBEDDING_MODEL") or settings.vector_embedding_model,
            "reranker_model": os.environ.get("RERANKER_MODEL") or settings.reranker_model,
            "kg_backend": os.environ.get("KG_BACKEND") or settings.kg_backend,
            "kg_catalog_path": os.environ.get("KG_CATALOG_PATH") or settings.kg_catalog_path,
            "local_formulary_catalog_path": os.environ.get("LOCAL_FORMULARY_CATALOG_PATH") or settings.local_formulary_catalog_path,
        },
        "metrics": metrics,
        "cases": rows,
    }


def _markdown_report(report: dict[str, Any]) -> str:
    metrics = report["metrics"]
    lines = [
        "# CDSS Pipeline Evaluation Metrics",
        "",
        "## Runtime",
        "",
    ]
    for key, value in report["runtime"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(
        [
            "",
            "## Global Metrics",
            "",
            "| Metric | Value |",
            "|---|---:|",
        ]
    )
    for key, value in metrics.items():
        if key in {"stage_avg_duration_ms", "route_confusion"}:
            continue
        lines.append(f"| `{key}` | {value} |")
    lines.extend(["", "## Stage Latency", "", "| Stage | Avg ms |", "|---|---:|"])
    for stage, value in metrics["stage_avg_duration_ms"].items():
        lines.append(f"| `{stage}` | {value} |")
    lines.extend(["", "## Route Confusion", "", "| Expected -> Predicted | Count |", "|---|---:|"])
    for key, value in metrics["route_confusion"].items():
        lines.append(f"| `{key}` | {value} |")
    lines.extend(
        [
            "",
            "## Case Details",
            "",
            "| Case | Route | Symptoms F1 | Medication Hit | Vector/KG/Local | Meds | Status |",
            "|---|---|---:|---:|---|---|---|",
        ]
    )
    for row in report["cases"]:
        if not row.get("ok"):
            lines.append(f"| `{row.get('case_id')}` | error | 0 | 0 | - | - | {row.get('error')} |")
            continue
        scores = row["scores"]
        counts = row["counts"]
        meds = ", ".join(row["predicted"]["medications"]) or "none"
        coverage = f"{counts['vector_chunks']}/{counts['kg_facts']}/{counts['local_products']}"
        route = f"{row['expected']['route']} -> {row['route']}"
        lines.append(
            f"| `{row['case_id']}` | {route} | {scores['symptom_f1']} | {scores['medication_hit']} | {coverage} | {meds} | {row['status']} |"
        )
    lines.append("")
    return "\n".join(lines)


def _safety_gate_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    critical_expected_routes = {"review", "emergency", "blocked"}
    critical_rows = [row for row in rows if row.get("expected", {}).get("route") in critical_expected_routes]
    false_safe_rows = [
        row
        for row in critical_rows
        if row.get("route") == "prescription" and not bool(row.get("blocked"))
    ]
    caught_rows = [row for row in critical_rows if row not in false_safe_rows]
    false_safe_rate = round(len(false_safe_rows) / len(critical_rows), 3) if critical_rows else 0.0
    critical_recall = round(len(caught_rows) / len(critical_rows), 3) if critical_rows else 1.0
    return {
        "critical_safety_case_count": len(critical_rows),
        "critical_safety_recall": critical_recall,
        "false_safe_count": len(false_safe_rows),
        "false_safe_rate": false_safe_rate,
        "safety_gate_false_safe_zero": false_safe_rate == 0.0,
        "false_safe_case_ids": [row.get("case_id") for row in false_safe_rows],
    }


def _model_usage(generation_notes: list[str], result: Any) -> dict[str, Any]:
    note_blob = "\n".join(generation_notes)
    llm_model_used = "llm_model_used=true" in note_blob
    fallback_used = "llm_output_unparseable_or_empty=true" in note_blob
    medication_structure_complete = _medication_structure_complete(result.draft_plan.medications)
    return {
        "llm_model_used": llm_model_used,
        "llm_output_parseable": bool(llm_model_used and not fallback_used and medication_structure_complete),
        "fallback_used": fallback_used,
        "final_plan_generated": bool(result.draft_plan.medications or result.proposal.localized_medications),
        "medication_structure_complete": medication_structure_complete,
        "qwen_or_llm_note": next((note for note in generation_notes if "llm_model_used=true" in note), None),
        "raw_llm_debug": _raw_llm_debug(generation_notes),
    }


def _medication_structure_complete(medications: list[Any]) -> bool:
    if not medications:
        return False
    for med in medications:
        for attr in ["dose", "frequency", "duration", "route"]:
            value = getattr(med, attr, "")
            normalized = str(value or "").strip().lower()
            if not normalized or any(token in normalized for token in ["unspecified", "unknown", "tbd", "to confirm"]):
                return False
    return True


def _raw_llm_debug(notes: list[str]) -> dict[str, Any]:
    debug: dict[str, Any] = {}
    for note in notes:
        cleaned = str(note or "").strip()
        # OutputParser may preserve model metadata as either 'key=value' or 'note: key=value'.
        if cleaned.lower().startswith("note:"):
            cleaned = cleaned.split(":", 1)[1].strip()
        cleaned = cleaned.strip().strip("*`").strip()
        if cleaned.startswith("raw_llm_output_length="):
            value = cleaned.split("=", 1)[1]
            try:
                debug["raw_llm_output_length"] = int(value)
            except ValueError:
                debug["raw_llm_output_length"] = value
        elif cleaned.startswith("raw_llm_output_preview="):
            debug["raw_llm_output_preview"] = cleaned.split("=", 1)[1]
        elif cleaned.startswith("parsed_medications_before_fallback="):
            value = cleaned.split("=", 1)[1]
            try:
                debug["parsed_medications_before_fallback"] = int(value)
            except ValueError:
                debug["parsed_medications_before_fallback"] = value
        elif cleaned.startswith("fallback_reason="):
            debug["fallback_reason"] = cleaned.split("=", 1)[1]
    return debug


def _norm_set(items: list[str]) -> set[str]:
    return {normalize_search_text(item) for item in items if normalize_search_text(item)}


def _f1(predicted: list[str], expected: list[str]) -> float:
    pred = _norm_set(predicted)
    gold = _norm_set(expected)
    if not gold and not pred:
        return 1.0
    if not gold or not pred:
        return 0.0
    tp = len(pred & gold)
    precision = tp / len(pred) if pred else 0.0
    recall = tp / len(gold) if gold else 0.0
    if precision + recall == 0:
        return 0.0
    return round(2 * precision * recall / (precision + recall), 3)


def _contains_all(predicted: list[str], expected: list[str]) -> bool:
    gold = _norm_set(expected)
    if not gold:
        return len(predicted) == 0
    pred_blob = " ".join(_norm_set(predicted))
    return all(item in pred_blob for item in gold)


def _mean(values: list[float]) -> float:
    return round(statistics.mean(values), 2) if values else 0.0


def _rate(values) -> float:
    items = list(values)
    return round(sum(1 for item in items if item) / len(items), 3) if items else 0.0


def _stage_averages(rows: list[dict[str, Any]]) -> dict[str, float]:
    by_stage: dict[str, list[float]] = {}
    for row in rows:
        for trace in row.get("stage_traces", []):
            by_stage.setdefault(trace["stage"], []).append(float(trace["duration_ms"]))
    return {stage: _mean(values) for stage, values in sorted(by_stage.items())}


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    try:
        import numpy as np  # type: ignore

        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            return float(value)
        if isinstance(value, np.ndarray):
            return value.tolist()
    except Exception:
        pass
    return value


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile
from libs.config import get_settings
from services.llm.qwen_provider import shared_transformers_status
from apps.api.container import get_pipeline


DEFAULT_CASES: dict[str, dict[str, Any]] = {
    "fever_paracetamol": {
        "request_id": "qwen-smoke-fever-001",
        "patient": {
            "patient_id": "p-qwen-fever",
            "age_years": 30,
            "sex": "female",
            "weight_kg": 65,
            "pregnant": False,
            "breastfeeding": False,
            "renal_impairment": False,
            "hepatic_impairment": False,
            "known_allergies": [],
            "current_medications": [],
            "chronic_conditions": [],
        },
        "consultation": {
            "language": "fr",
            "doctor_notes": "Fievre depuis 2 jours. Pas d'allergie connue. Non enceinte. Paracetamol traitement symptomatique.",
            "transcript": [],
        },
    },
    "asthma_bronchodilator": {
        "request_id": "qwen-smoke-asthma-001",
        "patient": {
            "patient_id": "p-qwen-asthma",
            "age_years": 26,
            "sex": "female",
            "weight_kg": 60,
            "pregnant": False,
            "breastfeeding": False,
            "renal_impairment": False,
            "hepatic_impairment": False,
            "known_allergies": [],
            "current_medications": [],
            "chronic_conditions": ["asthma"],
        },
        "consultation": {
            "language": "fr",
            "doctor_notes": "Patiente asthmatique avec wheezing et toux. Pas d'allergie connue. Non enceinte. Besoin de bronchodilatateur.",
            "transcript": [],
        },
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one CDSS pipeline case and emit Qwen/model metrics.")
    parser.add_argument("--case", choices=sorted(DEFAULT_CASES), default="fever_paracetamol")
    parser.add_argument("--payload", type=Path, help="Optional JSON payload with request_id, patient, consultation.")
    parser.add_argument("--output", type=Path, default=Path("qwen_smoke_metrics.json"))
    parser.add_argument("--generation-backend", default="transformers")
    parser.add_argument("--model", default="")
    parser.add_argument("--timeout-note", action="store_true", help="Only prints a reminder that Qwen first load can be long.")
    args = parser.parse_args()

    if args.timeout_note:
        print("Qwen3-32B first load can take many minutes and requires enough RAM/VRAM.")

    os.environ["GENERATION_BACKEND"] = args.generation_backend
    if args.model:
        os.environ["GENERATION_MODEL"] = args.model
        os.environ["LLM_MODEL"] = args.model
    try:
        get_settings.cache_clear()
    except Exception:
        pass

    payload = json.loads(args.payload.read_text(encoding="utf-8")) if args.payload else DEFAULT_CASES[args.case]
    command = DraftPrescriptionCommand(
        request_id=payload["request_id"],
        patient=PatientProfile.model_validate(payload["patient"]),
        consultation=ConsultationInput.model_validate(payload["consultation"]),
    )

    started = time.perf_counter()
    result = get_pipeline().draft(command)
    total_ms = round((time.perf_counter() - started) * 1000, 2)
    report = _json_safe(_build_report(result, total_ms))
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nSaved report to: {args.output}")


def _build_report(result, total_ms: float) -> dict[str, Any]:
    notes = list(result.draft_plan.generation_notes or [])
    note_blob = "\n".join(notes)
    localized = result.proposal.localized_medications
    fallback_used = "llm_output_unparseable_or_empty=true" in note_blob
    llm_model_used = "llm_model_used=true" in note_blob
    medication_structure_complete = _medication_structure_complete(result.draft_plan.medications)
    raw_debug = _raw_llm_debug(notes)
    settings = get_settings()
    stage_rows = [
        {
            "stage": trace.stage_name.value if hasattr(trace.stage_name, "value") else str(trace.stage_name),
            "status": trace.status,
            "duration_ms": round(trace.duration_ms, 2),
            "detail": trace.detail,
        }
        for trace in result.stage_traces
    ]
    return {
        "request_id": result.request_id,
        "trace_id": result.trace_id,
        "total_duration_ms": total_ms,
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
            "kg_catalog_exists": Path(os.environ.get("KG_CATALOG_PATH") or settings.kg_catalog_path or "").exists()
            if (os.environ.get("KG_CATALOG_PATH") or settings.kg_catalog_path)
            else None,
        },
        "status": result.status,
        "blocked": result.blocked,
        "route_recommendation": result.snapshot.route_recommendation,
        "triage_recommendation": result.draft_plan.triage_recommendation,
        "route_debug": {
            "route_reason": result.snapshot.extracted_context.get("route_reason"),
            "blocking_reason": result.snapshot.extracted_context.get("blocking_reason"),
            "missing_critical_information": result.snapshot.extracted_context.get("missing_critical_information")
            or result.snapshot.missing_critical_information,
            "review_triggers": result.snapshot.extracted_context.get("review_triggers", []),
            "llm_level1_extraction": result.snapshot.extracted_context.get("llm_level1_extraction", {}),
        },
        "qwen_or_llm_model_used": llm_model_used,
        "llm_invoked": llm_model_used,
        "llm_output_parseable": bool(llm_model_used and not fallback_used and medication_structure_complete),
        "fallback_used": fallback_used,
        "final_plan_generated": bool(result.draft_plan.medications or localized),
        "medication_structure_complete": medication_structure_complete,
        "raw_llm_debug": raw_debug,
        "generation_notes": notes,
        "counts": {
            "normalized_symptoms": len(result.snapshot.normalized_symptoms),
            "suspected_conditions": len(result.snapshot.suspected_conditions),
            "vector_chunks": len(result.evidence.vector_chunks),
            "kg_facts": len(result.evidence.graph_facts),
            "local_products": len(result.evidence.local_products),
            "draft_medications": len(result.draft_plan.medications),
            "localized_medications": len(localized),
            "safety_findings": len(result.safety.findings),
            "critical_findings": result.safety.critical_count,
            "warning_findings": result.safety.warning_count,
        },
        "top_evidence": {
            "vector": result.evidence.vector_chunks[0].model_dump() if result.evidence.vector_chunks else None,
            "kg": result.evidence.graph_facts[0].model_dump() if result.evidence.graph_facts else None,
            "local": result.evidence.local_products[0].model_dump() if result.evidence.local_products else None,
        },
        "medications": [med.model_dump() for med in result.draft_plan.medications],
        "localized_medications": [item.model_dump() for item in localized],
        "safety_findings": [finding.model_dump() for finding in result.safety.findings],
        "stage_traces": stage_rows,
    }


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


if __name__ == "__main__":
    main()

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pathlib import Path as _Path
import json as _json

from apps.api.container import get_kg_retriever, get_local_formulary_client, get_tn_med_enrichment_client, get_tn_med_enrichment_retriever
from apps.api.deps import get_pipeline
from apps.api.schemas import (
    ClinicalAnalysisResponse,
    ClinicianFeedbackRequest,
    ClinicianFeedbackResponse,
    ConsultationRequest,
    EvidenceRetrievalResponse,
    FormularySearchResponse,
    KGSearchResponse,
    TNMedEnrichmentSearchResponse,
    LocalizationRequest,
    LocalizationResponse,
    PrescriptionDraftResponse,
    ValidationRequest,
)
from libs.contracts.execution import ClinicianReviewPacket
from libs.config import get_settings
from libs.contracts.safety import SafetyReport
from services.audit.repository import _json_safe
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever
from services.orchestration.pipeline import PrescriptionPipeline, _align_snapshot_with_execution_plan
from services.feedback.repository import ClinicianFeedbackRepository, build_feedback_event

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.post("/draft", response_model=PrescriptionDraftResponse)
def draft_prescription(
    request: ConsultationRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> PrescriptionDraftResponse:
    """Full CDSS flow: consultation + patient profile -> draft plan + safety + localization."""
    result = pipeline.draft(request.to_command())
    payload = _json_safe(result.model_dump(mode="python", warnings=False, fallback=_json_safe))
    return PrescriptionDraftResponse.model_validate(payload)


@router.post("/analyze", response_model=ClinicalAnalysisResponse)
def analyze_consultation(
    request: ConsultationRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> ClinicalAnalysisResponse:
    """Clinical analysis + deterministic safety planning, without retrieval/generation.

    Earlier versions returned Level-1 snapshot only; that made /analyze
    over-permissive in safety benchmarks because MedicalOrderExtraction,
    SafetyPolicyEngine and ExecutionPlanner were not executed. This endpoint now
    mirrors the pre-planning path used by /draft so route/display_route metrics
    can be evaluated without paying the retrieval/generation cost.
    """
    command = request.to_command()
    snapshot = pipeline.clinical_understanding.build_snapshot(command.patient, command.consultation)

    moe = None
    moe_payload: dict = {}
    moe_mode = (pipeline.config.medical_order_extraction_mode or "off").lower()
    if moe_mode != "off":
        moe = pipeline.medical_order_extractor.extract(snapshot)
        moe_payload = moe.model_dump(mode="json")

    policy_decision = None
    policy_payload: dict = {}
    policy_mode = (pipeline.config.safety_policy_mode or "off").lower()
    if policy_mode != "off":
        policy_decision = pipeline.safety_policy_engine.evaluate(snapshot, medical_orders=moe)
        policy_payload = policy_decision.model_dump(mode="json")

    execution_plan = pipeline.execution_planner.plan(snapshot, medical_orders=moe, policy_decision=policy_decision)
    snapshot = _align_snapshot_with_execution_plan(snapshot, execution_plan)
    blocked = (
        execution_plan.allowed_to_generate is False
        or execution_plan.route in {"review", "emergency", "non_pharma", "blocked"}
    ) and execution_plan.sub_route != "review_draft_allowed"
    blocked_reasons = []
    if execution_plan.block_reason:
        blocked_reasons.append(execution_plan.block_reason)
    if policy_decision is not None and getattr(policy_decision, "reason_code", None):
        blocked_reasons.append(str(policy_decision.reason_code))

    payload = {
        "snapshot": snapshot,
        "route": execution_plan.route,
        "display_route": execution_plan.display_route or execution_plan.sub_route,
        "sub_route": execution_plan.sub_route,
        "blocked": blocked,
        "review_required": execution_plan.route in {"review", "emergency", "blocked"},
        "blocked_reasons": list(dict.fromkeys(blocked_reasons)),
        "medical_order_extraction": moe_payload,
        "policy_decision": policy_payload,
        "execution_plan": execution_plan.model_dump(mode="json"),
    }
    return ClinicalAnalysisResponse.model_validate(_json_safe(payload))


@router.post("/evidence", response_model=EvidenceRetrievalResponse)
def retrieve_evidence(
    request: ConsultationRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> EvidenceRetrievalResponse:
    """Level 1 + retrieval only: inspect vector/KG/local evidence before generation."""
    command = request.to_command()
    snapshot = pipeline.clinical_understanding.build_snapshot(command.patient, command.consultation)
    evidence = pipeline.retrieval.build_evidence(snapshot, pipeline.config)
    return EvidenceRetrievalResponse(snapshot=snapshot, evidence=evidence)


@router.post("/validate", response_model=SafetyReport)
def validate_prescription(
    request: ValidationRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> SafetyReport:
    """Validate an already-built therapeutic plan against the patient profile."""
    command = request.to_command()
    snapshot = pipeline.clinical_understanding.build_snapshot(command.patient, consultation=None)
    return pipeline.safety.validate(snapshot, command.plan)


@router.post("/localize", response_model=LocalizationResponse)
def localize_prescription(
    request: LocalizationRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> LocalizationResponse:
    """Map a generic therapeutic plan to local Tunisian formulary/AMM candidates."""
    command = request.to_command()
    localized = pipeline.localization.localize(command.plan, command.evidence)
    return LocalizationResponse(localized_medications=localized)


@router.get("/formulary/search", response_model=FormularySearchResponse)
def search_formulary(
    query: str = Query(..., min_length=2, description="Drug, DCI, brand, form, or indication query."),
    limit: int = Query(10, ge=1, le=50),
) -> FormularySearchResponse:
    """Search local Tunisian formulary candidates without running the full prescription pipeline."""
    retriever = LocalFormularyRetriever(client=get_local_formulary_client())
    return FormularySearchResponse(query=query, products=retriever.retrieve(query, limit=limit))


@router.get("/tn-med/search", response_model=TNMedEnrichmentSearchResponse)
def search_tn_med_enrichment(
    query: str = Query(..., min_length=2, description="TN Med product, DCI, or AMM query."),
    limit: int = Query(5, ge=1, le=25),
) -> TNMedEnrichmentSearchResponse:
    """Search TN Med DB v1 structured enrichment without running the full pipeline.

    The endpoint is intentionally defensive because it is used in Kaggle/offline
    diagnostics. It must not crash when TN Med is missing or when SQLite rows
    contain non-JSON-native values.
    """
    client = get_tn_med_enrichment_client()
    retriever = get_tn_med_enrichment_retriever()
    available = bool(client.is_available())

    if not available:
        return TNMedEnrichmentSearchResponse(query=query, chunks=[], profiles=[], available=False)

    try:
        profiles = client.search(query, limit=limit)
    except Exception as exc:
        profiles = [{
            "error": "tn_med_client_search_failed",
            "message": str(exc),
            "db_path": str(getattr(client, "db_path", "") or ""),
        }]

    try:
        chunks = retriever.retrieve(query, limit=limit) if retriever is not None else []
    except Exception as exc:
        chunks = []
        profiles.append({
            "warning": "tn_med_retriever_failed",
            "message": str(exc),
        })

    # FastAPI/Pydantic usually serializes EvidenceChunk and dictionaries, but
    # SQLite-derived rows can contain values such as bytes/NaN. Reuse the audit
    # JSON sanitizer already present in the project.
    try:
        safe_profiles = _json_safe(profiles)
    except Exception:
        safe_profiles = profiles

    return TNMedEnrichmentSearchResponse(
        query=query,
        chunks=chunks,
        profiles=safe_profiles,
        available=available,
    )


@router.get("/kg/search", response_model=KGSearchResponse)
def search_kg(
    query: str = Query(..., min_length=2, description="Clinical KG query."),
    limit: int = Query(10, ge=1, le=50),
    route: str | None = Query(None, description="Optional route filter, e.g. prescription, safety, review."),
    disease: str | None = Query(None, description="Optional disease/context filter."),
    source_mode: str = Query(
        "primary_plus_backups",
        description="Diagnostic source mode: primary_only, backup_only, primary_plus_backups, primary_plus_all_backups.",
    ),
) -> KGSearchResponse:
    """Search KG facts for debugging and evidence inspection."""
    filters = {k: v for k, v in {"route": route, "disease": disease}.items() if v}
    retrieval_query = query
    if filters:
        from libs.contracts.evidence import RetrievalQuery
        retrieval_query = RetrievalQuery(source="kg", text=query, limit=limit, filters=filters)
    facts = get_kg_retriever().retrieve(retrieval_query, limit=limit, source_mode=source_mode)
    return KGSearchResponse(query=query, facts=facts)


@router.get("/audit/{trace_id}", response_model=PrescriptionDraftResponse)
def get_audit_record(
    trace_id: str,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> PrescriptionDraftResponse:
    result = pipeline.audit.fetch(trace_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No audit record found for trace_id={trace_id}")
    return PrescriptionDraftResponse.model_validate(result.model_dump())


@router.get("/audit/{trace_id}/review-packet", response_model=ClinicianReviewPacket)
def get_review_packet(
    trace_id: str,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> ClinicianReviewPacket:
    result = pipeline.audit.fetch(trace_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No audit record found for trace_id={trace_id}")
    return ClinicianReviewPacket(
        request_id=result.request_id,
        snapshot=result.snapshot,
        evidence=result.evidence,
        proposal=result.proposal,
        safety=result.safety,
        notes=[
            "Draft must be reviewed and approved by a qualified clinician.",
            "Clinical deployment requires signed governance approvals and validation reports; runtime logic uses Tunisia KG/VS/AMM assets with conservative fallback guardrails.",
        ],
    )



@router.post("/{trace_id}/feedback", response_model=ClinicianFeedbackResponse)
def submit_prescription_feedback(
    trace_id: str,
    request: ClinicianFeedbackRequest,
    pipeline: PrescriptionPipeline = Depends(get_pipeline),
) -> ClinicianFeedbackResponse:
    """Store structured clinician feedback for offline evaluation and governance.

    Feedback is never used for live automatic retraining.  Approvals are positive
    signals, edits are high-value supervised signals, and rejections require
    reason codes so safety/routing/retrieval/localization failures can be
    analyzed offline before any model, prompt, rule, or data change is deployed.
    """
    record = pipeline.audit.fetch(trace_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No audit record found for trace_id={trace_id}")
    settings = get_settings()
    event = build_feedback_event(
        trace_id=trace_id,
        request=request,
        record=record,
        model_version=settings.generation_model or settings.llm_model or "unknown",
        runtime_config_version="patch12_ready_eval",
        evidence_version=settings.vector_corpus_path or "unknown",
    )
    saved = ClinicianFeedbackRepository(settings.feedback_dir, backend=getattr(settings, "feedback_backend", "jsonl")).save(event)
    storage_path = saved.pop("_storage_path", None)
    return ClinicianFeedbackResponse(ok=True, trace_id=trace_id, event=saved, storage_path=storage_path)

# --- Backward-compatible clinician workflow endpoints --------------------------
# Legacy approve/reject/revise endpoints are kept as thin wrappers, but they now
# write the same structured clinician feedback event as /feedback so learning
# analytics cannot be bypassed.
from pydantic import BaseModel as _BaseModel, Field as _Field
from libs.contracts.feedback import ClinicianFeedbackRequest as _FeedbackRequest, FieldEdit as _FieldEdit


class ClinicianDecisionRequest(_BaseModel):
    clinician_id: str
    decision: str | None = None
    notes: str | None = None
    reason: str | None = None
    reason_codes: list[str] = _Field(default_factory=list)


class RevisionRequest(_BaseModel):
    clinician_id: str
    notes: str | None = None
    requested_changes: dict = _Field(default_factory=dict)
    reason_codes: list[str] = _Field(default_factory=list)


def _structured_feedback_response(trace_id: str, feedback_request: _FeedbackRequest, pipeline: PrescriptionPipeline) -> dict:
    record = pipeline.audit.fetch(trace_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No audit record found for trace_id={trace_id}")
    settings = get_settings()
    event = build_feedback_event(
        trace_id=trace_id,
        request=feedback_request,
        record=record,
        model_version=settings.generation_model or settings.llm_model or "unknown",
        runtime_config_version="patch12_ready_eval",
        evidence_version=settings.vector_corpus_path or "unknown",
    )
    saved = ClinicianFeedbackRepository(settings.feedback_dir, backend=getattr(settings, "feedback_backend", "jsonl")).save(event)
    storage_path = saved.pop("_storage_path", None)
    return {"ok": True, "trace_id": trace_id, "event": saved, "storage_path": storage_path, "deprecated_endpoint": True}


@router.get("/{trace_id}")
def get_prescription_record(trace_id: str, pipeline: PrescriptionPipeline = Depends(get_pipeline)) -> dict:
    """Fetch an audited pipeline execution by trace_id."""
    record = pipeline.audit.fetch(trace_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Trace not found in audit repository.")
    return _json_safe(record.model_dump(mode="python", warnings=False, fallback=_json_safe))

@router.post("/{trace_id}/approve")
def approve_prescription(trace_id: str, request: ClinicianDecisionRequest, pipeline: PrescriptionPipeline = Depends(get_pipeline)) -> dict:
    feedback = _FeedbackRequest(
        clinician_id=request.clinician_id,
        decision="approved_as_is",
        clinician_notes=request.notes,
        reason_codes=request.reason_codes,
    )
    return _structured_feedback_response(trace_id, feedback, pipeline)

@router.post("/{trace_id}/reject")
def reject_prescription(trace_id: str, request: ClinicianDecisionRequest, pipeline: PrescriptionPipeline = Depends(get_pipeline)) -> dict:
    reason_codes = request.reason_codes or ([request.reason] if request.reason else [])
    feedback = _FeedbackRequest(
        clinician_id=request.clinician_id,
        decision="rejected",
        reason_codes=reason_codes,
        clinician_notes=request.notes or request.reason,
    )
    return _structured_feedback_response(trace_id, feedback, pipeline)

@router.post("/{trace_id}/revise")
def revise_prescription(trace_id: str, request: RevisionRequest, pipeline: PrescriptionPipeline = Depends(get_pipeline)) -> dict:
    notes = request.notes or (f"Requested changes: {request.requested_changes}" if request.requested_changes else None)
    feedback = _FeedbackRequest(
        clinician_id=request.clinician_id,
        decision="revise_requested",
        reason_codes=request.reason_codes,
        clinician_notes=notes,
        field_edits=[_FieldEdit(field=str(k), new_value=v, reason="legacy_revise_requested") for k, v in (request.requested_changes or {}).items()],
    )
    return _structured_feedback_response(trace_id, feedback, pipeline)

@router.get("/patient/{patient_id}/history")
def patient_prescription_history(patient_id: str) -> dict:
    if not getattr(get_settings(), "enable_debug_patient_history", False):
        raise HTTPException(status_code=404, detail="Patient history debug endpoint is disabled by default.")
    audit_dir = _Path(get_settings().audit_dir or "data/audit")
    records = []
    if audit_dir.exists():
        for path in audit_dir.glob("*.json"):
            try:
                payload = _json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            pid = (((payload.get("snapshot") or {}).get("patient") or {}).get("patient_id"))
            if pid == patient_id:
                records.append({
                    "trace_id": payload.get("trace_id"),
                    "request_id": payload.get("request_id"),
                    "status": payload.get("status"),
                    "blocked": payload.get("blocked"),
                    "created_at": payload.get("created_at"),
                    "route": (((payload.get("snapshot") or {}).get("route_recommendation"))),
                })
    return {"patient_id": patient_id, "count": len(records), "records": records}


from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from libs.config import get_settings
from services.audit.repository import _json_safe
from services.feedback.repository import ClinicianFeedbackRepository

router = APIRouter(prefix="/feedback", tags=["feedback"] )


def _hash_payload(value: Any) -> str:
    payload = json.dumps(_json_safe(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _decision_from_action(action: str) -> str:
    key = (action or "").strip().lower().replace("-", "_").replace(" ", "_")
    return {
        "approved": "approved_as_is",
        "approve": "approved_as_is",
        "accepted": "approved_as_is",
        "corrected": "approved_with_edits",
        "edited": "approved_with_edits",
        "modified": "approved_with_edits",
        "rejected": "rejected",
        "reject": "rejected",
        "revise": "revise_requested",
        "revision_requested": "revise_requested",
        "more_info": "more_info_requested",
    }.get(key, "approved_with_edits" if key else "more_info_requested")


class ClinicianFeedbackEndpointRequest(BaseModel):
    trace_id: str = Field(..., min_length=1)
    doctor_id: str | None = None
    clinician_id: str | None = None
    action: str = "corrected"
    original_draft: dict[str, Any] = Field(default_factory=dict)
    corrected_draft: dict[str, Any] | None = None
    reason: str | None = None
    reason_codes: list[str] = Field(default_factory=list)


@router.post("/clinician")
def submit_clinician_feedback(request: ClinicianFeedbackEndpointRequest) -> dict[str, Any]:
    """Record clinician-in-the-loop feedback without mutating runtime behavior.

    This endpoint is intentionally lightweight for notebook/API tests and pilot
    dashboards. Rich feedback tied to a stored prescription trace remains
    available at /v1/prescriptions/{trace_id}/feedback.
    """
    settings = get_settings()
    clinician_id = request.clinician_id or request.doctor_id or "unknown"
    corrected = request.corrected_draft if request.corrected_draft is not None else request.original_draft
    decision = _decision_from_action(request.action)
    field_edits = []
    if decision == "approved_with_edits":
        field_edits.append({
            "field": "$",
            "old_value": request.original_draft,
            "new_value": corrected,
            "reason": request.reason or "clinical correction",
        })
    event = {
        "schema_version": "clinician_feedback.endpoint.v1",
        "trace_id": request.trace_id,
        "request_id": request.trace_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "clinician_id": clinician_id,
        "decision": decision,
        "reason_codes": request.reason_codes,
        "field_edits": field_edits,
        "clinician_notes": request.reason,
        "draft_hash": _hash_payload(request.original_draft),
        "final_plan_hash": _hash_payload(corrected),
        "feedback_use_policy": "offline_evaluation_only",
        "live_retraining_allowed": False,
        "doctor_final_validation_required": True,
        "learning_signal": {
            "approved_as_is": decision == "approved_as_is",
            "edited": decision == "approved_with_edits",
            "rejected": decision == "rejected",
            "incomplete_decision": decision in {"revise_requested", "more_info_requested"},
        },
    }
    saved = ClinicianFeedbackRepository(settings.feedback_dir, backend=getattr(settings, "feedback_backend", "jsonl")).save(event)
    storage_path = saved.pop("_storage_path", None)
    return {"ok": True, "trace_id": request.trace_id, "event": saved, "storage_path": storage_path}

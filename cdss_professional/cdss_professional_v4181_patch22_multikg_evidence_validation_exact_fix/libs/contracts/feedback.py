from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from libs.contracts.prescription import FinalReviewedPlan

FeedbackDecision = Literal[
    "approved_as_is",
    "approved_with_edits",
    "rejected",
    "revise_requested",
    "more_info_requested",
]

KNOWN_REASON_CODES = {
    "unsafe_medication",
    "wrong_diagnosis",
    "wrong_dose",
    "wrong_duration",
    "wrong_route",
    "wrong_frequency",
    "contraindication_missed",
    "allergy_missed",
    "pregnancy_risk_missed",
    "renal_adjustment_missed",
    "hepatic_adjustment_missed",
    "bad_local_product",
    "insufficient_evidence",
    "not_indicated",
    "missing_patient_info",
    "emergency_case_should_not_prescribe",
    "non_pharma_case_should_not_prescribe",
    "overprescribing",
    "monitoring_missing",
    "medication_added",
    "medication_removed",
    "dose_changed",
    "duration_changed",
    "route_changed",
    "local_product_changed",
}

_DECISION_ALIASES = {
    "approve": "approved_as_is",
    "approved": "approved_as_is",
    "approved": "approved_as_is",
    "accepted": "approved_as_is",
    "accept": "approved_as_is",
    "edit": "approved_with_edits",
    "edited": "approved_with_edits",
    "approve_with_edits": "approved_with_edits",
    "approved_with_edit": "approved_with_edits",
    "reject": "rejected",
    "rejected": "rejected",
    "revise": "revise_requested",
    "revision_requested": "revise_requested",
    "request_revision": "revise_requested",
    "more_info": "more_info_requested",
    "request_more_information": "more_info_requested",
    "more_information_requested": "more_info_requested",
}


class FieldEdit(BaseModel):
    field: str = Field(..., min_length=1, description="JSON-like path, e.g. medications[0].dose")
    old_value: Any | None = None
    new_value: Any | None = None
    reason: str | None = None
    reason_code: str | None = None

    @model_validator(mode="after")
    def validate_reason_code(self):
        if self.reason_code and self.reason_code not in KNOWN_REASON_CODES:
            raise ValueError(f"Unknown field edit reason_code: {self.reason_code}")
        return self


class ClinicianFeedbackRequest(BaseModel):
    clinician_id: str = Field(..., min_length=1)
    decision: FeedbackDecision
    final_plan: FinalReviewedPlan | None = None
    reason_codes: list[str] = Field(default_factory=list)
    field_edits: list[FieldEdit] = Field(default_factory=list)
    clinician_notes: str | None = None
    safety_override: bool = False
    evidence_rating: int | None = Field(default=None, ge=1, le=5)

    @model_validator(mode="before")
    @classmethod
    def normalize_decision_aliases(cls, data):
        if isinstance(data, dict):
            out = dict(data)
            raw = out.get("decision")
            if isinstance(raw, str):
                key = raw.strip().lower().replace(" ", "_").replace("-", "_")
                out["decision"] = _DECISION_ALIASES.get(key, key)
            return out
        return data

    @model_validator(mode="after")
    def validate_decision_payload(self):
        unknown_reason_codes = [code for code in self.reason_codes if code not in KNOWN_REASON_CODES]
        if unknown_reason_codes:
            raise ValueError(f"Unknown feedback reason_codes: {unknown_reason_codes}")
        if self.decision == "rejected" and not self.reason_codes:
            raise ValueError("Rejected feedback requires at least one reason code.")
        if self.decision == "approved_as_is" and (self.field_edits or self.final_plan is not None):
            # Approval with a final plan or field edits is a stronger learning signal;
            # normalize instead of silently losing edit information.
            self.decision = "approved_with_edits"  # type: ignore[misc]
        if self.decision == "approved_with_edits" and not (self.field_edits or self.final_plan):
            raise ValueError("approved_with_edits requires final_plan and/or field_edits.")
        if self.decision in {"revise_requested", "more_info_requested"} and not (self.reason_codes or self.clinician_notes):
            raise ValueError("Revision/more-info feedback should include notes or reason codes.")
        return self


class ClinicianFeedbackResponse(BaseModel):
    ok: bool = True
    trace_id: str
    event: dict[str, Any]
    storage_path: str | None = None

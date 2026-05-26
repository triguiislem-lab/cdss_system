from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictClinicalBaseModel(BaseModel):
    """Base contract for model-to-model clinical payloads.

    Runtime API payloads may stay permissive, but contracts exchanged between
    LLM, planner, validator and audit should be strict enough to fail closed.
    """

    model_config = ConfigDict(extra="forbid")


class ClinicalSpanV1(StrictClinicalBaseModel):
    text: str = ""
    canonical: str = ""
    present: bool = True
    negated: bool = False
    uncertain: bool = False
    provenance_turns: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ClinicalFactsV1(StrictClinicalBaseModel):
    schema_version: Literal["ClinicalFactsV1"] = "ClinicalFactsV1"
    symptoms: list[ClinicalSpanV1] = Field(default_factory=list)
    conditions: list[ClinicalSpanV1] = Field(default_factory=list)
    red_flags: list[ClinicalSpanV1] = Field(default_factory=list)
    risks: list[ClinicalSpanV1] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MedicationEventV1(StrictClinicalBaseModel):
    description: str
    ingredient: str = ""
    brand: str = ""
    status: Literal[
        "doctor_ordered",
        "doctor_authorized",
        "patient_requested_not_authorized",
        "already_taken",
        "current_medication",
        "not_currently_taking",
        "historical",
        "negated_or_avoid",
        "mentioned_only",
        "unknown",
    ] = "unknown"
    source: Literal["doctor", "patient", "system", "unknown"] = "unknown"
    doctor_authorized: bool = False
    include_as_order: bool = False
    quantity: float | None = None
    unit: str = ""
    strength: str = ""
    frequency: str = ""
    time_window: str = ""
    reason: str = ""
    provenance_turns: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def enforce_order_authorization(self):
        if self.status in {"doctor_ordered", "doctor_authorized"} and self.source == "doctor":
            self.include_as_order = True
            self.doctor_authorized = True
        if self.status in {"patient_requested_not_authorized", "already_taken", "historical", "negated_or_avoid", "not_currently_taking", "mentioned_only"}:
            self.include_as_order = False
        return self


class MedicalOrderV1(StrictClinicalBaseModel):
    description: str
    order_type: Literal["medication", "lab", "imaging", "follow_up", "other"]
    reason: str = ""
    provenance_turns: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MedicalOrdersV1(StrictClinicalBaseModel):
    schema_version: Literal["MedicalOrdersV1"] = "MedicalOrdersV1"
    medication_events: list[MedicationEventV1] = Field(default_factory=list)
    orders: list[MedicalOrderV1] = Field(default_factory=list)
    excluded_mentions: list[dict[str, Any]] = Field(default_factory=list)
    self_check: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class VitalSignsV1(BaseModel):
    model_config = ConfigDict(extra="ignore")

    temperature_c: float | None = Field(default=None, ge=25, le=45)
    systolic_bp: int | None = Field(default=None, ge=40, le=300)
    diastolic_bp: int | None = Field(default=None, ge=20, le=200)
    spo2: float | None = Field(default=None, ge=0, le=100)
    heart_rate: int | None = Field(default=None, ge=0, le=300)
    respiratory_rate: int | None = Field(default=None, ge=0, le=100)


class PatientRiskContextV1(BaseModel):
    model_config = ConfigDict(extra="ignore")

    egfr: float | None = Field(default=None, ge=0, le=200)
    creatinine_value: float | None = Field(default=None, ge=0)
    creatinine_unit: str | None = None
    creatinine_date: str | None = None
    pregnancy_status: Literal["pregnant", "not_pregnant", "unknown", "uncertain"] = "unknown"
    gestational_age_weeks: float | None = Field(default=None, ge=0, le=45)
    pregnancy_uncertain: bool | None = None
    vitals: VitalSignsV1 = Field(default_factory=VitalSignsV1)
    pain_score: float | None = Field(default=None, ge=0, le=10)
    symptom_severity: Literal["mild", "moderate", "severe", "unknown"] = "unknown"
    pediatric_age_months: int | None = Field(default=None, ge=0, le=216)
    pediatric_weight_source: str | None = None
    structured_history: list[str] = Field(default_factory=list)


class ExecutionPlanV1(StrictClinicalBaseModel):
    schema_version: Literal["ExecutionPlanV1"] = "ExecutionPlanV1"
    route: Literal["prescription", "review", "emergency", "non_pharma", "blocked"]
    display_route: Literal["draft_prescription", "review_blocked", "review_draft_allowed", "missing_info", "emergency", "non_pharma", "blocked"]
    allowed_to_generate: bool
    target_ingredients: list[str] = Field(default_factory=list)
    forbidden_ingredients: list[str] = Field(default_factory=list)
    missing_critical_information: list[str] = Field(default_factory=list)
    policy_rule_ids: list[str] = Field(default_factory=list)
    planner_reason: str


class EvidenceRefV1(StrictClinicalBaseModel):
    evidence_id: str = ""
    source: str = ""
    section: str = ""
    active_ingredient: str = ""
    excerpt: str = ""


class EvidenceBundleV1(StrictClinicalBaseModel):
    schema_version: Literal["EvidenceBundleV1"] = "EvidenceBundleV1"
    evidence: list[EvidenceRefV1] = Field(default_factory=list)
    local_product_candidates: list[dict[str, Any]] = Field(default_factory=list)
    evidence_confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MedicationDraftV1(StrictClinicalBaseModel):
    active_ingredient: str
    indication: str
    dose: str
    frequency: str
    duration: str
    route: str = "oral"
    rationale: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    safety_considerations: list[str] = Field(default_factory=list)

    @field_validator("active_ingredient", "dose", "frequency", "duration", "route")
    @classmethod
    def required_string(cls, value: str) -> str:
        value = str(value or "").strip()
        if not value or value.lower() in {"unknown", "unspecified", "tbd", "to confirm"}:
            raise ValueError("Medication draft fields must be explicit; unsafe unknown values are not allowed.")
        return value


class PrescriptionDraftV1(StrictClinicalBaseModel):
    schema_version: Literal["PrescriptionDraftV1"] = "PrescriptionDraftV1"
    problem_summary: str
    triage: Literal["draft_prescription", "review_draft_allowed", "review_blocked", "emergency", "non_pharma", "missing_info"]
    medications: list[MedicationDraftV1] = Field(default_factory=list)
    non_drug_recommendations: list[str] = Field(default_factory=list)
    monitoring: list[str] = Field(default_factory=list)
    missing_questions: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    clinician_review_required: bool = True
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def no_medications_when_blocked(self):
        if self.triage in {"review_blocked", "emergency", "non_pharma", "missing_info"} and self.medications:
            raise ValueError("Blocked/non-pharma/missing-info triage must not contain medication drafts.")
        return self


class SafetyValidationV1(StrictClinicalBaseModel):
    schema_version: Literal["SafetyValidationV1"] = "SafetyValidationV1"
    safe: bool
    findings: list[str] = Field(default_factory=list)
    removed_medications: list[str] = Field(default_factory=list)
    validator_mode: Literal["enforce", "audit", "off"] = "enforce"


class ClinicianReviewV1(StrictClinicalBaseModel):
    schema_version: Literal["ClinicianReviewV1"] = "ClinicianReviewV1"
    summary: str
    reasons: list[str] = Field(default_factory=list)
    required_actions: list[str] = Field(default_factory=list)
    final_validation_required: bool = True


class AuditEventV1(StrictClinicalBaseModel):
    schema_version: Literal["AuditEventV1"] = "AuditEventV1"
    event_type: str
    trace_id: str = ""
    timestamp: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

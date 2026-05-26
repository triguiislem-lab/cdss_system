from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


MentionStatus = Literal[
    "requested_not_authorized",
    "already_taken",
    "not_currently_taking",
    "mentioned_not_authorized",
    "authorized",
    "historical",
    "negated_or_avoid",
    "unknown",
]
MentionSource = Literal[
    "patient_request",
    "already_taken",
    "not_currently_taking",
    "doctor_mentioned",
    "doctor_authorized",
    "historical_medication",
    "negated_or_avoid",
    "unknown",
]


class ClinicalMention(BaseModel):
    """Structured fact extracted from the consultation.

    These mentions intentionally carry provenance-like metadata so downstream
    planners can distinguish patient requests, current treatments, doctor
    authorization, and negated/avoid statements.
    """

    text: str
    canonical: str
    category: str
    status: MentionStatus = "unknown"
    source: MentionSource = "unknown"
    source_text: str | None = None
    start: int | None = None
    end: int | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class TherapeuticClassMention(ClinicalMention):
    canonical_class: str
    candidate_policy: Literal["planner_required", "review_required", "no_candidate", "unknown"] = "planner_required"
    default_strategy: str | None = None


class MedicalOrder(BaseModel):
    description: str
    order_type: Literal["medication", "lab", "imaging", "followup", "other"]
    medication: str | None = None
    source: MentionSource = "unknown"
    authorization_status: MentionStatus = "unknown"
    reason: str | None = None
    provenance: list[int] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    product_name: str | None = None
    strength: str | None = None
    route: str | None = None
    source_text: str | None = None
    start: int | None = None
    end: int | None = None


class MedicalOrderExtractionResult(BaseModel):
    orders: list[MedicalOrder] = Field(default_factory=list)
    medication_mentions: list[MedicalOrder] = Field(default_factory=list)
    therapeutic_class_mentions: list[TherapeuticClassMention] = Field(default_factory=list)
    symptom_mentions: list[ClinicalMention] = Field(default_factory=list)
    risk_mentions: list[ClinicalMention] = Field(default_factory=list)
    red_flag_mentions: list[ClinicalMention] = Field(default_factory=list)
    requested_medications: list[str] = Field(default_factory=list)
    already_taken_medications: list[str] = Field(default_factory=list)
    authorized_medications: list[str] = Field(default_factory=list)
    requested_therapeutic_classes: list[str] = Field(default_factory=list)
    authorized_therapeutic_classes: list[str] = Field(default_factory=list)
    case_type: Literal[
        "explicit_medicine",
        "therapeutic_class_only",
        "symptom_only",
        "mixed",
        "emergency",
        "unclear",
    ] = "unclear"
    extraction_conflicts: list[str] = Field(default_factory=list)
    # Backward-compatible legacy field: should contain only missing patient data.
    # Safety screens are kept separately so UI/review logic does not treat
    # contraindication checks as facts that are literally missing from the history.
    missing_critical_information: list[str] = Field(default_factory=list)
    required_patient_data: list[str] = Field(default_factory=list)
    required_safety_screens: list[str] = Field(default_factory=list)
    forbidden_ingredients: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    diagnostics: dict[str, Any] = Field(default_factory=dict)

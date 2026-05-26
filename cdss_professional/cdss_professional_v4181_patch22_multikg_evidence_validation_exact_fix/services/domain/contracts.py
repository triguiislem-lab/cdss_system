from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field
from services.domain.allergy_evidence import AllergyEvidence, EvidencePolarity


RouteName = Literal["prescription", "review", "emergency", "non_pharma", "blocked"]
DisplayRouteName = Literal["draft_prescription", "review_blocked", "review_draft_allowed", "missing_info", "emergency", "non_pharma", "blocked"]


class BusinessMissingInformation(BaseModel):
    """Business interpretation of missing data.

    The parser and Qwen extractor may surface many unknowns.  This contract
    separates unknowns that truly block generation from audit-only unknowns that
    should be shown to the clinician but should not force a safe low-risk case
    into missing_info.
    """

    blocking: list[str] = Field(default_factory=list)
    informative: list[str] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)


class MedicationAuthorizationAssessment(BaseModel):
    patient_requested_not_authorized: list[str] = Field(default_factory=list)
    doctor_authorized: list[str] = Field(default_factory=list)
    already_taken: list[str] = Field(default_factory=list)
    negated_or_historical: list[str] = Field(default_factory=list)
    forbidden_by_extraction: list[str] = Field(default_factory=list)
    has_only_non_actionable_mentions: bool = False


class RouteDecision(BaseModel):
    route: RouteName
    display_route: DisplayRouteName
    allowed_to_generate: bool
    clinician_review_required: bool = True
    generation_block_reason: str | None = None
    block_reasons: list[str] = Field(default_factory=list)
    required_patient_data: list[str] = Field(default_factory=list)
    required_safety_screens: list[str] = Field(default_factory=list)
    forbidden_ingredients: list[str] = Field(default_factory=list)

    allergy_evidence: list[AllergyEvidence] = Field(default_factory=list)
    allergy_forbidden_ingredients: list[str] = Field(default_factory=list)
    target_ingredients: list[str] = Field(default_factory=list)
    review_draft_allowed: bool = False
    missing_information: BusinessMissingInformation = Field(default_factory=BusinessMissingInformation)
    business_rule_ids: list[str] = Field(default_factory=list)
    audit: dict[str, Any] = Field(default_factory=dict)


class BusinessInputs(BaseModel):
    candidate_route: str = "review"
    candidate_targets: list[str] = Field(default_factory=list)
    candidate_forbidden: list[str] = Field(default_factory=list)
    candidate_missing: list[str] = Field(default_factory=list)
    required_safety_screens: list[str] = Field(default_factory=list)
    review_draft_allowed: bool = False
    candidate_route_reason: str | None = None


class BusinessDecision(RouteDecision):
    """Canonical business decision contract.

    RouteDecision remains as a backward-compatible name for existing callers;
    BusinessDecision is the single source of truth consumed by planning and API
    layers. Every medication output is a draft requiring clinician validation.
    """

    clinician_review_required: bool = True

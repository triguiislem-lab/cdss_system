from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ClinicalActionType = Literal[
    "prescription",
    "clinician_review",
    "emergency_escalation",
    "non_pharmacological",
    "missing_information",
    "blocked",
]


class ClinicalActionProposal(BaseModel):
    """Doctor-facing action object for every route, including no-prescription routes.

    PrescriptionProposal answers "what medication draft was produced?".
    ClinicalActionProposal answers "what should the clinician do next, and why?".
    """

    proposal_type: ClinicalActionType
    route: str
    allowed_to_generate_prescription: bool
    summary: str
    risk_detected: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    forbidden_ingredients: list[str] = Field(default_factory=list)
    safety_explanations: list[str] = Field(default_factory=list)
    evidence_summary: dict[str, Any] = Field(default_factory=dict)
    policy_hits: list[dict[str, Any]] = Field(default_factory=list)
    prescription: Any | None = None
    audit: dict[str, Any] = Field(default_factory=dict)
    doctor_final_decision_required: bool = True

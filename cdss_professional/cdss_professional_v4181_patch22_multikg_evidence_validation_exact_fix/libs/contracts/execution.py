from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field
from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import PrescriptionProposal, TherapeuticPlan
from libs.contracts.safety import SafetyReport
from libs.contracts.clinical_action import ClinicalActionProposal

class WorkflowStage(str, Enum):
    CLINICAL_UNDERSTANDING = 'clinical_understanding'
    MEDICAL_ORDER_EXTRACTION = 'medical_order_extraction'
    SAFETY_POLICY = 'safety_policy'
    EXECUTION_PLANNING = 'execution_planning'
    RETRIEVAL = 'retrieval'
    GENERATION = 'generation'
    SAFETY = 'safety'
    LOCALIZATION = 'localization'
    AUDIT = 'audit'

class ExecutionPlan(BaseModel):
    route: Literal['prescription', 'review', 'emergency', 'non_pharma', 'blocked']
    allowed_to_generate: bool
    # User-facing route clarifies that generated prescriptions are drafts only.
    display_route: str | None = None
    sub_route: Literal['draft_prescription', 'review_blocked', 'review_draft_allowed', 'missing_info', 'emergency', 'non_pharma', 'blocked'] | None = None
    finalization_status: str = 'doctor_validation_required'
    required_modules: list[str] = Field(default_factory=list)
    vector_queries: list[str] = Field(default_factory=list)
    kg_queries: list[str] = Field(default_factory=list)
    formulary_queries: list[str] = Field(default_factory=list)
    target_ingredients: list[str] = Field(default_factory=list)
    target_indications: list[str] = Field(default_factory=list)
    forbidden_ingredients: list[str] = Field(default_factory=list)
    # Patch 4 audit split: forbidden_ingredients remains a backward-compatible
    # union for blocked routes. true_forbidden_ingredients contains only
    # explicit/policy contraindicated ingredients; blocked_candidate_ingredients
    # are candidates withheld because the route is review/emergency/non-pharma.
    true_forbidden_ingredients: list[str] = Field(default_factory=list)
    blocked_candidate_ingredients: list[str] = Field(default_factory=list)
    candidates_requiring_review: list[str] = Field(default_factory=list)
    target_route: str | None = None
    target_strength: str | None = None
    target_dose: str | None = None
    target_form: str | None = None
    therapeutic_intent: str | None = None
    required_safety_checks: list[str] = Field(default_factory=list)
    localization_required: bool = False
    block_reason: str | None = None
    # Backward-compatible legacy field: unresolved patient data/questions.
    missing_critical_information: list[str] = Field(default_factory=list)
    required_patient_data: list[str] = Field(default_factory=list)
    required_safety_screens: list[str] = Field(default_factory=list)
    policy_hits: list[dict[str, Any]] = Field(default_factory=list)
    policy_audit: dict[str, Any] = Field(default_factory=dict)
    medical_order_audit: dict[str, Any] = Field(default_factory=dict)
    post_generation_validation_audit: dict[str, Any] = Field(default_factory=dict)
    activation_flags: dict[str, Any] = Field(default_factory=dict)
    planner_reason: str

class StageTrace(BaseModel):
    stage_name: WorkflowStage
    status: Literal['ok', 'error', 'skipped']
    duration_ms: float = Field(ge=0)
    detail: str | None = None

class ClinicianReviewPacket(BaseModel):
    request_id: str
    snapshot: PatientSnapshot
    evidence: EvidenceBundle
    proposal: PrescriptionProposal
    safety: SafetyReport
    notes: list[str] = Field(default_factory=list)

class PipelineExecutionRecord(BaseModel):
    request_id: str
    snapshot: PatientSnapshot
    evidence: EvidenceBundle
    draft_plan: TherapeuticPlan
    safety: SafetyReport
    proposal: PrescriptionProposal
    trace_id: str
    stage_traces: list[StageTrace] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    blocked: bool = False
    status: Literal['blocked', 'ready_for_review'] = 'ready_for_review'
    doctor_final_validation_required: bool = True
    feedback_learning_policy: str = 'offline_evaluation_only'
    localization_skipped_reason: str | None = None
    execution_plan: ExecutionPlan | None = None
    policy_decision: dict[str, Any] = Field(default_factory=dict)
    clinical_action: ClinicalActionProposal | None = None
    medical_order_extraction: dict[str, Any] = Field(default_factory=dict)
    post_generation_validation: dict[str, Any] = Field(default_factory=dict)
    activation_flags: dict[str, Any] = Field(default_factory=dict)

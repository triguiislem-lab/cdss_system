from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from libs.contracts.commands import (
    DraftPrescriptionCommand,
    LocalizePrescriptionCommand,
    ValidatePrescriptionCommand,
)
from libs.contracts.evidence import EvidenceBundle, EvidenceChunk, KnowledgeGraphFact, LocalProductEvidence
from libs.contracts.execution import PipelineExecutionRecord
from libs.contracts.feedback import ClinicianFeedbackRequest, ClinicianFeedbackResponse, FieldEdit
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from libs.contracts.prescription import LocalizedMedication, TherapeuticPlan


class ConsultationRequest(BaseModel):
    request_id: str
    patient: PatientProfile
    consultation: ConsultationInput

    @model_validator(mode="before")
    @classmethod
    def normalize_request_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if not out.get("request_id"):
            for key in ("requestId", "id", "trace_id", "traceId", "request"):
                value = out.get(key)
                if value:
                    out["request_id"] = value
                    break
        if "patient" not in out:
            for key in ("patientProfile", "patient_profile", "subject"):
                if out.get(key) is not None:
                    out["patient"] = out[key]
                    break
        if "consultation" not in out:
            for key in ("consult", "clinicalContext", "clinical_context", "visit", "encounter"):
                if out.get(key) is not None:
                    out["consultation"] = out[key]
                    break
        return out

    def to_command(self) -> DraftPrescriptionCommand:
        return DraftPrescriptionCommand(
            request_id=self.request_id,
            patient=self.patient,
            consultation=self.consultation,
        )


class ValidationRequest(BaseModel):
    patient: PatientProfile
    plan: TherapeuticPlan

    @model_validator(mode="before")
    @classmethod
    def normalize_validation_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if "patient" not in out:
            for key in ("patientProfile", "patient_profile", "subject"):
                if out.get(key) is not None:
                    out["patient"] = out[key]
                    break
        if "plan" not in out:
            for key in ("therapeuticPlan", "therapeutic_plan", "prescription", "draft", "proposal"):
                if out.get(key) is not None:
                    out["plan"] = out[key]
                    break
        return out

    def to_command(self) -> ValidatePrescriptionCommand:
        return ValidatePrescriptionCommand(patient=self.patient, plan=self.plan)


class LocalizationRequest(BaseModel):
    plan: TherapeuticPlan
    evidence: EvidenceBundle

    @model_validator(mode="before")
    @classmethod
    def normalize_localization_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if "plan" not in out:
            for key in ("therapeuticPlan", "therapeutic_plan", "prescription", "draft", "proposal"):
                if out.get(key) is not None:
                    out["plan"] = out[key]
                    break
        if "evidence" not in out:
            for key in ("evidenceBundle", "evidence_bundle", "sources"):
                if out.get(key) is not None:
                    out["evidence"] = out[key]
                    break
        return out

    def to_command(self) -> LocalizePrescriptionCommand:
        return LocalizePrescriptionCommand(plan=self.plan, evidence=self.evidence)


class LocalizationResponse(BaseModel):
    localized_medications: list[LocalizedMedication] = Field(default_factory=list)


class ClinicalAnalysisResponse(BaseModel):
    snapshot: PatientSnapshot
    # Patch 13: /analyze now performs the same deterministic pre-planning
    # safety logic as /draft, without retrieval/generation. Keeping snapshot
    # preserves backward compatibility while exposing route/display_route to
    # evaluation notebooks.
    route: str | None = None
    display_route: str | None = None
    sub_route: str | None = None
    blocked: bool = False
    review_required: bool = False
    blocked_reasons: list[str] = Field(default_factory=list)
    medical_order_extraction: dict[str, Any] = Field(default_factory=dict)
    policy_decision: dict[str, Any] = Field(default_factory=dict)
    execution_plan: dict[str, Any] = Field(default_factory=dict)


class EvidenceRetrievalResponse(BaseModel):
    snapshot: PatientSnapshot
    evidence: EvidenceBundle


class FormularySearchResponse(BaseModel):
    query: str
    products: list[LocalProductEvidence] = Field(default_factory=list)


class KGSearchResponse(BaseModel):
    query: str
    facts: list[KnowledgeGraphFact] = Field(default_factory=list)


class TNMedEnrichmentSearchResponse(BaseModel):
    query: str
    chunks: list[EvidenceChunk] = Field(default_factory=list)
    profiles: list[dict[str, Any]] = Field(default_factory=list)
    available: bool = False


class RuntimeStatusResponse(BaseModel):
    status: str = "ok"
    app_name: str
    api_prefix: str
    generation_backend: str
    generation_model: str
    vector_backend: str
    kg_backend: str
    local_formulary_backend: str
    clinical_llm_extraction_enabled: bool
    clinical_llm_extraction_policy: str
    qwen_model_cache: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None


class PrescriptionDraftResponse(PipelineExecutionRecord):
    pass

from __future__ import annotations

from pydantic import BaseModel

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import ConsultationInput, PatientProfile
from libs.contracts.prescription import TherapeuticPlan


class DraftPrescriptionCommand(BaseModel):
    """Domain command used by orchestration to draft a clinician-reviewable prescription."""

    request_id: str
    patient: PatientProfile
    consultation: ConsultationInput


class ValidatePrescriptionCommand(BaseModel):
    """Domain command used by validation flows outside HTTP transport concerns."""

    patient: PatientProfile
    plan: TherapeuticPlan


class LocalizePrescriptionCommand(BaseModel):
    """Domain command used to localize a therapeutic plan to the target formulary."""

    plan: TherapeuticPlan
    evidence: EvidenceBundle

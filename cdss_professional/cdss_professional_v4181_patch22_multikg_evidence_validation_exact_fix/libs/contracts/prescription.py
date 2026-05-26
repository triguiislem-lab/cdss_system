from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


def _first_present(data: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in data and data.get(key) is not None:
            return data.get(key)
    return None


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if x is not None and str(x).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        return [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
    return [str(value).strip()] if str(value).strip() else []


class SupportingEvidenceRef(BaseModel):
    source: str
    note: str

    @model_validator(mode="before")
    @classmethod
    def normalize_evidence_aliases(cls, data):
        if isinstance(data, str):
            return {"source": "user_or_frontend", "note": data}
        if isinstance(data, dict):
            out = dict(data)
            if not out.get("source"):
                value = _first_present(out, ("source_id", "sourceId", "reference", "ref", "title", "url"))
                if value:
                    out["source"] = str(value)
            if not out.get("note"):
                value = _first_present(out, ("text", "snippet", "description", "content", "evidence", "quote"))
                if value:
                    out["note"] = str(value)
            out.setdefault("source", "unknown")
            out.setdefault("note", "")
            return out
        return data


class MedicationDraft(BaseModel):
    active_ingredient: str
    indication: str
    dose: str
    frequency: str
    duration: str
    route: str = "oral"
    rationale: str | None = None
    supporting_evidence: list[SupportingEvidenceRef] = Field(default_factory=list)
    safety_considerations: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_medication_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        alias_map: dict[str, tuple[str, ...]] = {
            "active_ingredient": ("activeIngredient", "ingredient", "dci", "drug", "medication", "name", "generic", "substance"),
            "indication": ("reason", "diagnosis", "condition", "problem", "for", "indication_text"),
            "dose": ("doseText", "dosage", "dose_text", "posology", "posologie"),
            "frequency": ("frequencyText", "freq", "frequency_text", "rythm", "schedule"),
            "duration": ("durationText", "duration_text", "days", "treatment_duration"),
            "route": ("routeText", "route_text", "voie", "administration_route"),
            "rationale": ("reasoning", "justification", "explanation"),
            "supporting_evidence": ("supportingEvidence", "evidence", "evidence_refs", "sources"),
            "safety_considerations": ("safetyConsiderations", "warnings", "safety_notes", "precautions"),
        }
        for canonical, aliases in alias_map.items():
            if out.get(canonical) is None:
                value = _first_present(out, aliases)
                if value is not None:
                    out[canonical] = value
        if "safety_considerations" in out:
            out["safety_considerations"] = _as_list(out.get("safety_considerations"))
        return out


class TherapeuticPlan(BaseModel):
    problem_summary: str
    medications: list[MedicationDraft] = Field(default_factory=list)
    non_drug_recommendations: list[str] = Field(default_factory=list)
    monitoring: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    generation_notes: list[str] = Field(default_factory=list)
    triage_recommendation: str = "clinician_review"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def normalize_plan_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        alias_map: dict[str, tuple[str, ...]] = {
            "problem_summary": ("problemSummary", "summary", "diagnosis", "condition", "assessment", "reason"),
            "non_drug_recommendations": ("nonDrugRecommendations", "non_drug", "lifestyle", "advice", "recommendations"),
            "unresolved_questions": ("unresolvedQuestions", "questions", "missing_information", "missingInfo"),
            "generation_notes": ("generationNotes", "notes"),
            "triage_recommendation": ("triageRecommendation", "route", "triage"),
        }
        for canonical, aliases in alias_map.items():
            if out.get(canonical) is None:
                value = _first_present(out, aliases)
                if value is not None:
                    out[canonical] = value
        for key in ("non_drug_recommendations", "monitoring", "unresolved_questions", "generation_notes"):
            if key in out:
                out[key] = _as_list(out.get(key))
        out.setdefault("problem_summary", "Clinical plan")
        return out


class FinalReviewedMedication(MedicationDraft):
    """Clinician-corrected medication including local formulary fields.

    This is intentionally richer than the generated generic draft so feedback
    can capture Tunisian product/form/strength edits as learning signals.
    """

    local_product_name: str | None = None
    local_product_id: str | None = None
    local_strength: str | None = None
    dosage_form: str | None = None
    market_status: str | None = None
    reimbursement_note: str | None = None
    localization_notes: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_localization_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        alias_map: dict[str, tuple[str, ...]] = {
            "local_product_name": ("localProductName", "product", "product_name", "brand", "brandName"),
            "local_product_id": ("localProductId", "product_id", "id", "cip"),
            "local_strength": ("localStrength", "strength"),
            "dosage_form": ("dosageForm", "form", "pharmaceutical_form"),
            "market_status": ("marketStatus", "status"),
            "reimbursement_note": ("reimbursementNote", "reimbursement"),
            "localization_notes": ("localizationNotes", "localization_notes"),
        }
        for canonical, aliases in alias_map.items():
            if out.get(canonical) is None:
                value = _first_present(out, aliases)
                if value is not None:
                    out[canonical] = value
        if "localization_notes" in out:
            out["localization_notes"] = _as_list(out.get("localization_notes"))
        return out


class FinalReviewedPlan(TherapeuticPlan):
    medications: list[FinalReviewedMedication] = Field(default_factory=list)


class RejectedLocalizationCandidate(BaseModel):
    product_name: str
    active_ingredient: str | None = None
    strength: str | None = None
    dosage_form: str | None = None
    reason: str
    score: float | None = None
    metadata: dict = Field(default_factory=dict)


class LocalizedMedication(BaseModel):
    generic: MedicationDraft
    local_product_name: str
    strength: str
    dosage_form: str
    market: str = "TN"
    reimbursement_note: str | None = None
    match_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    localization_notes: list[str] = Field(default_factory=list)
    rejected_candidates: list[RejectedLocalizationCandidate] = Field(default_factory=list)


class PrescriptionProposal(BaseModel):
    plan: TherapeuticPlan
    localized_medications: list[LocalizedMedication] = Field(default_factory=list)
    clinician_review_required: bool = True
    review_notes: list[str] = Field(default_factory=list)
    blocked_reasons: list[str] = Field(default_factory=list)
    evidence_quality_summary: dict = Field(default_factory=dict)

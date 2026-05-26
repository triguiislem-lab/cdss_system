from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator


def _first_present(data: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in data and data.get(key) is not None:
            return data.get(key)
    return None


def _as_list(value: Any) -> list[str]:
    """Normalize frontend values to list[str] without losing structured inputs."""
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if item is None:
                continue
            if isinstance(item, str):
                if item.strip():
                    out.append(item.strip())
            elif isinstance(item, dict):
                text = item.get("name") or item.get("label") or item.get("text") or item.get("value")
                if text:
                    out.append(str(text).strip())
            else:
                out.append(str(item).strip())
        return [x for x in out if x]
    if isinstance(value, str):
        # Accept either comma/semicolon-separated UI text or a single term.
        raw = value.strip()
        if not raw:
            return []
        parts = [p.strip() for p in raw.replace(";", ",").split(",")]
        return [p for p in parts if p]
    return [str(value).strip()] if str(value).strip() else []


def _as_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y", "oui", "o", "pregnant", "enceinte"}:
        return True
    if text in {"false", "0", "no", "n", "non", "not_pregnant", "not pregnant", "non_enceinte"}:
        return False
    return None


class TranscriptTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    speaker: Literal["doctor", "patient", "system"] = "patient"
    text: str = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def normalize_turn_aliases(cls, data):
        if isinstance(data, str):
            return {"speaker": "patient", "text": data}
        if isinstance(data, dict):
            out = dict(data)
            if "text" not in out:
                for key in ("utterance", "message", "content", "note", "notes", "value", "body"):
                    value = out.get(key)
                    if isinstance(value, str) and value.strip():
                        out["text"] = value
                        break
            speaker = str(out.get("speaker", out.get("role", "patient"))).strip().lower()
            speaker_map = {
                "doctor": "doctor",
                "dr": "doctor",
                "doc": "doctor",
                "medecin": "doctor",
                "médecin": "doctor",
                "clinician": "doctor",
                "physician": "doctor",
                "practitioner": "doctor",
                "provider": "doctor",
                "patient": "patient",
                "user": "patient",
                "malade": "patient",
                "person": "patient",
                "system": "system",
                "assistant": "system",
                "bot": "system",
            }
            out["speaker"] = speaker_map.get(speaker, speaker if speaker in {"doctor", "patient", "system"} else "patient")
            return out
        return data


class ConsultationInput(BaseModel):
    """Runtime consultation payload with aliases for benchmark, API and frontend note fields."""

    model_config = ConfigDict(extra="ignore")

    language: str = "fr"
    doctor_notes: str | None = None
    transcript: list[TranscriptTurn] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_note_aliases(cls, data):
        if isinstance(data, str):
            return {"doctor_notes": data}
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if not out.get("doctor_notes"):
            for key in (
                "doctorNotes",
                "doctor_notes",
                "notes",
                "note",
                "clinical_note",
                "clinical_notes",
                "clinicalNotes",
                "chief_complaint",
                "chiefComplaint",
                "complaint",
                "history",
                "assessment",
                "text",
                "raw_text",
                "rawText",
                "summary",
            ):
                value = out.get(key)
                if isinstance(value, str) and value.strip():
                    out["doctor_notes"] = value
                    break
        transcript = out.get("transcript") or out.get("conversation") or out.get("dialogue") or out.get("messages")
        if isinstance(transcript, list):
            normalized = []
            for turn in transcript:
                if isinstance(turn, str):
                    normalized.append({"speaker": "patient", "text": turn})
                elif isinstance(turn, dict):
                    normalized.append(TranscriptTurn.normalize_turn_aliases(turn))
                else:
                    normalized.append(turn)
            out["transcript"] = normalized
        return out


class PatientProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patient_id: str
    # Accept fractional ages such as 0.17 years used by pediatric benchmarks.
    # The old int type caused HTTP 422 for infants.
    age_years: float | None = Field(default=None, ge=0, le=130)
    age_months: int | None = Field(default=None, ge=0, le=1560)
    sex: Literal["male", "female", "other", "unknown"] = "unknown"
    weight_kg: float | None = Field(default=None, gt=0)
    pregnant: bool | None = None
    breastfeeding: bool | None = None
    renal_impairment: bool = False
    hepatic_impairment: bool = False

    # Patch17: richer structured clinical context.  These fields are optional
    # and backward-compatible, but allow safety rules to use actual values
    # rather than boolean approximations when available.
    egfr: float | None = Field(default=None, ge=0, le=200)
    creatinine_value: float | None = Field(default=None, ge=0)
    creatinine_unit: str | None = None
    creatinine_date: str | None = None
    pregnancy_status: Literal["pregnant", "not_pregnant", "unknown", "uncertain"] = "unknown"
    gestational_age_weeks: float | None = Field(default=None, ge=0, le=45)
    pregnancy_uncertain: bool | None = None
    temperature_c: float | None = Field(default=None, ge=25, le=45)
    systolic_bp: int | None = Field(default=None, ge=40, le=300)
    diastolic_bp: int | None = Field(default=None, ge=20, le=200)
    spo2: float | None = Field(default=None, ge=0, le=100)
    heart_rate: int | None = Field(default=None, ge=0, le=300)
    respiratory_rate: int | None = Field(default=None, ge=0, le=100)
    pain_score: float | None = Field(default=None, ge=0, le=10)
    symptom_severity: Literal["mild", "moderate", "severe", "unknown"] = "unknown"
    pediatric_weight_source: str | None = None
    structured_history: list[str] = Field(default_factory=list)

    known_allergies: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_patient_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        alias_map: dict[str, tuple[str, ...]] = {
            "patient_id": ("id", "patientId", "patientID", "patient_identifier", "patientIdentifier", "identifier"),
            "age_years": ("age", "ageYears", "age_year", "years", "ageY", "age_years"),
            "age_months": ("ageMonths", "months", "age_month", "age_months"),
            "weight_kg": ("weight", "weightKg", "weightKG", "weight_kg", "poids", "poids_kg"),
            "known_allergies": ("allergies", "knownAllergies", "allergy_history", "allergyHistory", "allergies_connues"),
            "current_medications": ("currentMedications", "current_meds", "medications", "treatments", "currentTreatments", "traitements"),
            "chronic_conditions": ("chronicConditions", "conditions", "medical_history", "medicalHistory", "antecedents", "antecedents_medicaux"),
            "pregnancy_status": ("pregnancyStatus", "pregnancy", "grossesse", "pregnancy_state"),
            "renal_impairment": ("renalImpairment", "renal_failure", "renalFailure", "insuffisance_renale"),
            "hepatic_impairment": ("hepaticImpairment", "hepatic_failure", "hepaticFailure", "insuffisance_hepatique"),
            "breastfeeding": ("lactation", "breastFeeding", "allaitement"),
            "egfr": ("eGFR", "egfr_value", "estimatedGfr"),
            "gestational_age_weeks": ("gestationalAgeWeeks", "gestational_age", "weeksPregnant"),
        }
        for canonical, aliases in alias_map.items():
            if out.get(canonical) is None:
                value = _first_present(out, aliases)
                if value is not None:
                    out[canonical] = value

        # List fields often arrive as strings or arrays of objects from frontends.
        for key in ("known_allergies", "current_medications", "chronic_conditions", "structured_history"):
            if key in out:
                out[key] = _as_list(out.get(key))

        # Sex aliases: frontend often sends F/M.
        sex = str(out.get("sex", "")).strip().lower()
        sex_map = {
            "f": "female",
            "female": "female",
            "femme": "female",
            "woman": "female",
            "m": "male",
            "male": "male",
            "homme": "male",
            "man": "male",
            "o": "other",
            "other": "other",
            "unknown": "unknown",
            "u": "unknown",
            "inconnu": "unknown",
        }
        if sex in sex_map:
            out["sex"] = sex_map[sex]

        # Normalize booleans and pregnancy string variants.
        for key in ("pregnant", "breastfeeding", "renal_impairment", "hepatic_impairment", "pregnancy_uncertain"):
            if key in out:
                b = _as_bool(out.get(key))
                if b is not None:
                    out[key] = b

        ps = str(out.get("pregnancy_status", "")).strip().lower()
        ps_map = {
            "pregnant": "pregnant",
            "enceinte": "pregnant",
            "yes": "pregnant",
            "true": "pregnant",
            "not_pregnant": "not_pregnant",
            "not pregnant": "not_pregnant",
            "non enceinte": "not_pregnant",
            "non_enceinte": "not_pregnant",
            "no": "not_pregnant",
            "false": "not_pregnant",
            "unknown": "unknown",
            "inconnu": "unknown",
            "uncertain": "uncertain",
            "incertain": "uncertain",
        }
        if ps in ps_map:
            out["pregnancy_status"] = ps_map[ps]
        return out

    @model_validator(mode="after")
    def derive_structured_risk_context(self):
        if self.age_months is None and self.age_years is not None and self.age_years < 1:
            self.age_months = max(0, round(float(self.age_years) * 12))
        if self.pregnant is True:
            self.pregnancy_status = "pregnant"
        elif self.pregnant is False and self.pregnancy_status == "unknown":
            self.pregnancy_status = "not_pregnant"
        elif self.pregnancy_status == "pregnant":
            self.pregnant = True
        elif self.pregnancy_status == "not_pregnant" and self.pregnant is None:
            self.pregnant = False
        if self.egfr is not None and self.egfr < 60:
            self.renal_impairment = True
        return self


class RiskFlags(BaseModel):
    pregnancy_risk: bool = False
    renal_risk: bool = False
    hepatic_risk: bool = False
    allergy_risk: bool = False
    escalation_needed: bool = False
    notes: list[str] = Field(default_factory=list)


class PatientSnapshot(BaseModel):
    patient: PatientProfile
    consultation: ConsultationInput
    normalized_symptoms: list[str] = Field(default_factory=list)
    suspected_conditions: list[str] = Field(default_factory=list)
    missing_critical_information: list[str] = Field(default_factory=list)
    risk_flags: RiskFlags = Field(default_factory=RiskFlags)
    normalized_runtime_text: str = ""
    disease_tags: list[str] = Field(default_factory=list)
    vulnerable_flags: list[str] = Field(default_factory=list)
    route_recommendation: Literal["prescription", "review", "emergency", "non_pharma"] = "prescription"
    extracted_context: dict[str, Any] = Field(default_factory=dict)

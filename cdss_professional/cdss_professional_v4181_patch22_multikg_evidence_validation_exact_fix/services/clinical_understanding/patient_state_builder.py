from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags


class PatientStateBuilder:
    """Builds the normalized patient snapshot contract."""

    def build(
        self,
        patient: PatientProfile,
        consultation: ConsultationInput,
        normalized_symptoms: list[str],
        suspected_conditions: list[str],
        missing_critical_information: list[str],
        risk_flags: RiskFlags,
        *,
        normalized_runtime_text: str = "",
        disease_tags: list[str] | None = None,
        vulnerable_flags: list[str] | None = None,
        route_recommendation: str = "prescription",
        extracted_context: dict | None = None,
    ) -> PatientSnapshot:
        return PatientSnapshot(
            patient=patient,
            consultation=consultation,
            normalized_symptoms=normalized_symptoms,
            suspected_conditions=suspected_conditions,
            missing_critical_information=missing_critical_information,
            risk_flags=risk_flags,
            normalized_runtime_text=normalized_runtime_text,
            disease_tags=disease_tags or [],
            vulnerable_flags=vulnerable_flags or [],
            route_recommendation=route_recommendation,  # type: ignore[arg-type]
            extracted_context=extracted_context or {},
        )

from __future__ import annotations

from libs.contracts.patient import PatientProfile, RiskFlags


class RiskExtractor:
    """Deterministic extraction of high-level risk flags from patient and parsed context."""

    def extract(self, patient: PatientProfile, parsed: dict | None = None) -> RiskFlags:
        parsed = parsed or {}
        vulnerable = set(parsed.get("vulnerable_flags", []) or [])
        allergies = list(patient.known_allergies or []) + list(parsed.get("allergies") or [])
        allergy_risk = bool(allergies)
        pregnancy_risk = bool(patient.pregnant or parsed.get("pregnancy_mentioned") or "pregnancy" in vulnerable)
        renal_risk = bool(patient.renal_impairment or parsed.get("renal_mentioned") or "renal" in vulnerable)
        hepatic_risk = bool(patient.hepatic_impairment or parsed.get("hepatic_mentioned") or "hepatic" in vulnerable)
        notes: list[str] = []
        if pregnancy_risk:
            notes.append("Pregnancy reported or mentioned; pregnancy-specific review required.")
        if renal_risk:
            notes.append("Renal impairment reported or mentioned; dose adjustment review required.")
        if hepatic_risk:
            notes.append("Hepatic impairment reported or mentioned; medication suitability review required.")
        if allergy_risk:
            notes.append("Allergy history detected; check generated medications against allergens.")
        if "pediatric" in vulnerable:
            notes.append("Pediatric context detected; dosing must be clinician-verified.")
        if "older_adult" in vulnerable or (patient.age_years or 0) >= 75:
            notes.append("Older adult: prefer conservative prescribing and review.")
        escalation = bool(parsed.get("emergency_detected") or (parsed.get("extracted_context", {}) or {}).get("red_flags"))
        return RiskFlags(
            pregnancy_risk=pregnancy_risk,
            renal_risk=renal_risk,
            hepatic_risk=hepatic_risk,
            allergy_risk=allergy_risk,
            escalation_needed=escalation,
            notes=notes,
        )

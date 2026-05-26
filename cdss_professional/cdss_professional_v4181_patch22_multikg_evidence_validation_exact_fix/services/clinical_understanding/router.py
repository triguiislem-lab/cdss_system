from __future__ import annotations

from libs.contracts.patient import PatientSnapshot, RiskFlags
from libs.utils.medical_text import normalize_search_text


class ProductionRouter:
    """Conservative runtime router aligned with the Tunisia contract."""

    non_pharma_terms = {"myopia", "myopie", "astigmatism", "hyperopia", "optical", "visual blur"}
    review_disease_terms = {"renal disease", "preeclampsia", "depression"}
    dental_review_terms = {"dental pain", "douleur dentaire", "dent", "dentaire", "abces dentaire"}
    dental_complication_terms = {"swelling", "gonflement", "abces", "abscess", "pus", "facial", "trismus"}
    antibiotic_request_terms = {"amoxicillin", "amoxicilline", "antibiotic", "antibiotique", "augmentin", "amoclan", "clavulan"}
    viral_context_terms = {"viral", "virus", "rhume", "urti", "sore throat", "mal de gorge", "pharyng", "grippe", "influenza", "toux"}

    bacterial_confirmed_terms = {"angine bacterienne", "angine bactérienne", "infection bacterienne confirmee", "infection bactérienne confirmée", "streptocoque positif", "tdr positif", "bacterien documente", "bactérien documenté", "diagnostic bacterien confirme", "diagnostic bactérien confirmé", "confirmed bacterial infection", "positive strep"}
    beta_lactam_allergy_terms = {"penicillin allergy", "allergie penicilline", "allergie a la penicilline", "allergie à la pénicilline", "allergy penicillin", "allergique penicilline"}
    nsaid_terms = {"ibuprofen", "ibuprofene", "ibuprofène", "nsaid", "ains", "diclofenac", "ketoprofen"}
    anticoagulant_terms = {"warfarin", "acenocoumarol", "acenocoumarol", "sintrom", "anticoagulant", "avk"}
    critical_missing = {
        "pregnancy status", "clear symptom description",
        "current medications", "clinical risk clarification",
    }

    def route(self, snapshot: PatientSnapshot) -> str:
        return self.explain(snapshot)["route"]

    def explain(self, snapshot: PatientSnapshot) -> dict[str, object]:
        text = normalize_search_text(
            " ".join(
                [
                    snapshot.normalized_runtime_text,
                    " ".join(snapshot.normalized_symptoms),
                    " ".join(snapshot.suspected_conditions),
                    " ".join(snapshot.disease_tags),
                    " ".join(snapshot.missing_critical_information),
                    " ".join(snapshot.vulnerable_flags),
                ]
            )
        )
        red_flags = snapshot.extracted_context.get("red_flags", []) or []
        quality = snapshot.extracted_context.get("parser_quality", {}) or {}
        review_triggers: list[str] = []

        if any(term in text for term in self.non_pharma_terms) and not red_flags:
            return {
                "route": "non_pharma",
                "route_reason": "non_pharmacologic_or_device_focused_terms_detected",
                "blocking_reason": None,
                "review_triggers": [],
            }

        if red_flags or snapshot.risk_flags.escalation_needed:
            return {
                "route": "emergency",
                "route_reason": "red_flags_or_escalation_needed",
                "blocking_reason": "emergency_route",
                "review_triggers": list(red_flags) or ["risk_flags.escalation_needed"],
            }

        if quality.get("requires_review_due_to_low_confidence"):
            review_triggers.append("parser_low_confidence")

        review_triggers.extend(self._review_triggers(snapshot.risk_flags, snapshot, text))

        if review_triggers:
            return {
                "route": "review",
                "route_reason": "review_triggers_present",
                "blocking_reason": "; ".join(review_triggers[:5]),
                "review_triggers": list(dict.fromkeys(review_triggers)),
            }
        return {
            "route": "prescription",
            "route_reason": "no_emergency_non_pharma_or_review_trigger_detected",
            "blocking_reason": None,
            "review_triggers": [],
        }

    def _should_review(self, flags: RiskFlags, snapshot: PatientSnapshot, text: str) -> bool:
        return bool(self._review_triggers(flags, snapshot, text))

    def _positive_anticoagulant_context(self, text: str) -> bool:
        if any(neg in text for neg in ["ne prend pas", "sans anticoagulant", "nie anticoagulant", "no anticoagulant", "denies anticoagulant", "not taking"]):
            return False
        return any(term in text for term in self.anticoagulant_terms)

    def _review_triggers(self, flags: RiskFlags, snapshot: PatientSnapshot, text: str) -> list[str]:
        triggers: list[str] = []
        if flags.pregnancy_risk or flags.renal_risk or flags.hepatic_risk:
            if flags.pregnancy_risk:
                triggers.append("pregnancy_risk")
            if flags.renal_risk:
                triggers.append("renal_risk")
            if flags.hepatic_risk:
                triggers.append("hepatic_risk")
        if any(term in text for term in self.review_disease_terms):
            triggers.append("review_disease_term")

        if any(term in text for term in self.antibiotic_request_terms) and any(term in text for term in self.viral_context_terms) and not any(term in text for term in self.bacterial_confirmed_terms):
            triggers.append("antibiotic_stewardship_viral_request")

        if any(term in text for term in self.antibiotic_request_terms) and any(term in text for term in self.beta_lactam_allergy_terms):
            triggers.append("beta_lactam_allergy_review")

        if any(term in text for term in self.nsaid_terms) and self._positive_anticoagulant_context(text):
            triggers.append("anticoagulant_nsaid_interaction_review")

        if any(term in text for term in self.dental_review_terms) and any(term in text for term in self.dental_complication_terms):
            triggers.append("dental_swelling_or_abscess_review")

        missing = [item for item in snapshot.missing_critical_information if item in self.critical_missing]
        triggers.extend(f"missing:{item}" for item in missing)
        unresolved = snapshot.extracted_context.get("unresolved_flags", [])
        triggers.extend(f"unresolved:{item}" for item in unresolved)
        return triggers

from __future__ import annotations

from services.domain.contracts import BusinessMissingInformation
from services.domain.utils import canonical_list, is_pediatric, patient_context, unique

LOW_RISK_PROTOCOL_TARGETS = {
    "paracetamol",
    "salbutamol",
    "cetirizine",
    "omeprazole",
    "oral_rehydration_salts",
    "alginate",
    "artificial_tears",
    "saline_nasal_spray",
    "benzoyl_peroxide_topical",
    "psyllium",
    "chlorhexidine_mouthwash",
    "dexpanthenol_topical",
    "aciclovir_topical",
    "dimenhydrinate",
    "lidocaine_topical",
    "diclofenac_topical",
}
HIGH_RISK_TARGETS = {"ibuprofen", "diclofenac", "naproxen", "amoxicillin", "amoxicillin clavulanic acid", "codeine"}


class MissingInformationPolicy:
    """Business policy deciding whether unknown data should block generation."""

    def evaluate(self, snapshot, targets: list[str], raw_missing: list[str], required_safety_screens: list[str] | None = None) -> BusinessMissingInformation:
        targets = canonical_list(targets)
        raw = unique(raw_missing or [])
        screens = unique(required_safety_screens or [])
        ctx = patient_context(snapshot)
        blocking: list[str] = []
        informative: list[str] = []
        reasons: list[str] = []
        target_set = set(targets)
        low_risk_only = bool(targets) and target_set.issubset(LOW_RISK_PROTOCOL_TARGETS)
        high_risk_present = bool(target_set & HIGH_RISK_TARGETS)

        for item in raw:
            key = item.lower().strip().replace("_", " ")
            if not key:
                continue
            block = False
            reason = ""
            if "weight" in key and is_pediatric(snapshot) and any(t in {"paracetamol", "oral_rehydration_salts", "ibuprofen", "amoxicillin", "amoxicillin clavulanic acid"} for t in target_set):
                block = True
                reason = "pediatric_weight_required_for_systemic_dosing"
            elif "pregnancy" in key and any(t in {"ibuprofen", "diclofenac", "naproxen"} for t in target_set):
                block = True
                reason = "pregnancy_status_required_for_nsaid"
            elif ("renal" in key or "egfr" in key or "creatinine" in key) and any(t in {"ibuprofen", "diclofenac", "naproxen"} for t in target_set):
                block = True
                reason = "renal_function_required_for_nsaid"
            elif "allergy" in key and high_risk_present:
                block = True
                reason = "allergy_history_required_for_high_risk_or_antibiotic"
            elif "current medication" in key or "medication" in key:
                if any(t in {"ibuprofen", "diclofenac", "naproxen"} for t in target_set):
                    block = True
                    reason = "current_medications_required_for_nsaid_ddi"
                elif any(t in {"paracetamol"} for t in target_set) and "dose" in key:
                    block = True
                    reason = "paracetamol_cumulative_dose_required"
            elif "duration" in key and not low_risk_only:
                block = True
                reason = "symptom_duration_required_for_non_low_risk_route"
            elif "clear symptom" in key and not low_risk_only:
                block = True
                reason = "clear_symptom_description_required"

            if block:
                blocking.append(item)
                reasons.append(reason)
            else:
                informative.append(item)

        for screen in screens:
            screen_key = screen.lower().strip()
            if not screen_key:
                continue
            if any(t in {"ibuprofen", "diclofenac", "naproxen"} for t in target_set):
                blocking.append(screen)
                reasons.append("required_nsaid_safety_screen_missing")
            else:
                informative.append(screen)

        if ctx.get("pregnancy_uncertain") and any(t in {"ibuprofen", "diclofenac", "naproxen"} for t in target_set):
            blocking.append("pregnancy status")
            reasons.append("pregnancy_uncertain_for_nsaid")

        return BusinessMissingInformation(blocking=unique(blocking), informative=unique(informative), reason_codes=unique(reasons))

from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import contains_any, normalize_search_text


class TherapyStrategyDetector:
    """Notebook-inspired therapy strategy detector.

    This ports the large notebook's idea that not every case should use Tunisia
    evidence as regimen authority and not every case should produce medication.
    """

    NON_PHARMA_TERMS = ["myopia", "myopie", "hyperopia", "hyperopie", "astigmat", "lunettes", "optique", "dioptr"]
    EMERGENCY_TERMS = [
        "chest pain", "douleur thorac", "stemi", "infarct", "smur", "112", "urgence",
        "severe dyspnea", "dyspnee severe", "anaphylax", "meningite", "stroke", "avc",
    ]
    REVIEW_TERMS = ["deprescrib", "adjust", "ajuster", "review", "renal", "grossesse", "pregnan", "hepat"]
    SYMPTOMATIC_TERMS = [
        "grippe", "influenza", "flu", "viral", "virose", "common cold", "rhino", "pharyng",
        "odynophag", "fièvre", "fievre", "toux", "migraine", "headache", "douleur", "pain",
        "myalg", "arthralg", "sore throat", "fever",
    ]

    def detect(self, snapshot: PatientSnapshot, evidence: EvidenceBundle | None = None) -> dict[str, str]:
        text_parts = [
            " ".join(snapshot.normalized_symptoms),
            " ".join(snapshot.suspected_conditions),
            snapshot.consultation.doctor_notes or "",
            " ".join(turn.text for turn in snapshot.consultation.transcript),
            evidence.merged_summary if evidence else "",
        ]
        text = normalize_search_text(" ".join(text_parts))

        if contains_any(text, self.NON_PHARMA_TERMS):
            return {"strategy": "non_pharma", "tn_role": "disabled", "reason": "optical_or_nonpharma_case"}
        if contains_any(text, self.EMERGENCY_TERMS):
            return {"strategy": "emergency", "tn_role": "advisory", "reason": "emergency_or_referral_case"}
        if contains_any(text, self.SYMPTOMATIC_TERMS) or any(s in {"fever", "sore throat", "cough", "headache", "pain"} for s in snapshot.normalized_symptoms):
            return {"strategy": "symptomatic", "tn_role": "localizer_only", "reason": "symptomatic_case_use_tn_for_localization_not_regimen"}
        if contains_any(text, self.REVIEW_TERMS) or snapshot.patient.pregnant or snapshot.patient.renal_impairment or snapshot.patient.hepatic_impairment:
            return {"strategy": "review", "tn_role": "advisory", "reason": "review_safety_adjustment_case"}
        return {"strategy": "disease_directed", "tn_role": "regimen_authority", "reason": "disease_directed_case"}

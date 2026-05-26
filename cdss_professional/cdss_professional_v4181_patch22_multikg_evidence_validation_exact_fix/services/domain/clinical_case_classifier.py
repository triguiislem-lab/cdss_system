from __future__ import annotations

from pydantic import BaseModel, Field
from services.domain.utils import has_any_positive, has_cardiac_chest_red_flag, is_young_infant, patient_context, snapshot_blob


class ClinicalCaseClassification(BaseModel):
    emergency: bool = False
    emergency_reasons: list[str] = Field(default_factory=list)
    non_pharma: bool = False
    non_pharma_reasons: list[str] = Field(default_factory=list)
    vulnerable_context: bool = False
    vulnerable_reasons: list[str] = Field(default_factory=list)


class ClinicalCaseClassifier:
    """Business classifier using structured patient context plus positive text.

    This is not the primary NLP extractor. It is a defensive business layer that
    catches critical patterns even when parser/LLM extraction is incomplete.
    """

    def classify(self, snapshot, medical_orders=None) -> ClinicalCaseClassification:
        blob = snapshot_blob(snapshot, medical_orders)
        ctx = patient_context(snapshot)
        out = ClinicalCaseClassification()

        def emergency(reason: str):
            out.emergency = True
            if reason not in out.emergency_reasons:
                out.emergency_reasons.append(reason)

        if ctx.get("escalation_needed"):
            emergency("risk_flags.escalation_needed")
        if is_young_infant(snapshot) and has_any_positive(blob, ["fever", "fievre", "fièvre", "s5ana", "skhana", "سخانة", "حمى"]):
            emergency("young_infant_fever")
        if has_cardiac_chest_red_flag(blob):
            emergency("cardiac_red_flag")
        stroke_face_terms = ["face droop", "facial droop", "face weakness", "facial weakness", "deviation bouche", "bouche deviee", "bouche déviée"]
        stroke_arm_terms = ["arm weakness", "arm drift", "weak arm", "faiblesse bras", "main faible", "bras faible"]
        stroke_speech_terms = ["speech difficulty", "slurred speech", "trouble parole", "aphasie", "speech problem", "parole trouble"]
        if (
            has_any_positive(blob, ["stroke", "avc", "fast positive", "face arm speech", "fast face arm speech"])
            or (has_any_positive(blob, stroke_face_terms) and has_any_positive(blob, stroke_arm_terms) and has_any_positive(blob, stroke_speech_terms))
        ):
            emergency("stroke_fast_red_flag")
        if has_any_positive(blob, ["flank pain", "douleur flanc", "douleur du flanc", "lombaire"]) and has_any_positive(blob, ["fever", "fievre", "fièvre", "rigors", "frissons", "vomiting", "vomissements"]):
            emergency("pyelonephritis_or_sepsis_red_flag")
        if has_any_positive(blob, ["sudden worst headache", "pire cephalee", "céphalée brutale", "thunderclap"]) and has_any_positive(blob, ["weakness", "faiblesse", "deficit", "déficit", "confusion", "trouble parole", "aphasie"]):
            emergency("neuro_red_flag")
        if has_any_positive(blob, ["neck stiffness", "raideur nuque", "raideur de nuque"]) and has_any_positive(blob, ["fever", "fievre", "fièvre"]) and has_any_positive(blob, ["petechiae", "pétéchies", "purpura", "rash purpurique"]):
            emergency("meningitis_purpura_red_flag")
        if has_any_positive(blob, ["dental swelling", "gonflement dentaire", "abcès dentaire", "abces dentaire"]) and has_any_positive(blob, ["fever", "fievre", "fièvre", "trismus", "difficulté avaler", "difficulty swallowing"]):
            emergency("odontogenic_deep_infection_red_flag")
        if has_any_positive(blob, ["diabetic foot", "pied diabetique", "pied diabétique"]) and has_any_positive(blob, ["fever", "fievre", "fièvre", "pus", "redness", "rougeur", "swelling"]):
            emergency("diabetic_foot_infection_red_flag")

        if has_any_positive(blob, ["myopia", "myopie", "lunettes", "glasses", "optique"]) and not out.emergency:
            out.non_pharma = True
            out.non_pharma_reasons.append("optical_non_pharmacologic")

        text_pregnant = has_any_positive(blob, ["pregnant patient", "patient is pregnant", "femme enceinte", "je suis enceinte", "enceinte", "grossesse confirmee", "grossesse confirmée"])
        text_pregnancy_uncertain = has_any_positive(blob, ["pregnancy unknown", "grossesse inconnue", "statut grossesse inconnu", "pregnancy status unknown"])
        text_breastfeeding = has_any_positive(blob, ["breastfeeding", "allaitement", "j allaite", "j'allaite"])
        text_renal = has_any_positive(blob, ["renal impairment", "kidney disease", "insuffisance renale", "insuffisance rénale", "maladie renale", "maladie rénale"])
        text_hepatic = has_any_positive(blob, ["hepatic impairment", "liver failure", "insuffisance hepatique", "insuffisance hépatique", "cirrhosis", "cirrhose"])

        if ctx.get("pregnant") or text_pregnant:
            out.vulnerable_context = True
            out.vulnerable_reasons.append("pregnancy")
        if ctx.get("pregnancy_uncertain") or text_pregnancy_uncertain:
            out.vulnerable_context = True
            out.vulnerable_reasons.append("pregnancy_uncertain")
        if ctx.get("breastfeeding") or text_breastfeeding:
            out.vulnerable_context = True
            out.vulnerable_reasons.append("breastfeeding")
        if ctx.get("renal_impairment") or text_renal:
            out.vulnerable_context = True
            out.vulnerable_reasons.append("renal_impairment")
        if ctx.get("hepatic_impairment") or text_hepatic:
            out.vulnerable_context = True
            out.vulnerable_reasons.append("hepatic_impairment")
        if ctx.get("allergy_risk"):
            out.vulnerable_context = True
            out.vulnerable_reasons.append("allergy_risk")
        return out

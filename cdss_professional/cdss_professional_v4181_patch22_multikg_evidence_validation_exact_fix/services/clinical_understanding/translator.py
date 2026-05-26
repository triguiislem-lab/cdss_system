from __future__ import annotations

import re
from typing import Any

from libs.contracts.patient import ConsultationInput, TranscriptTurn
from libs.utils.medical_text import repair_mojibake


class TranslationStep:
    """Clinical normalization step with optional model translation.

    It keeps the original text intact in the consultation object and produces a
    runtime view. When a model translator is injected, non-English consultation
    text is translated through that model first, then the local phrase map is
    applied as a conservative normalization fallback.
    """

    _phrase_map = {
        "pas d'allergie connue": "no known allergy",
        "pas d allergie connue": "no known allergy",
        "aucune allergie connue": "no known allergy",
        "non enceinte": "not pregnant",
        "pas enceinte": "not pregnant",
        "fièvre": "fever",
        "fievre": "fever",
        "حرارة": "fever",
        "حمى": "fever",
        "douleur": "pain",
        "douleurs": "pain",
        "وجع": "pain",
        "mal": "pain",
        "toux": "cough",
        "سعال": "cough",
        "gorge": "throat",
        "angine": "sore throat",
        "mal de gorge": "sore throat",
        "dyspnée": "dyspnea",
        "dyspnee": "dyspnea",
        "ضيق تنفس": "dyspnea",
        "essoufflement": "dyspnea",
        "douleur thoracique": "chest pain",
        "thoracique": "chest pain",
        "صدر": "chest pain",
        "nausée": "nausea",
        "nausee": "nausea",
        "غثيان": "nausea",
        "vomissement": "vomiting",
        "vomissements": "vomiting",
        "قيء": "vomiting",
        "diarrhée": "diarrhea",
        "diarrhee": "diarrhea",
        "إسهال": "diarrhea",
        "mal de tete": "headache",
        "céphalée": "headache",
        "cephalee": "headache",
        "headache": "headache",
        "صداع": "headache",
        "grossesse": "pregnancy",
        "enceinte": "pregnant",
        "pregnant": "pregnant",
        "حامل": "pregnant",
        "allergie": "allergy",
        "allergies": "allergy",
        "حساسية": "allergy",
        "insuffisance rénale": "renal impairment",
        "insuffisance renale": "renal impairment",
        "renal": "renal impairment",
        "كلوي": "renal impairment",
        "hépatique": "hepatic impairment",
        "hepatique": "hepatic impairment",
        "liver": "hepatic impairment",
        "foie": "hepatic impairment",
        "asthme": "asthma",
        "ربو": "asthma",
        "grippe": "influenza",
        "rhume": "common cold",
        "migraine": "migraine",
        # Tunisian Arabizi/Arabic cardiac red-flag normalization used by Patch23 safety benchmark hardening.
        "wja3 sderi": "chest pain",
        "wja3 fi sderi": "chest pain",
        "wja3 f sderi": "chest pain",
        "wja3 fel sderi": "chest pain",
        "wji3a fi sderi": "chest pain",
        "wji3a f sderi": "chest pain",
        "wajaa fi sderi": "chest pain",
        "sderi": "chest pain",
        "sder": "chest pain",
        "وجع صدر": "chest pain",
        "وجع في صدري": "chest pain",
        "وجيعة في صدري": "chest pain",
        "ألم صدر": "chest pain",
        "الم صدر": "chest pain",
        "t3arra9": "sweating",
        "t3araq": "sweating",
        "ta3raq": "sweating",
        "ta3req": "sweating",
        "3araq": "sweating",
        "3ra9": "sweating",
        "3are9": "sweating",
        "عرق": "sweating",
        "تعرق": "sweating",
        "يدي اليسرى": "left arm",
        "يد اليسرى": "left arm",
        "ذراعي اليسرى": "left arm",
        "الذراع اليسرى": "left arm",
        "yedi lisra": "left arm",
        "yeddi lisra": "left arm",
        "yed lissar": "left arm",
        "yedi lissar": "left arm",
        "ketfi lisar": "left shoulder",
        "ktaf lisar": "left shoulder",
    }

    def __init__(self, model_translator: Any | None = None, model_target_lang: str = "en") -> None:
        self.model_translator = model_translator
        self.model_target_lang = model_target_lang
        self.last_model_status = "not_configured" if model_translator is None else "configured"

    def normalize(self, consultation: ConsultationInput) -> ConsultationInput:
        turns = [
            TranscriptTurn(speaker=turn.speaker, text=" ".join(turn.text.split())) for turn in consultation.transcript
        ]
        doctor_notes = " ".join((consultation.doctor_notes or "").split()) or None
        return ConsultationInput(language=consultation.language, doctor_notes=doctor_notes, transcript=turns)

    def runtime_text(self, consultation: ConsultationInput) -> str:
        source_text = " ".join([consultation.doctor_notes or ""] + [turn.text for turn in consultation.transcript])
        corpus = repair_mojibake(self._translate_with_model(source_text, consultation.language)).lower()
        corpus = re.sub(r"\s+", " ", corpus)
        for source, target in sorted(self._phrase_map.items(), key=lambda item: len(item[0]), reverse=True):
            corpus = corpus.replace(source, target)
        return corpus.strip()

    def _translate_with_model(self, text: str, source_lang: str) -> str:
        if not text.strip() or self.model_translator is None:
            return text
        source = (source_lang or "").split("-")[0].lower()
        if source in {"", self.model_target_lang}:
            self.last_model_status = "not_needed_same_language"
            return text
        try:
            translated = self.model_translator.translate(
                text,
                source_lang=source,
                target_lang=self.model_target_lang,
            )
        except Exception as exc:
            self.last_model_status = f"translation_model_fallback:{type(exc).__name__}"
            return text
        self.last_model_status = f"translation_model_used:{getattr(self.model_translator, 'model_name', 'unknown')}"
        return f"{text} {translated}"

from __future__ import annotations

from libs.contracts.patient import ConsultationInput, TranscriptTurn


class TranscriptNormalizer:
    """Normalizes basic whitespace and casing for local development."""

    def normalize(self, consultation: ConsultationInput) -> ConsultationInput:
        turns = [
            TranscriptTurn(speaker=turn.speaker, text=" ".join(turn.text.split())) for turn in consultation.transcript
        ]
        doctor_notes = " ".join((consultation.doctor_notes or "").split()) or None
        return ConsultationInput(language=consultation.language, doctor_notes=doctor_notes, transcript=turns)

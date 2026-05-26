from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile
from services.clinical_understanding.llm_extractor import QwenClinicalExtractor
from services.clinical_understanding.service import ClinicalUnderstandingService


class FakeLevel1Extractor:
    def __init__(self, payload):
        self.payload = payload

    def extract(self, consultation, *, runtime_text=""):
        return dict(self.payload)


class FakeRouter:
    def __init__(self, text: str):
        self.text = text

    def generate_structured_text(self, prompt: str):
        return self.text


def _patient() -> PatientProfile:
    return PatientProfile(patient_id="p1", age_years=30, sex="female", pregnant=False)


def test_qwen_level1_extractor_normalizes_french_json_keys():
    router = FakeRouter(
        '{"symptomes":["fièvre"],"medicaments":["paracetamol"],'
        '"pas_allergie_connue":true,"grossesse":"non enceinte",'
        '"insuffisance_renale":"non","duree_jours":2,"confidence":0.91}'
    )
    extractor = QwenClinicalExtractor(llm_router=router, confidence_threshold=0.65)  # type: ignore[arg-type]
    payload = extractor.extract(ConsultationInput(language="fr", doctor_notes="Fièvre depuis 2 jours"), runtime_text="fever")
    assert payload["explicit_symptoms"] == ["fever"] or payload["explicit_symptoms"] == ["fievre"]
    assert payload["current_medications"] == ["paracetamol"]
    assert payload["no_known_allergy"] is True
    assert payload["pregnancy_status"] == "not_pregnant"
    assert payload["renal_impairment"] == "no"
    assert payload["duration_days"] == 2
    assert payload["accepted_by_confidence"] is True


def test_llm_level1_assist_adds_explicit_symptom_and_metadata():
    service = ClinicalUnderstandingService(
        llm_extractor=FakeLevel1Extractor(
            {
                "explicit_symptoms": ["fever"],
                "current_medications": ["paracetamol"],
                "no_known_allergy": True,
                "duration_days": 2,
                "confidence": 0.95,
                "accepted_by_confidence": True,
            }
        ),
        llm_extraction_mode="assist",
    )
    snapshot = service.build_snapshot(
        _patient(),
        ConsultationInput(language="fr", doctor_notes="Le patient demande conseil. Traitement par paracetamol."),
    )
    assert "fever" in snapshot.normalized_symptoms
    assert "paracetamol" in snapshot.extracted_context.get("current_medications", []) or "paracetamol" in snapshot.normalized_runtime_text
    ctx = snapshot.extracted_context["llm_level1_extraction"]
    assert ctx["accepted"] is True
    assert "fever" in ctx["added_symptoms"]
    assert "clear symptom description" not in snapshot.missing_critical_information
    assert "symptom duration" not in snapshot.missing_critical_information


def test_llm_level1_conflict_keeps_static_safety_positive_and_routes_review():
    service = ClinicalUnderstandingService(
        llm_extractor=FakeLevel1Extractor(
            {
                "explicit_symptoms": ["fever"],
                "renal_impairment": "no",
                "confidence": 0.9,
                "accepted_by_confidence": True,
            }
        ),
        llm_extraction_mode="assist",
    )
    snapshot = service.build_snapshot(
        _patient(),
        ConsultationInput(language="fr", doctor_notes="Fievre depuis 2 jours avec insuffisance renale connue. Sans allergie."),
    )
    assert snapshot.risk_flags.renal_risk is True
    assert snapshot.route_recommendation == "review"
    ctx = snapshot.extracted_context["llm_level1_extraction"]
    assert "renal_mentioned" in ctx["conflicts"]
    assert any("llm_static_extraction_conflict:renal_mentioned" in item for item in snapshot.extracted_context.get("unresolved_flags", []))


def test_llm_level1_shadow_records_without_changing_static_extraction():
    service = ClinicalUnderstandingService(
        llm_extractor=FakeLevel1Extractor(
            {
                "explicit_symptoms": ["fever"],
                "confidence": 0.95,
                "accepted_by_confidence": True,
            }
        ),
        llm_extraction_mode="shadow",
    )
    snapshot = service.build_snapshot(
        _patient(),
        ConsultationInput(language="fr", doctor_notes="Le patient demande conseil."),
    )
    assert "fever" not in snapshot.normalized_symptoms
    assert snapshot.extracted_context["llm_level1_extraction"]["status"] == "shadow_only"


def test_selective_policy_skips_qwen_for_simple_high_confidence_case():
    class CountingExtractor(FakeLevel1Extractor):
        def __init__(self):
            super().__init__({"explicit_symptoms": ["headache"], "confidence": 0.99, "accepted_by_confidence": True})
            self.calls = 0
        def extract(self, consultation, *, runtime_text=""):
            self.calls += 1
            return super().extract(consultation, runtime_text=runtime_text)

    extractor = CountingExtractor()
    service = ClinicalUnderstandingService(
        llm_extractor=extractor,
        llm_extraction_mode="assist",
        llm_extraction_policy="selective",
    )
    snapshot = service.build_snapshot(
        _patient(),
        ConsultationInput(language="fr", doctor_notes="Fievre depuis 2 jours. Pas d'allergie connue. Non enceinte."),
    )
    ctx = snapshot.extracted_context["llm_level1_extraction"]
    assert extractor.calls == 0
    assert ctx["status"] == "skipped_by_policy"
    assert ctx["policy_reason"] == "static_extraction_confident"


def test_selective_policy_runs_qwen_when_static_parser_has_no_symptom():
    class CountingExtractor(FakeLevel1Extractor):
        def __init__(self):
            super().__init__({"explicit_symptoms": ["fever"], "confidence": 0.95, "accepted_by_confidence": True})
            self.calls = 0
        def extract(self, consultation, *, runtime_text=""):
            self.calls += 1
            return super().extract(consultation, runtime_text=runtime_text)

    extractor = CountingExtractor()
    service = ClinicalUnderstandingService(
        llm_extractor=extractor,
        llm_extraction_mode="assist",
        llm_extraction_policy="selective",
    )
    snapshot = service.build_snapshot(
        _patient(),
        ConsultationInput(language="fr", doctor_notes="Le patient demande conseil. Traitement par paracetamol."),
    )
    ctx = snapshot.extracted_context["llm_level1_extraction"]
    assert extractor.calls == 1
    assert ctx["accepted"] is True
    assert ctx["policy_reason"] == "no_clear_symptom"
    assert "fever" in snapshot.normalized_symptoms

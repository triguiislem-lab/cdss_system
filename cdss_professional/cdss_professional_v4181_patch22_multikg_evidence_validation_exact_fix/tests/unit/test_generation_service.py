from libs.contracts.evidence import EvidenceBundle, EvidenceChunk, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from services.generation.prescription_generator import PrescriptionGenerator
from services.generation.service import GenerationService


def test_generation_service_builds_structured_plan_with_notes() -> None:
    service = GenerationService()
    snapshot = PatientSnapshot(
        patient=PatientProfile(
            patient_id="p-200",
            age_years=34,
            sex="female",
            current_medications=["metformin"],
        ),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever", "sore throat"],
        suspected_conditions=["viral syndrome"],
        risk_flags=RiskFlags(),
    )
    evidence = EvidenceBundle(
        vector_chunks=[
            EvidenceChunk(
                source="guideline",
                title="URTI supportive care",
                content="Hydration, rest, and paracetamol may help symptomatic relief.",
                score=0.9,
            )
        ],
        local_products=[
            LocalProductEvidence(
                product_name="Doliprane 500",
                active_ingredient="paracetamol",
                strength="500 mg",
                dosage_form="tablet",
                score=0.8,
            )
        ],
        merged_summary="Supportive care with paracetamol appears locally available.",
    )

    plan = service.draft(snapshot, evidence)

    assert plan.problem_summary
    assert plan.triage_recommendation == "outpatient_follow_up"
    assert plan.medications
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].supporting_evidence
    assert plan.generation_notes
    assert plan.confidence is not None


class _IncompleteQwenRouter:
    def generate_structured_text(self, prompt, *, snapshot=None, evidence=None):
        return """
{"medications": [{"active_ingredient": "paracetamol", "dose": "500mg", "frequency": "unspecified", "duration": "unspecified", "route": "oral"}]}
note: llm_model_used=true backend=transformers model=test-qwen
""".strip()

    def generate_fallback_text(self, snapshot, evidence):
        return "medication: paracetamol | symptomatic relief | 500 mg | every 8 hours | 3 days | oral | fallback complete dose"


class _EmptyQwenRouter:
    def generate_structured_text(self, prompt, *, snapshot=None, evidence=None):
        return """
problem_summary: Uncomplicated fever
triage: outpatient_follow_up
note: llm_model_used=true backend=transformers model=test-qwen
""".strip()

    def generate_fallback_text(self, snapshot, evidence):
        return "medication: paracetamol | symptomatic relief | 500 mg | every 8 hours | 3 days | oral | fallback complete dose"


def test_prescription_generator_completes_incomplete_qwen_medication() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-qwen-incomplete", age_years=30, sex="female"),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever"],
        suspected_conditions=[],
        risk_flags=RiskFlags(),
        route_recommendation="prescription",
    )

    plan = PrescriptionGenerator(llm_router=_IncompleteQwenRouter()).generate(snapshot, EvidenceBundle())

    assert len(plan.medications) == 1
    assert plan.medications[0].dose == "500 mg"
    assert plan.medications[0].frequency == "every 8 hours"
    assert plan.medications[0].duration == "3 days"
    assert any("incomplete medication fields detected" in note for note in plan.generation_notes)


def test_prescription_generator_completes_empty_qwen_prescription_plan() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-qwen-empty", age_years=30, sex="female"),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever"],
        suspected_conditions=[],
        risk_flags=RiskFlags(),
        route_recommendation="prescription",
    )

    plan = PrescriptionGenerator(llm_router=_EmptyQwenRouter()).generate(snapshot, EvidenceBundle())

    assert len(plan.medications) == 1
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].frequency == "every 8 hours"
    assert any("fallback_reason=empty_medication_plan_after_qwen" in note for note in plan.generation_notes)
    assert any("raw_llm_output_length=" in note for note in plan.generation_notes)

from __future__ import annotations

from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from services.order_extraction.service import MedicalOrderExtractionService
from services.orchestration.action_builder import ClinicalActionBuilder
from services.planning.execution_planner import ExecutionPlanner
from services.retrieval.multilingual_stack import MultilingualRetrievalStack
from services.safety.post_generation_validator import PostGenerationSafetyValidator
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan


def _snapshot(text: str, route: str = "prescription"):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p1", age_years=30, sex="female", pregnant=False),
        consultation=ConsultationInput(doctor_notes=text),
        normalized_runtime_text=text,
        route_recommendation=route,
    )


def test_activation_defaults_are_passive():
    c = RuntimePipelineConfig()
    assert c.safety_policy_mode == "audit"
    assert c.clinical_action_enabled is False
    assert c.medical_order_extraction_mode == "off"
    assert c.post_generation_validator_mode == "off"
    assert c.multilingual_retrieval_enabled is False


def test_medical_order_patient_request_not_authorized():
    result = MedicalOrderExtractionService().extract(ConsultationInput(doctor_notes="Patient requests amoxicillin for viral sore throat."))
    assert "amoxicillin" in result.requested_medications
    assert result.authorized_medications == []


def test_medical_order_already_taken_detected():
    result = MedicalOrderExtractionService().extract(ConsultationInput(doctor_notes="Patient already took paracetamol today."))
    assert "paracetamol" in result.already_taken_medications


def test_clinical_action_review_explains_no_prescription():
    snap = _snapshot("Pregnant patient with fever needs review.", route="review")
    plan = ExecutionPlanner(policy_mode="audit").plan(snap)
    action = ClinicalActionBuilder().build(snap, plan)
    assert action.route in {"review", "emergency"}
    assert action.allowed_to_generate_prescription is False
    assert action.recommended_actions


def test_post_generation_validator_audit_does_not_mutate_plan():
    snap = _snapshot("Patient on warfarin asks for ibuprofen.")
    plan = ExecutionPlanner(policy_mode="audit").plan(snap)
    med_plan = TherapeuticPlan(
        problem_summary="test",
        medications=[MedicationDraft(active_ingredient="ibuprofen", indication="pain", dose="200 mg", frequency="once", duration="1 day")],
    )
    out_plan, result = PostGenerationSafetyValidator().validate(snap, med_plan, plan, mode="audit")
    assert out_plan.medications
    assert result.safe is False
    assert result.removed_medications


def test_multilingual_stack_does_not_download_by_default():
    stack = MultilingualRetrievalStack()
    status = stack.validate_offline_assets()
    assert status["offline_safe"] is True
    assert status["enabled"] is False


def test_clinical_safe_test_runtime_profile_enforces_professional_guards():
    from libs.config.runtime import RuntimePipelineConfig

    config = RuntimePipelineConfig.clinical_safe_test()
    assert config.safety_policy_mode == "enforce"
    assert config.medical_order_extraction_mode == "enforce"
    assert config.post_generation_validator_mode == "enforce"
    assert config.clinical_action_enabled is True

from __future__ import annotations

from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.generation.output_parser import OutputParser
from services.orchestration.pipeline import PrescriptionPipeline
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner


def _pipeline_result(text: str, *, patient: PatientProfile | None = None):
    pipeline = PrescriptionPipeline(config=RuntimePipelineConfig.clinical_safe_test())
    return pipeline.draft(
        DraftPrescriptionCommand(
            request_id="patch12-case",
            patient=patient or PatientProfile(patient_id="p12", age_years=35, sex="female"),
            consultation=ConsultationInput(language="fr", doctor_notes=text),
        )
    )


def _plan(text: str, symptoms: list[str] | None = None):
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p12-plan", age_years=35, sex="female"),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_runtime_text=text,
        normalized_symptoms=symptoms or [],
        route_recommendation="prescription",
    )
    orders = MedicalOrderExtractionService().extract(snapshot)
    return orders, ExecutionPlanner(policy_mode="audit").plan(snapshot, medical_orders=orders)


def test_patch12_antibiotic_review_draft_allowed_generates_non_empty_draft_and_localizes():
    result = _pipeline_result("Pas d allergie. Médecin prescrit AMOXAL 500 mg pour angine bactérienne confirmée.")
    plan = result.execution_plan
    assert plan is not None
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.allowed_to_generate is True
    assert plan.target_ingredients == ["amoxicillin"]
    assert result.status == "ready_for_review"
    assert result.blocked is False
    assert [(m.active_ingredient, m.dose) for m in result.draft_plan.medications] == [("amoxicillin", "500 mg")]
    assert result.proposal.localized_medications
    assert result.proposal.localized_medications[0].strength.lower().startswith("500")


def test_patch12_empty_allowed_generation_fails_closed_when_no_fallback_exists():
    pipeline = PrescriptionPipeline(config=RuntimePipelineConfig.clinical_safe_test())
    # Simulate future bad config by clearing review fallback after import.
    from services.generation import target_guardrails

    original = target_guardrails.DEFAULT_TARGET_MEDICATIONS.pop("amoxicillin", None)
    try:
        result = pipeline.draft(
            DraftPrescriptionCommand(
                request_id="patch12-empty-abx",
                patient=PatientProfile(patient_id="p-empty", age_years=35, sex="female"),
                consultation=ConsultationInput(language="fr", doctor_notes="Pas d allergie. Médecin prescrit AMOXAL 500 mg pour angine bactérienne confirmée."),
            )
        )
    finally:
        if original is not None:
            target_guardrails.DEFAULT_TARGET_MEDICATIONS["amoxicillin"] = original
    assert result.execution_plan is not None and result.execution_plan.allowed_to_generate is True
    assert result.draft_plan.medications == []
    assert result.blocked is True
    assert any("empty medication plan" in reason.lower() for reason in result.proposal.blocked_reasons)


def test_patch12_nsaid_policy_strength_and_canonicalization_full_pipeline():
    incomplete = _pipeline_result("Médecin prescrit Brufen 400 mg pour douleur.")
    assert incomplete.execution_plan is not None
    assert incomplete.execution_plan.sub_route != "review_draft_allowed"
    assert incomplete.execution_plan.allowed_to_generate is False
    assert incomplete.draft_plan.medications == []

    complete = _pipeline_result(
        "Patient sans anticoagulant, pas enceinte, pas d ulcère, fonction rénale normale. "
        "Médecin prescrit Brufen 400 mg pour douleur."
    )
    plan = complete.execution_plan
    assert plan is not None
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.target_ingredients == ["ibuprofen"]
    assert plan.target_strength == "400 mg"
    assert plan.blocked_candidate_ingredients == []
    assert plan.candidates_requiring_review == ["ibuprofen"]
    assert [(m.active_ingredient, m.dose) for m in complete.draft_plan.medications] == [("ibuprofen", "400 mg")]
    assert complete.proposal.localized_medications
    assert complete.proposal.localized_medications[0].strength.lower().startswith("400")


def test_patch12_output_parser_canonicalizes_final_dci_spelling():
    raw = TherapeuticPlan(
        problem_summary="pain",
        medications=[
            MedicationDraft(active_ingredient="ibuprofenee", indication="pain", dose="400 mg", frequency="every 8 hours", duration="3 days"),
            MedicationDraft(active_ingredient="amoxicilline", indication="infection", dose="500 mg", frequency="every 8 hours", duration="7 days"),
        ],
    )
    normalized = OutputParser()._normalize_plan(raw)
    assert [m.active_ingredient for m in normalized.medications] == ["ibuprofen", "amoxicillin"]


def test_patch12_explicit_simple_medicines_promote_parser_low_confidence_to_draft():
    cases = [
        ("Médecin prescrit paracétamol 500 mg.", "paracetamol", "500 mg"),
        ("Médecin recommande cétirizine pour rhinite allergique.", "cetirizine", "10 mg"),
        ("Médecin recommande un antihistaminique pour rhinite allergique.", "cetirizine", "10 mg"),
        ("Médecin prescrit Omeprazole 20 mg pour reflux simple.", "omeprazole", "20 mg"),
    ]
    for text, expected, dose in cases:
        result = _pipeline_result(text)
        assert result.execution_plan is not None
        assert result.execution_plan.route == "prescription"
        assert result.execution_plan.display_route == "draft_prescription"
        assert result.blocked is False
        assert result.draft_plan.medications
        assert result.draft_plan.medications[0].active_ingredient == expected
        assert result.draft_plan.medications[0].dose == dose


def test_patch12_required_age_weight_only_missing_when_absent_or_child():
    _, plan = _plan("Médecin prescrit paracétamol 500 mg.")
    assert "age" not in plan.missing_critical_information
    assert "weight" not in plan.missing_critical_information

    child_snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="child", age_years=6, sex="male"),
        consultation=ConsultationInput(language="fr", doctor_notes="Médecin prescrit paracétamol 500 mg."),
        normalized_runtime_text="Médecin prescrit paracétamol 500 mg.",
        route_recommendation="prescription",
    )
    orders = MedicalOrderExtractionService().extract(child_snapshot)
    child_plan = ExecutionPlanner(policy_mode="audit").plan(child_snapshot, medical_orders=orders)
    assert "age" not in child_plan.missing_critical_information
    assert "weight" in child_plan.missing_critical_information


def test_patch12_no_known_allergy_then_doctor_prescribes_same_drug_authorized():
    result = _pipeline_result("No known allergy to Doliprane. Doctor prescribes Doliprane 500 mg.")
    mentions = result.medical_order_extraction.get("medication_mentions", [])
    assert any(m["medication"] == "paracetamol" and m["authorization_status"] == "authorized" for m in mentions)
    assert result.execution_plan is not None
    assert result.execution_plan.route == "prescription"
    assert result.draft_plan.medications[0].active_ingredient == "paracetamol"


def test_patch12_arabic_patient_request_and_doctor_instruction_cues():
    service = MedicalOrderExtractionService()
    request = service.extract(PatientSnapshot(
        patient=PatientProfile(patient_id="ar1", age_years=30),
        consultation=ConsultationInput(language="ar", doctor_notes="المريض يطلب Doliprane للسخانة"),
        normalized_runtime_text="المريض يطلب Doliprane للسخانة",
        route_recommendation="prescription",
    ))
    assert any(m.medication == "paracetamol" and m.authorization_status == "requested_not_authorized" for m in request.medication_mentions)

    authorized = service.extract(PatientSnapshot(
        patient=PatientProfile(patient_id="ar2", age_years=30),
        consultation=ConsultationInput(language="ar", doctor_notes="الطبيب وصف Doliprane 500 mg للسخانة"),
        normalized_runtime_text="الطبيب وصف Doliprane 500 mg للسخانة",
        route_recommendation="prescription",
    ))
    assert any(m.medication == "paracetamol" and m.authorization_status == "authorized" for m in authorized.medication_mentions)

    avoid = service.extract(PatientSnapshot(
        patient=PatientProfile(patient_id="ar3", age_years=30),
        consultation=ConsultationInput(language="ar", doctor_notes="الطبيب قال ما نعطيش Doliprane"),
        normalized_runtime_text="الطبيب قال ما نعطيش Doliprane",
        route_recommendation="prescription",
    ))
    assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in avoid.medication_mentions)

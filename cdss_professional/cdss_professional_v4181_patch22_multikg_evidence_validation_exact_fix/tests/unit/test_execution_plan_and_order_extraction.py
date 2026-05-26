from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.safety.policy_engine import SafetyPolicyEngine

def test_execution_plan_prescription_allows_generation():
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="female", weight_kg=65),
        consultation=ConsultationInput(language="fr", doctor_notes="Fievre"),
        normalized_symptoms=["fever"],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text="fever",
        route_recommendation="prescription",
    )
    plan = ExecutionPlanner().plan(snapshot)
    assert plan.route == "prescription"
    assert plan.allowed_to_generate is True
    assert plan.localization_required is True
    assert "generation" in plan.required_modules

def test_execution_plan_review_skips_generation():
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="female", weight_kg=65),
        consultation=ConsultationInput(language="fr", doctor_notes="enceinte avec fievre"),
        normalized_symptoms=["fever"],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(pregnancy_risk=True),
        normalized_runtime_text="pregnancy fever",
        route_recommendation="review",
    )
    plan = ExecutionPlanner().plan(snapshot)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.localization_required is False

def test_medical_order_extraction_scaffold():
    result = MedicalOrderExtractionService().extract(
        ConsultationInput(language="fr", doctor_notes="Demander NFS et CRP. Paracetamol si besoin. Controle dans 48h.")
    )
    types = {order.order_type for order in result.orders}
    assert {"lab", "medication", "followup"}.issubset(types)


def test_execution_planner_consumes_explicit_policy_decision():
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="female", weight_kg=65, current_medications=["warfarin"]),
        consultation=ConsultationInput(language="fr", doctor_notes="Patient asks for ibuprofen."),
        normalized_symptoms=["pain"],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text="patient on warfarin asks for ibuprofen",
        route_recommendation="prescription",
    )
    medical_orders = MedicalOrderExtractionService().extract(snapshot)
    decision = SafetyPolicyEngine().evaluate(snapshot, medical_orders=medical_orders)

    plan = ExecutionPlanner(policy_mode="enforce").plan(
        snapshot,
        medical_orders=medical_orders,
        policy_decision=decision,
    )

    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert "ibuprofen" in plan.forbidden_ingredients
    assert plan.policy_audit.get("policy_reason_code") == "anticoagulant_nsaid_interaction"

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.safety.policy_engine import SafetyPolicyEngine

_EXTRACTOR = MedicalOrderExtractionService()
_POLICY = SafetyPolicyEngine()
_PLANNER = ExecutionPlanner(policy_mode="enforce")


def _snapshot(patient: PatientProfile, note: str, symptoms=None, route="prescription"):
    return PatientSnapshot(
        patient=patient,
        consultation=ConsultationInput(language="fr", doctor_notes=note),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=note,
        route_recommendation=route,
    )


def _preplan(patient: PatientProfile, note: str, symptoms=None):
    snap = _snapshot(patient, note, symptoms=symptoms)
    orders = _EXTRACTOR.extract(snap)
    policy = _POLICY.evaluate(snap, medical_orders=orders)
    plan = _PLANNER.plan(snap, medical_orders=orders, policy_decision=policy)
    return orders, policy, plan


def test_paracetamol_doliprane_overuse_blocks_and_keeps_review_blocked_display():
    _, policy, plan = _preplan(
        PatientProfile(patient_id="p-overuse", age_years=38, sex="female", weight_kg=58),
        "Fièvre. J'ai déjà pris 8 comprimés de Doliprane 500 mg depuis ce matin et un sachet grippe qui contient aussi du paracétamol.",
        symptoms=["fever"],
    )
    assert policy.reason_code == "paracetamol_already_taken_overuse_structured"
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"
    assert plan.allowed_to_generate is False
    assert "paracetamol" in plan.forbidden_ingredients


def test_arabizi_doliprane_overuse_blocks():
    orders, policy, plan = _preplan(
        PatientProfile(patient_id="p-arabizi", age_years=30, sex="male", weight_kg=70),
        "3andi s5ana, khdhit doliprane barcha depuis ce matin, nheb zeda doliprane.",
        symptoms=["fever"],
    )
    assert "paracetamol" in orders.already_taken_medications
    assert policy.reason_code == "paracetamol_already_taken_overuse_structured"
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"


def test_child_codeine_cough_blocks():
    _, policy, plan = _preplan(
        PatientProfile(patient_id="p-child-codeine", age_years=5, sex="male", weight_kg=18),
        "Enfant avec toux. Parent demande sirop codeine pour la toux.",
        symptoms=["cough"],
    )
    assert policy.reason_code == "child_codeine_cough_review"
    assert plan.route == "review"
    assert "codeine" in plan.forbidden_ingredients


def test_fractional_infant_age_is_accepted_and_routes_emergency():
    patient = PatientProfile(patient_id="p-infant", age_years=0.17, sex="male", weight_kg=5.2)
    assert patient.age_months == 2
    _, policy, plan = _preplan(patient, "Nourrisson de deux mois avec fievre 38.6, boit moins.", symptoms=["fever"])
    assert policy.reason_code == "young_infant_fever_emergency"
    assert plan.route == "emergency"
    assert plan.sub_route == "emergency"

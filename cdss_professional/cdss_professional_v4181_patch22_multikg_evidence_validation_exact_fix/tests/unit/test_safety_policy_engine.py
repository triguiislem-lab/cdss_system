from libs.contracts.patient import PatientProfile, ConsultationInput, PatientSnapshot, RiskFlags
from services.safety.policy_engine import SafetyPolicyEngine


def make_snapshot(text, age=30, weight=70, route="prescription"):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="policy_unit", age_years=age, sex="female", weight_kg=weight),
        consultation=ConsultationInput(language="mixed", doctor_notes=text),
        normalized_symptoms=[],
        suspected_conditions=[],
        disease_tags=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=text,
        route_recommendation=route,
    )


def hit_ids(decision):
    return [h.rule_id for h in decision.policy_hits]


def test_warfarin_nsaid_blocks_in_policy():
    decision = SafetyPolicyEngine().evaluate(make_snapshot("Patient on warfarin asks for ibuprofen."))
    assert "anticoagulant_nsaid_interaction" in hit_ids(decision)
    assert decision.route_override == "review"
    assert "ibuprofen" in decision.forbidden_ingredients


def test_paracetamol_overuse_blocks_in_policy():
    decision = SafetyPolicyEngine().evaluate(make_snapshot("Patient already took several doses of paracetamol today."))
    assert "paracetamol_overuse_review" in hit_ids(decision)
    assert decision.route_override == "review"


def test_pregnancy_status_missing_negative_control():
    decision = SafetyPolicyEngine().evaluate(make_snapshot("Adult fever. Pregnancy status missing; ask pregnancy status."))
    assert "pregnancy_preeclampsia_red_flags" not in hit_ids(decision)


def test_simple_fever_negative_control():
    decision = SafetyPolicyEngine().evaluate(make_snapshot("Adult fever, not pregnant, no allergy."))
    assert "pregnancy_preeclampsia_red_flags" not in hit_ids(decision)
    assert "paracetamol_overuse_review" not in hit_ids(decision)

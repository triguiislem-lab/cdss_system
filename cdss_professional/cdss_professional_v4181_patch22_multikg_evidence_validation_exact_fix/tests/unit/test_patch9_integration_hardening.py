from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.main import app
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.utils.medical_text import normalize_search_text
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.safety.policy_engine import SafetyPolicyEngine

client = TestClient(app)


def _snapshot(text: str, symptoms: list[str] | None = None, *, current_meds: list[str] | None = None) -> PatientSnapshot:
    return PatientSnapshot(
        patient=PatientProfile(patient_id="patch9-p", age_years=30, sex="female", weight_kg=65, current_medications=current_meds or []),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=normalize_search_text(text),
        route_recommendation="prescription",
    )


def _draft_payload(request_id: str = "req-patch9") -> dict:
    return {
        "request_id": request_id,
        "patient": {
            "patient_id": "patient-patch9",
            "age_years": 35,
            "sex": "female",
            "pregnant": False,
            "known_allergies": [],
            "current_medications": [],
            "chronic_conditions": [],
        },
        "consultation": {
            "language": "fr",
            "doctor_notes": "Médecin recommande Doliprane 500 mg pour fièvre légère.",
            "transcript": [],
        },
    }


def test_patch9_rhinite_allergique_does_not_forbid_cetirizine_or_class():
    snapshot = _snapshot("Médecin recommande cétirizine pour rhinite allergique.", symptoms=["allergic rhinitis"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert any(m.medication == "cetirizine" and m.authorization_status == "authorized" for m in orders.medication_mentions)
    assert "cetirizine" not in orders.forbidden_ingredients
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["cetirizine"]

    class_snapshot = _snapshot("Médecin recommande un antihistaminique pour rhinite allergique.", symptoms=["allergic rhinitis"])
    class_orders = MedicalOrderExtractionService().extract(class_snapshot)
    assert class_orders.authorized_therapeutic_classes == ["antihistamine"]
    class_plan = ExecutionPlanner(policy_mode="off").plan(class_snapshot, medical_orders=class_orders)
    assert class_plan.route == "prescription"
    assert class_plan.target_ingredients == ["cetirizine"]


def test_patch9_true_drug_allergy_still_forbids_medicine():
    for text, dci in [("Allergique à cétirizine.", "cetirizine"), ("Allergie au Doliprane.", "paracetamol")]:
        snapshot = _snapshot(text)
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == dci and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        assert dci in orders.forbidden_ingredients
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert dci in plan.true_forbidden_ingredients


def test_patch9_strength_does_not_leak_between_medications_and_backward_strength_works():
    snapshot = _snapshot("Patient sous SINTROM. Médecin prescrit BRUFEN 400 mg pour douleur.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    by_med = {m.medication: m for m in orders.medication_mentions}
    assert by_med["acenocoumarol"].strength is None
    assert by_med["ibuprofen"].strength == "400 mg"

    backward = _snapshot("Médecin prescrit 500 mg de Doliprane.", symptoms=["fever"])
    back_orders = MedicalOrderExtractionService().extract(backward)
    assert any(m.medication == "paracetamol" and m.strength == "500 mg" for m in back_orders.medication_mentions)


def test_patch9_negated_anticoagulant_does_not_trigger_nsaid_policy_but_positive_current_does():
    for text in [
        "Le patient ne prend pas Sintrom. Médecin prescrit Brufen 400 mg pour douleur.",
        "Patient sans anticoagulant. Médecin prescrit Brufen 400 mg pour douleur.",
        "Patient nie anticoagulant. Médecin prescrit Brufen 400 mg pour douleur.",
    ]:
        snapshot = _snapshot(text, symptoms=["pain"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        decision = SafetyPolicyEngine().evaluate(snapshot, medical_orders=orders)
        assert decision.reason_code != "anticoagulant_nsaid_interaction"
        plan = ExecutionPlanner(policy_mode="enforce").plan(snapshot, medical_orders=orders, policy_decision=decision)
        assert plan.policy_audit.get("policy_reason_code") != "anticoagulant_nsaid_interaction"

    positive = _snapshot("Patient sous Sintrom. Médecin prescrit Brufen 400 mg pour douleur.", symptoms=["pain"])
    pos_orders = MedicalOrderExtractionService().extract(positive)
    pos_decision = SafetyPolicyEngine().evaluate(positive, medical_orders=pos_orders)
    assert pos_decision.reason_code == "anticoagulant_nsaid_interaction"


def test_patch9_short_generated_alias_fer_is_blocked_without_med_context():
    snapshot = _snapshot("Le patient mentionne fer dans son alimentation.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert not any(m.medication == "fer" for m in orders.medication_mentions)


def test_patch9_feedback_final_plan_captures_local_product_fields_and_validates_reason_codes():
    draft = client.post("/v1/prescriptions/draft", json=_draft_payload("req-patch9-feedback")).json()
    trace_id = draft["trace_id"]
    final_plan = {
        "problem_summary": "Fièvre légère",
        "medications": [
            {
                "active_ingredient": "paracetamol",
                "indication": "fever",
                "dose": "500 mg",
                "frequency": "every 8 hours if needed",
                "duration": "2 days",
                "route": "oral",
                "local_product_name": "ADOL",
                "local_strength": "500 mg",
                "dosage_form": "tablet",
                "localization_notes": ["clinician selected Tunisian product"],
            }
        ],
        "non_drug_recommendations": [],
        "monitoring": [],
        "unresolved_questions": [],
        "generation_notes": [],
        "triage_recommendation": "clinician_review",
        "confidence": 0.8,
    }
    response = client.post(
        f"/v1/prescriptions/{trace_id}/feedback",
        json={
            "clinician_id": "dr_patch9",
            "decision": "approved_with_edits",
            "final_plan": final_plan,
            "reason_codes": ["local_product_changed"],
            "field_edits": [{"field": "medications[0].local_product_name", "new_value": "ADOL", "reason_code": "local_product_changed"}],
        },
    )
    assert response.status_code == 200, response.text
    event = response.json()["event"]
    assert event["final_plan_hash"]
    assert any(edit["field"] == "medications[0].local_product_name" for edit in event["field_edits"])
    assert any("local_product_name" in edit["field"] for edit in event["inferred_field_edits"])

    bad = client.post(
        f"/v1/prescriptions/{trace_id}/feedback",
        json={"clinician_id": "dr_patch9", "decision": "rejected", "reason_codes": ["not_a_real_code"]},
    )
    assert bad.status_code == 422


def test_patch9_legacy_approve_reject_revise_delegate_to_structured_feedback():
    draft = client.post("/v1/prescriptions/draft", json=_draft_payload("req-patch9-legacy")).json()
    trace_id = draft["trace_id"]

    approved = client.post(f"/v1/prescriptions/{trace_id}/approve", json={"clinician_id": "dr_legacy"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["event"]["decision"] == "approved_as_is"
    assert approved.json()["event"]["feedback_use_policy"] == "offline_evaluation_only"

    rejected = client.post(
        f"/v1/prescriptions/{trace_id}/reject",
        json={"clinician_id": "dr_legacy", "reason_codes": ["wrong_dose"], "notes": "dose issue"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["event"]["decision"] == "rejected"

    revised = client.post(
        f"/v1/prescriptions/{trace_id}/revise",
        json={"clinician_id": "dr_legacy", "notes": "need dose change", "requested_changes": {"medications[0].dose": "500 mg"}},
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["event"]["decision"] == "revise_requested"
    assert revised.json()["event"]["field_edits"][0]["field"] == "medications[0].dose"

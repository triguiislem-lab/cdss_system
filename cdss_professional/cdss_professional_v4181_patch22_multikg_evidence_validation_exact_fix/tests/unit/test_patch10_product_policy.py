from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.utils.medical_text import normalize_search_text
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner


def _snapshot(text: str, symptoms: list[str] | None = None, *, current_meds=None) -> PatientSnapshot:
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p10", age_years=35, sex="female", weight_kg=65, current_medications=current_meds or []),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=normalize_search_text(text),
        route_recommendation="prescription",
    )


def _plan(text: str, symptoms: list[str] | None = None):
    snap = _snapshot(text, symptoms)
    orders = MedicalOrderExtractionService().extract(snap)
    return orders, ExecutionPlanner(policy_mode="off").plan(snap, medical_orders=orders)


def test_postposed_plural_authorization_for_listed_medicines():
    orders, plan = _plan("Doliprane 500 mg et Brufen 400 mg prescrits.", ["pain"])
    assert any(m.medication == "paracetamol" and m.authorization_status == "authorized" for m in orders.medication_mentions)
    assert any(m.medication == "ibuprofen" and m.authorization_status == "authorized" for m in orders.medication_mentions)
    assert any(m.strength == "500 mg" for m in orders.medication_mentions if m.medication == "paracetamol")
    assert any(m.strength == "400 mg" for m in orders.medication_mentions if m.medication == "ibuprofen")


def test_absence_allergie_does_not_forbid_doliprane():
    orders, plan = _plan("Absence allergie Doliprane. Fièvre.", ["fever"])
    assert "paracetamol" not in orders.forbidden_ingredients
    assert "paracetamol" not in plan.true_forbidden_ingredients


def test_short_alias_fer_requires_medication_context():
    no_ctx = MedicalOrderExtractionService().extract(_snapshot("Le patient parle du fer dans son alimentation."))
    assert not any(m.medication == "iron" for m in no_ctx.medication_mentions)
    with_ctx = MedicalOrderExtractionService().extract(_snapshot("Fer 80 mg prescrit pour anémie ferriprive."))
    assert any(m.medication == "iron" for m in with_ctx.medication_mentions)


def test_dci_synonym_metformine_extracted_but_chronic_review_packet_only():
    orders, plan = _plan("Médecin prescrit metformine pour diabète.")
    assert any(m.medication == "metformin" for m in orders.medication_mentions)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False


def test_doctor_authorized_antibiotic_can_be_review_draft_allowed_with_required_context():
    orders, plan = _plan("Pas d allergie. Médecin prescrit AMOXAL 500 mg pour angine bactérienne confirmée.")
    assert any(m.medication == "amoxicillin" and m.authorization_status == "authorized" for m in orders.medication_mentions)
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.allowed_to_generate is True
    assert "amoxicillin" in plan.target_ingredients


def test_doctor_authorized_nsaid_can_be_review_draft_allowed_when_risk_negative():
    orders, plan = _plan("Patient sans anticoagulant, pas enceinte, pas d ulcère, fonction rénale normale. Médecin prescrit Brufen 400 mg pour douleur.", ["pain"])
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.allowed_to_generate is True
    assert "ibuprofen" in plan.target_ingredients


def test_display_route_added_for_simple_draft():
    orders, plan = _plan("Médecin recommande Doliprane 500 mg pour fièvre.", ["fever"])
    assert plan.route == "prescription"
    assert plan.display_route == "draft_prescription"
    assert plan.finalization_status == "doctor_validation_required"


def test_patch11_nsaid_missing_screens_not_review_draft_allowed():
    orders, plan = _plan("Médecin prescrit Brufen 400 mg pour douleur.", ["pain"])
    assert plan.route == "review"
    assert plan.sub_route != "review_draft_allowed"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []


def test_patch11_explicit_brufen_does_not_auto_add_paracetamol_when_screens_complete():
    orders, plan = _plan("Patient sans anticoagulant, pas enceinte, pas d ulcère, fonction rénale normale. Médecin prescrit Brufen 400 mg pour douleur.", ["pain"])
    assert plan.sub_route == "review_draft_allowed"
    assert plan.target_ingredients == ["ibuprofen"]
    assert "paracetamol" not in plan.target_ingredients


def test_patch11_antibiotic_bacterial_confirmed_context_allowed_but_viral_request_still_blocked():
    _, allowed_plan = _plan("Pas d allergie. Médecin prescrit AMOXAL 500 mg pour angine bactérienne confirmée.", ["sore_throat"])
    assert allowed_plan.route == "review"
    assert allowed_plan.sub_route == "review_draft_allowed"
    assert allowed_plan.allowed_to_generate is True
    assert allowed_plan.target_ingredients == ["amoxicillin"]

    _, blocked_plan = _plan("Rhume viral avec toux. Patient demande amoxicilline.", ["cough", "sore_throat"])
    assert blocked_plan.route == "review"
    assert blocked_plan.allowed_to_generate is False
    assert "amoxicillin" in blocked_plan.forbidden_ingredients

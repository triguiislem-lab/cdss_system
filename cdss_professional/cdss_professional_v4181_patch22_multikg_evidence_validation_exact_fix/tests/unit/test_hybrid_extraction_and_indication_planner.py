from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.utils.medical_text import normalize_search_text
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner


def _snapshot(text: str, symptoms: list[str] | None = None) -> PatientSnapshot:
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="female", weight_kg=65),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=normalize_search_text(text),
        route_recommendation="prescription",
    )


def test_arabic_terms_are_preserved_and_do_not_match_empty_string():
    assert normalize_search_text("سخانة") == "سخانة"
    snapshot = _snapshot("Patient asthmatique avec wheezing, demande inhalateur.", symptoms=["wheezing"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert "salbutamol" in plan.target_ingredients
    assert "paracetamol" not in plan.target_ingredients


def test_therapeutic_class_only_is_structured_and_planned_conservatively():
    snapshot = _snapshot("Le médecin propose un antalgique si douleur légère.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.case_type == "therapeutic_class_only"
    assert orders.therapeutic_class_mentions[0].canonical_class == "analgesic_antipyretic"
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]
    assert plan.policy_audit["indication_therapy_planner"]["therapeutic_classes"]


def test_antibiotic_class_only_routes_to_review_without_free_dci_choice():
    snapshot = _snapshot("Rhume viral et toux. Le patient demande un antibiotique.", symptoms=["cough"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.case_type == "therapeutic_class_only"
    assert "antibiotic" in orders.requested_therapeutic_classes
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert "amoxicillin" in plan.forbidden_ingredients


def test_chest_pain_red_flag_case_is_emergency_before_candidate_selection():
    snapshot = _snapshot("Douleur thoracique oppressive avec sueurs et dyspnée.", symptoms=["chest pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.case_type == "emergency"
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "emergency"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []


def test_local_classification_separates_current_and_new_medication_targets():
    snapshot = _snapshot("Le patient prend Sintrom et le médecin prescrit Doliprane 500 mg.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    status_by_med = {m.medication: m.authorization_status for m in orders.medication_mentions}
    assert status_by_med["acenocoumarol"] == "already_taken"
    assert status_by_med["paracetamol"] == "authorized"
    assert orders.case_type == "explicit_medicine"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.allowed_to_generate is True
    assert plan.target_ingredients == ["paracetamol"]


def test_negated_medicine_becomes_forbidden_and_is_not_reintroduced_from_symptoms():
    snapshot = _snapshot("Éviter paracétamol. Fièvre légère.", symptoms=["fever"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert "paracetamol" in orders.forbidden_ingredients

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert "paracetamol" in plan.forbidden_ingredients
    audit = plan.policy_audit["indication_therapy_planner"]
    assert audit["candidate_ingredients"] == []
    assert "paracetamol" in audit["forbidden_ingredients"]


def test_current_anticoagulant_does_not_leak_onto_requested_nsaid_class():
    snapshot = _snapshot("Patient sous Sintrom, douleur, demande anti-inflammatoire.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.already_taken_medications == ["acenocoumarol"]
    class_status = {m.canonical_class: m.status for m in orders.therapeutic_class_mentions}
    assert class_status["nsaid"] == "requested_not_authorized"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert "ibuprofen" in plan.forbidden_ingredients


def test_prescription_route_without_controlled_target_fails_closed_to_review():
    snapshot = _snapshot("Discussion administrative sans symptôme ni médicament.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert plan.block_reason == "no_controlled_target_ingredient"


def test_viral_uri_amoxicillin_request_has_no_candidate_forbidden_antibiotic_only():
    snapshot = _snapshot("Rhume viral, toux, mal de gorge, demande amoxicilline.", symptoms=["cough"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    audit = plan.policy_audit["indication_therapy_planner"]
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert audit["candidate_ingredients"] == []
    assert "amoxicillin" in audit["forbidden_ingredients"]
    assert "amoxicillin" in plan.forbidden_ingredients


def test_patient_data_and_safety_screens_are_split():
    snapshot = _snapshot("Le médecin propose un antalgique si douleur légère.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert "symptom duration" in plan.required_patient_data
    assert "hepatic_impairment" in orders.required_safety_screens
    assert any(screen in plan.required_safety_screens for screen in ["hepatic", "hepatic_impairment"])
    assert "hepatic_impairment" not in plan.required_patient_data


def test_patch3_ne_pas_donner_medicine_is_avoid_not_authorized():
    snapshot = _snapshot("Médecin: ne pas donner Doliprane. Patient a fièvre.", symptoms=["fever"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    status_by_med = {m.medication: m.authorization_status for m in orders.medication_mentions}
    assert status_by_med["paracetamol"] == "negated_or_avoid"
    assert "paracetamol" in orders.forbidden_ingredients

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert "paracetamol" in plan.forbidden_ingredients


def test_patch3_speaker_boundary_patient_takes_doctor_prescribes():
    snapshot = _snapshot("Patient: je prends Sintrom. Doctor: prescribe Doliprane 500 mg.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    status_by_med = {m.medication: m.authorization_status for m in orders.medication_mentions}
    assert status_by_med["acenocoumarol"] == "already_taken"
    assert status_by_med["paracetamol"] == "authorized"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]
    assert "acenocoumarol" not in plan.target_ingredients


def test_patch3_class_only_antalgique_without_symptoms_maps_by_canonical_id():
    snapshot = _snapshot("Médecin prescrit un antalgique.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.case_type == "therapeutic_class_only"
    assert orders.therapeutic_class_mentions[0].canonical_class == "analgesic_antipyretic"
    assert orders.therapeutic_class_mentions[0].status == "authorized"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]
    assert "analgesic_antipyretic" in plan.policy_audit["indication_therapy_planner"]["therapeutic_classes"]


def test_patch3_ne_pas_donner_antibiotique_is_negated_class():
    snapshot = _snapshot("Ne pas donner d’antibiotique.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.therapeutic_class_mentions[0].canonical_class == "antibiotic"
    assert orders.therapeutic_class_mentions[0].status == "negated_or_avoid"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.target_ingredients == []
    assert "antibiotic" in plan.policy_audit["indication_therapy_planner"]["avoid_classes"]
    assert "amoxicillin" in plan.forbidden_ingredients


def test_patch3_patient_request_refused_by_doctor_blocks_same_dci():
    snapshot = _snapshot("Patient demande Doliprane, médecin refuse/évite paracétamol.", symptoms=["fever"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    statuses = [(m.description, m.medication, m.authorization_status) for m in orders.medication_mentions]
    assert ("doliprane", "paracetamol", "requested_not_authorized") in statuses
    assert ("paracetamol", "paracetamol", "negated_or_avoid") in statuses

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert "paracetamol" in plan.forbidden_ingredients


def test_patch3_safety_screens_are_normalized_ids_without_legacy_duplicates():
    snapshot = _snapshot("Fièvre légère.", symptoms=["fever"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert "hepatic_impairment" in plan.required_safety_screens
    assert "overdose_risk" in plan.required_safety_screens
    assert "duplicate_paracetamol" in plan.required_safety_screens
    assert "hepatic" not in plan.required_safety_screens
    assert "overdose" not in plan.required_safety_screens


def test_patch4_repeated_same_alias_request_then_doctor_refusal_blocks_dci():
    snapshot = _snapshot("Patient demande Doliprane. Médecin refuse Doliprane.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    statuses = [(m.description, m.medication, m.authorization_status) for m in orders.medication_mentions]
    assert ("doliprane", "paracetamol", "requested_not_authorized") in statuses
    assert ("doliprane", "paracetamol", "negated_or_avoid") in statuses
    assert "medication_conflict:paracetamol:avoid_overrides_target" in orders.extraction_conflicts
    assert "paracetamol" in orders.forbidden_ingredients
    assert "paracetamol" not in orders.requested_medications

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert "paracetamol" in plan.true_forbidden_ingredients
    assert "paracetamol" in plan.forbidden_ingredients


def test_patch4_ne_prend_pas_current_medication_is_not_already_taken():
    snapshot = _snapshot("Le patient ne prend pas Sintrom. Médecin prescrit Doliprane.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    statuses = {m.medication: m.authorization_status for m in orders.medication_mentions}
    assert statuses["acenocoumarol"] == "not_currently_taking"
    assert statuses["paracetamol"] == "authorized"
    assert orders.already_taken_medications == []
    assert orders.authorized_medications == ["paracetamol"]

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]
    assert "acenocoumarol" not in plan.target_ingredients


def test_patch4_allergy_variants_forbid_mentioned_medicine():
    for text in ["Allergique au Doliprane. Fièvre.", "Allergie Doliprane. Fièvre.", "Intolérance Doliprane. Fièvre."]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        assert "paracetamol" in orders.forbidden_ingredients
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.target_ingredients == []
        assert "paracetamol" in plan.true_forbidden_ingredients


def test_patch4_negative_allergy_statement_does_not_forbid_authorized_medicine():
    snapshot = _snapshot("Pas d allergie au Doliprane. Médecin prescrit Doliprane.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert "paracetamol" not in orders.forbidden_ingredients
    assert any(m.medication == "paracetamol" and m.authorization_status == "authorized" for m in orders.medication_mentions)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]


def test_patch4_expanded_authorization_cues_are_authorized():
    for text in [
        "Médecin donne Doliprane 500 mg.",
        "Médecin recommande Doliprane 500 mg.",
        "Médecin autorise Doliprane 500 mg.",
        "Médecin valide Doliprane 500 mg.",
        "Ok pour Doliprane 500 mg.",
    ]:
        snapshot = _snapshot(text, symptoms=["pain"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "authorized" for m in orders.medication_mentions)
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "prescription"
        assert plan.target_ingredients == ["paracetamol"]


def test_patch4_repeated_same_class_request_then_refusal_creates_class_conflict():
    snapshot = _snapshot("Patient demande anti-inflammatoire. Médecin refuse anti-inflammatoire.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    statuses = [(m.canonical_class, m.status) for m in orders.therapeutic_class_mentions]
    assert ("nsaid", "requested_not_authorized") in statuses
    assert ("nsaid", "negated_or_avoid") in statuses
    assert "therapeutic_class_conflict:nsaid:avoid_overrides_target" in orders.extraction_conflicts
    assert orders.requested_therapeutic_classes == []

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.target_ingredients == []
    assert "nsaid" in plan.policy_audit["indication_therapy_planner"]["avoid_classes"]


def test_patch5_negated_authorization_verbs_forbid_medicine():
    for text in [
        "Le médecin ne prescrit pas Doliprane. Fièvre.",
        "Le médecin ne recommande pas Doliprane. Fièvre.",
        "Le médecin ne donne pas Doliprane. Fièvre.",
        "Le médecin ne conseille pas Doliprane. Fièvre.",
    ]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        assert "paracetamol" in orders.forbidden_ingredients
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.allowed_to_generate is False
        assert plan.target_ingredients == []
        assert "paracetamol" in plan.true_forbidden_ingredients


def test_patch5_discontinuation_verbs_forbid_medicine():
    for text in [
        "Le médecin arrête Doliprane. Fièvre.",
        "Le médecin stoppe Doliprane. Fièvre.",
        "Le médecin suspend Doliprane. Fièvre.",
        "Doliprane à arrêter. Fièvre.",
    ]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        assert "paracetamol" in orders.forbidden_ingredients
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.target_ingredients == []
        assert "paracetamol" in plan.true_forbidden_ingredients


def test_patch5_plain_medication_mention_is_not_prescription_target():
    snapshot = _snapshot("Le patient mentionne Doliprane.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert any(m.medication == "paracetamol" and m.authorization_status == "mentioned_not_authorized" for m in orders.medication_mentions)
    assert orders.authorized_medications == []
    assert orders.case_type == "unclear"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []
    assert plan.block_reason == "no_controlled_target_ingredient"


def test_patch5_negative_allergy_statement_does_not_create_prescription_target():
    snapshot = _snapshot("Aucune allergie Doliprane.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert "paracetamol" not in orders.forbidden_ingredients
    assert any(m.medication == "paracetamol" and m.authorization_status == "mentioned_not_authorized" for m in orders.medication_mentions)
    assert orders.case_type == "unclear"

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []


def test_patch5_patient_request_without_doctor_authorization_requires_review():
    snapshot = _snapshot("Patient demande Doliprane.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert any(m.medication == "paracetamol" and m.authorization_status == "requested_not_authorized" for m in orders.medication_mentions)
    assert orders.authorized_medications == []
    assert orders.requested_medications == ["paracetamol"]

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []


def test_patch6_il_ne_faut_pas_patterns_forbid_medicine():
    for text in [
        "Il ne faut pas donner Doliprane. Fièvre.",
        "Il ne faut pas prescrire Doliprane. Fièvre.",
        "À ne pas donner Doliprane. Fièvre.",
        "A ne pas prescrire Doliprane. Fièvre.",
    ]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        assert "paracetamol" in orders.forbidden_ingredients
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.allowed_to_generate is False
        assert plan.target_ingredients == []
        assert "paracetamol" in plan.true_forbidden_ingredients


def test_patch6_deconseille_and_non_recommande_forbid_medicine():
    for text in [
        "Le médecin déconseille Doliprane. Fièvre.",
        "Le médecin deconseille Doliprane. Fièvre.",
        "Doliprane non recommandé. Fièvre.",
        "Doliprane non recommande. Fièvre.",
    ]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.target_ingredients == []
        assert "paracetamol" in plan.true_forbidden_ingredients


def test_patch6_english_contractions_and_no_x_forbid_medicine():
    for text in [
        "Doctor doesn't prescribe Doliprane. Fever.",
        "Doctor don t recommend Doliprane. Fever.",
        "Doliprane isn't recommended. Fever.",
        "No Doliprane. Fever.",
    ]:
        snapshot = _snapshot(text, symptoms=["fever"])
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert any(m.medication == "paracetamol" and m.authorization_status == "negated_or_avoid" for m in orders.medication_mentions)
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.target_ingredients == []


def test_patch6_plain_and_patient_requested_class_do_not_anchor_prescription():
    for text in ["Antalgique?", "Patient demande un antalgique."]:
        snapshot = _snapshot(text)
        orders = MedicalOrderExtractionService().extract(snapshot)
        assert orders.authorized_therapeutic_classes == []
        plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
        assert plan.route == "review"
        assert plan.allowed_to_generate is False
        assert plan.target_ingredients == []
        assert plan.block_reason == "no_controlled_target_ingredient"


def test_patch6_authorized_class_still_maps_to_controlled_dci():
    snapshot = _snapshot("Médecin recommande un antalgique.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.authorized_therapeutic_classes == ["analgesic_antipyretic"]
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]


def test_patch6_symptom_can_independently_support_candidate_after_patient_class_request():
    snapshot = _snapshot("Patient demande un antalgique pour douleur légère.", symptoms=["pain"])
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert orders.authorized_therapeutic_classes == []
    assert orders.requested_therapeutic_classes == ["analgesic_antipyretic"]
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["paracetamol"]


def test_patch6_repeated_same_dci_with_different_strengths_is_preserved_for_review_audit():
    snapshot = _snapshot("Médecin prescrit Doliprane 500 mg puis Doliprane 1000 mg.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    paracetamol_mentions = [m for m in orders.medication_mentions if m.medication == "paracetamol" and m.authorization_status == "authorized"]
    strengths = {m.strength for m in paracetamol_mentions}
    assert "500 mg" in strengths
    assert "1000 mg" in strengths
    assert len(paracetamol_mentions) >= 2


def test_patch6_no_allergy_statement_still_does_not_forbid_or_prescribe():
    snapshot = _snapshot("No allergy Doliprane.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert "paracetamol" not in orders.forbidden_ingredients
    assert any(m.medication == "paracetamol" and m.authorization_status == "mentioned_not_authorized" for m in orders.medication_mentions)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.target_ingredients == []

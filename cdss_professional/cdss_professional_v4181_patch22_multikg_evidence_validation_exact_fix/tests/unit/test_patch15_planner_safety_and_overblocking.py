from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags, TranscriptTurn
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.safety.policy_engine import SafetyPolicyEngine
from services.orchestration.pipeline import _align_snapshot_with_execution_plan
from services.retrieval.kg_retriever import KGRetriever

_EXTRACTOR = MedicalOrderExtractionService()
_POLICY = SafetyPolicyEngine()
_PLANNER = ExecutionPlanner(policy_mode="enforce")


def _snapshot(patient: PatientProfile, note: str, transcript=None, symptoms=None, route="prescription"):
    return PatientSnapshot(
        patient=patient,
        consultation=ConsultationInput(
            language="fr",
            doctor_notes=note,
            transcript=[TranscriptTurn(speaker=s, text=t) for s, t in (transcript or [])],
        ),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=" ".join([note, *(t for _, t in (transcript or []))]),
        route_recommendation=route,
    )


def _preplan(patient: PatientProfile, note: str, transcript=None, symptoms=None):
    snap = _snapshot(patient, note, transcript=transcript, symptoms=symptoms)
    orders = _EXTRACTOR.extract(snap)
    policy = _POLICY.evaluate(snap, medical_orders=orders)
    plan = _PLANNER.plan(snap, medical_orders=orders, policy_decision=policy)
    return snap, orders, policy, plan


def test_route_snapshot_alignment_removes_prescription_review_blocked_inconsistency():
    snap, _, policy, plan = _preplan(
        PatientProfile(patient_id="p-overuse", age_years=38, sex="female", weight_kg=58),
        "Fièvre. J'ai déjà pris 8 comprimés de Doliprane 500 mg depuis ce matin.",
        symptoms=["fever"],
    )
    assert policy.reason_code == "paracetamol_already_taken_overuse_structured"
    assert plan.route == "review"
    aligned = _align_snapshot_with_execution_plan(snap, plan)
    assert aligned.route_recommendation == "review"
    assert aligned.extracted_context["pre_planner_route_recommendation"] == "prescription"
    assert aligned.extracted_context["final_display_route"] == "review_blocked"


def test_sinus_short_duration_augmentin_request_blocks():
    _, _, policy, plan = _preplan(
        PatientProfile(patient_id="p-sinus", age_years=34, sex="female", weight_kg=66),
        "Symptômes sinus <10 jours, pas de fièvre sévère ni aggravation biphasique, demande patient Augmentin.",
        transcript=[
            ("doctor", "Depuis combien de temps le nez est bouché ?"),
            ("patient", "Trois jours, nez bouché, pression légère au front, écoulement clair."),
            ("patient", "Je préfère Augmentin parce que je travaille demain."),
        ],
    )
    assert policy.reason_code == "sinusitis_short_duration_patient_antibiotic_request"
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"
    assert "amoxicillin + clavulanic acid" in plan.forbidden_ingredients


def test_nsaid_with_prior_gi_bleed_or_aspirin_blocks():
    _, _, policy, plan = _preplan(
        PatientProfile(patient_id="p-gi", age_years=58, sex="male", weight_kg=83, current_medications=["aspirin"]),
        "NSAID request + previous GI bleed + aspirin. Block/review.",
        transcript=[
            ("patient", "J'ai été hospitalisé pour ulcère qui saignait il y a deux ans. Je prends aspirine."),
            ("patient", "Ibuprofène 400 mg si possible."),
        ],
        symptoms=["pain"],
    )
    assert policy.reason_code == "nsaid_gi_bleed_or_antiplatelet_review"
    assert plan.route == "review"
    assert "ibuprofen" in plan.forbidden_ingredients


def test_diabetic_foot_wound_fever_routes_emergency():
    _, _, policy, plan = _preplan(
        PatientProfile(patient_id="p-dm-foot", age_years=61, sex="male", weight_kg=80, chronic_conditions=["diabetes"]),
        "Diabetic foot wound with fever, swelling and reduced sensation.",
        transcript=[
            ("patient", "Plaie sous le gros orteil depuis une semaine, maintenant rouge, gonflée, fièvre."),
            ("patient", "Oui et je sens moins bien le pied."),
        ],
    )
    assert policy.reason_code == "diabetic_foot_infection_emergency"
    assert plan.route == "emergency"
    assert plan.sub_route == "emergency"


def test_fever_neck_stiffness_petechiae_routes_emergency():
    _, _, policy, plan = _preplan(
        PatientProfile(patient_id="p-meningitis", age_years=24, sex="female", weight_kg=62),
        "Fièvre 39.4 avec mal de tête très fort, nuque raide et petites taches violettes qui ne blanchissent pas.",
        symptoms=["fever", "headache"],
    )
    assert policy.reason_code == "fever_neck_stiffness_petechiae_emergency"
    assert plan.route == "emergency"


def test_simple_protocol_target_can_draft_despite_nonblocking_missing_info():
    snap = _snapshot(
        PatientProfile(patient_id="p-gerd", age_years=39, sex="male", weight_kg=80),
        "Brûlure derrière le sternum après les repas, remontées acides. Pas de sang, pas de perte de poids, pas de dysphagie.",
        symptoms=["heartburn"],
        route="review",
    )
    orders = _EXTRACTOR.extract(snap)
    policy = _POLICY.evaluate(snap, medical_orders=orders)
    plan = _PLANNER.plan(snap, medical_orders=orders, policy_decision=policy)
    assert policy.has_blocking_policy is False
    assert "omeprazole" in plan.target_ingredients or "alginate" in plan.target_ingredients
    assert plan.route == "prescription"
    assert plan.sub_route == "draft_prescription"


def test_curated_kg_fallback_returns_ibuprofen_renal_fact():
    facts = KGRetriever(client=type("C", (), {"fetch_related_facts": lambda *a, **k: []})(), enable_curated_fallbacks=True).retrieve(
        "ibuprofen renal impairment NSAID warning", limit=10
    )
    assert any(f.subject.lower() == "ibuprofen" and f.object == "renal_impairment" for f in facts)

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags, TranscriptTurn
from services.order_extraction.service import MedicalOrderExtractionService
from services.safety.policy_engine import SafetyPolicyEngine
from services.planning.execution_planner import ExecutionPlanner

_EXTRACTOR = MedicalOrderExtractionService()
_POLICY = SafetyPolicyEngine()
_PLANNER = ExecutionPlanner(policy_mode="enforce")


def _snapshot(patient, note, transcript=None, symptoms=None, conditions=None):
    transcript = transcript or []
    return PatientSnapshot(
        patient=patient,
        consultation=ConsultationInput(
            language="fr",
            doctor_notes=note,
            transcript=[TranscriptTurn(speaker=s, text=t) for s, t in transcript],
        ),
        normalized_symptoms=symptoms or [],
        suspected_conditions=conditions or [],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=" ".join([note, *(t for _, t in transcript)]),
        route_recommendation="prescription",
    )


def _preplan(patient, note, transcript=None, symptoms=None, conditions=None):
    snap = _snapshot(patient, note, transcript=transcript, symptoms=symptoms, conditions=conditions)
    orders = _EXTRACTOR.extract(snap)
    policy = _POLICY.evaluate(snap, medical_orders=orders)
    plan = _PLANNER.plan(snap, medical_orders=orders, policy_decision=policy)
    return orders, policy, plan


def test_negated_amoxicillin_context_does_not_become_target_or_false_forbidden_violation():
    orders, policy, plan = _preplan(
        PatientProfile(patient_id="p-neg", age_years=27, sex="female", weight_kg=60),
        "Mention negative: pas d'amoxicilline prise ni demandee; symptomes viraux legers.",
        transcript=[
            ("doctor", "Vous avez pris un antibiotique ?"),
            ("patient", "Non, je n'ai pas pris d'amoxicilline, je veux eviter les antibiotiques."),
            ("patient", "Juste nez qui coule et gorge irritee, pas de fievre."),
        ],
        symptoms=["rhinorrhea", "throat_irritation"],
        conditions=["viral_upper_respiratory_infection"],
    )
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"
    assert plan.target_ingredients == []
    assert "amoxicillin" in plan.forbidden_ingredients
    assert all(m.authorization_status in {"negated_or_avoid", "not_currently_taking", "historical"} for m in orders.medication_mentions)


def test_remaining_emergency_red_flags_are_positive_and_question_aware():
    cases = [
        (
            "uti_pyelo",
            PatientProfile(patient_id="p-uti", age_years=44, sex="female", weight_kg=68),
            "Possible pyelonephritis/systemic illness.",
            [("patient", "Brulures urinaires, maintenant fievre 39 et douleur au flanc droit."), ("patient", "Frissons et vomissements.")],
            ["dysuria", "fever", "flank_pain", "vomiting", "rigors"],
            ["possible_pyelonephritis"],
        ),
        (
            "neuro_headache",
            PatientProfile(patient_id="p-neuro", age_years=51, sex="male", weight_kg=80),
            "Cephalee brutale la pire de sa vie avec faiblesse du bras et confusion.",
            [("patient", "D'un coup le pire mal de tete de ma vie."), ("patient", "La main droite est faible et je suis confus.")],
            ["severe_headache", "neurologic_deficit"],
            [],
        ),
        (
            "dental_deep",
            PatientProfile(patient_id="p-dental", age_years=36, sex="female", weight_kg=64),
            "Douleur dentaire avec gonflement, fievre et trismus.",
            [("patient", "J'ai la joue gonflee, fievre, j'arrive mal a ouvrir la bouche."), ("patient", "Difficulte a avaler un peu.")],
            ["dental_pain", "fever", "trismus"],
            [],
        ),
    ]
    for _, patient, note, transcript, symptoms, conditions in cases:
        _, _, plan = _preplan(patient, note, transcript=transcript, symptoms=symptoms, conditions=conditions)
        assert plan.route == "emergency"
        assert plan.sub_route == "emergency"
        assert plan.allowed_to_generate is False


def test_question_negative_alarm_screen_does_not_block_simple_gerd():
    _, policy, plan = _preplan(
        PatientProfile(patient_id="p-gerd", age_years=39, sex="male", weight_kg=80),
        "Typical GERD symptoms without alarm features.",
        transcript=[
            ("patient", "Brulure derriere le sternum apres les repas, remontees acides depuis deux semaines."),
            ("doctor", "Perte de poids, vomissements de sang, difficulte a avaler ?"),
            ("patient", "Non, rien de ca."),
        ],
        symptoms=["heartburn", "acid_regurgitation"],
        conditions=["gastroesophageal_reflux"],
    )
    assert policy.has_blocking_policy is False
    assert plan.route == "prescription"
    assert plan.sub_route == "draft_prescription"
    assert plan.target_ingredients == ["omeprazole"]


def test_breastfeeding_low_risk_target_stays_review_draft_allowed_not_direct_prescription():
    _, _, plan = _preplan(
        PatientProfile(patient_id="p-bf", age_years=29, sex="female", weight_kg=62, breastfeeding=True),
        "Allaitement. Rhinite allergique avec eternuements, nez clair, yeux qui grattent.",
        transcript=[("patient", "J allaite et j ai des eternuements, nez qui coule clair, yeux qui grattent.")],
        symptoms=["sneezing", "rhinorrhea", "itchy_eyes"],
        conditions=["allergic_rhinitis"],
    )
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.target_ingredients == ["cetirizine"]


def test_question_negative_pregnancy_screen_does_not_overblock_ors_or_paracetamol():
    _, _, ors_plan = _preplan(
        PatientProfile(patient_id="p-ors", age_years=24, sex="female", weight_kg=59),
        "Mild acute diarrhea without blood/dehydration. ORS expected.",
        transcript=[
            ("patient", "Depuis hier, 4 selles liquides, pas de sang, je bois bien."),
            ("doctor", "Fievre elevee, douleur intense, grossesse ?"),
            ("patient", "Non."),
        ],
        symptoms=["diarrhea"],
        conditions=["acute_gastroenteritis_mild"],
    )
    assert ors_plan.route == "prescription"
    assert ors_plan.sub_route == "draft_prescription"
    assert ors_plan.target_ingredients == ["oral_rehydration_salts"]

    _, _, fever_plan = _preplan(
        PatientProfile(patient_id="p-fever", age_years=29, sex="female", weight_kg=61, pregnant=False),
        "Syndrome viral probable. Aucun paracetamol deja pris.",
        transcript=[
            ("patient", "Depuis hier soir j'ai 38.4, des courbatures et mal a la tete."),
            ("doctor", "Douleur thoracique, essoufflement, raideur de nuque, grossesse ?"),
            ("patient", "Non, rien de tout ca. Je n'ai pris aucun medicament aujourd'hui."),
        ],
        symptoms=["fever", "myalgia", "headache"],
        conditions=["viral_syndrome"],
    )
    assert fever_plan.route == "prescription"
    assert fever_plan.sub_route == "draft_prescription"
    assert fever_plan.target_ingredients == ["paracetamol"]

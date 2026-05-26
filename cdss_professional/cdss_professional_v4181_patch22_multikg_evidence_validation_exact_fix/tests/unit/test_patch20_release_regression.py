from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags, TranscriptTurn
from services.planning.execution_planner import ExecutionPlanner
from services.order_extraction.service import MedicalOrderExtractionService
from services.safety.policy_engine import SafetyPolicyEngine
from services.domain.route_decision_engine import RouteDecisionEngine
from services.domain.contracts import BusinessInputs
from services.order_extraction.contracts import MedicalOrder, MedicalOrderExtractionResult
from services.clinical_understanding.llm_extractor import QwenClinicalExtractor, LEVEL1_EXTRACTION_SYSTEM_PROMPT
from services.order_extraction.llm_mediqa_oe_extractor import QwenMediqaOeExtractor, MEDIQA_OE_SYSTEM_PROMPT


def _snapshot(text, *, pregnant=None, risk=None, breastfeeding=False):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="female", weight_kg=65, pregnant=pregnant, breastfeeding=breastfeeding),
        consultation=ConsultationInput(language="fr", doctor_notes=text, transcript=[TranscriptTurn(speaker="patient", text=text)]),
        normalized_symptoms=["fever"] if "fievre" in text.lower() or "fever" in text.lower() else [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=risk or RiskFlags(),
        normalized_runtime_text=text,
        route_recommendation="review" if risk else "prescription",
    )


def test_pregnancy_review_fails_closed_without_review_draft_generation():
    snap = _snapshot("enceinte avec fievre", risk=RiskFlags(pregnancy_risk=True))
    plan = ExecutionPlanner().plan(snap)
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"
    assert plan.allowed_to_generate is False
    assert plan.localization_required is False


def test_breastfeeding_low_risk_remains_review_draft_allowed():
    snap = _snapshot("allaitement rhinite allergique eternuements nez qui coule", breastfeeding=True)
    snap.normalized_symptoms = ["rhinorrhea", "sneezing"]
    snap.suspected_conditions = ["allergic_rhinitis"]
    plan = ExecutionPlanner(policy_mode="enforce").plan(snap)
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.allowed_to_generate is True


def test_doctor_authorized_low_risk_doliprane_can_stay_prescription():
    snap = _snapshot("Le medecin prescrit Doliprane pour fievre simple. Pas d'allergie.")
    orders = MedicalOrderExtractionResult(
        medication_mentions=[MedicalOrder(description="Doliprane", order_type="medication", medication="paracetamol", source="doctor_authorized", authorization_status="authorized")],
        authorized_medications=["paracetamol"],
    )
    plan = ExecutionPlanner(policy_mode="enforce").plan(snap, medical_orders=orders, policy_decision=SafetyPolicyEngine().evaluate(snap, medical_orders=orders))
    assert plan.route == "prescription"
    assert plan.sub_route == "draft_prescription"
    assert plan.allowed_to_generate is True


def test_non_actionable_forbidden_mention_preserves_review_audit_semantics():
    engine = RouteDecisionEngine()
    snap = _snapshot("Le patient veut eviter amoxicilline apres effet indesirable")
    orders = MedicalOrderExtractionResult(
        medication_mentions=[MedicalOrder(description="amoxicilline", order_type="medication", medication="amoxicillin", source="negated_or_avoid", authorization_status="negated_or_avoid")]
    )
    decision = engine.decide(snapshot=snap, medical_orders=orders, inputs=BusinessInputs(candidate_route="review", candidate_targets=[]))
    assert decision.route == "review"
    assert decision.display_route == "review_blocked"
    assert "amoxicillin" in decision.forbidden_ingredients


class _RouterSpy:
    def __init__(self):
        self.kwargs = None
    def generate_structured_text(self, prompt, **kwargs):
        self.kwargs = kwargs
        return '{"confidence": 0.0}'


def test_level1_extractor_passes_real_system_prompt_override():
    spy = _RouterSpy()
    QwenClinicalExtractor(spy).extract(ConsultationInput(language="fr", doctor_notes="fievre"))
    assert spy.kwargs["system_prompt_override"] == LEVEL1_EXTRACTION_SYSTEM_PROMPT


def test_mediqa_oe_extractor_passes_real_system_prompt_override():
    spy = _RouterSpy()
    QwenMediqaOeExtractor(spy).extract(ConsultationInput(language="fr", doctor_notes="fievre"))
    assert spy.kwargs["system_prompt_override"] == MEDIQA_OE_SYSTEM_PROMPT

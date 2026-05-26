from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags, TranscriptTurn
from services.order_extraction.llm_mediqa_oe_extractor import QwenMediqaOeExtractor, MediqaOeExtractionPayload
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.safety.policy_engine import SafetyPolicyEngine


class FakeRouter:
    def __init__(self, text: str):
        self.text = text
        self.last_prompt = ""

    def generate_structured_text(self, prompt: str):
        self.last_prompt = prompt
        return self.text


def _snapshot(note: str, *, age_years=31):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=age_years, sex="female", weight_kg=60),
        consultation=ConsultationInput(
            language="fr",
            doctor_notes=note,
            transcript=[TranscriptTurn(speaker="patient", text=note)],
        ),
        normalized_symptoms=["fever"] if "fievre" in note.lower() or "fièvre" in note.lower() or "s5ana" in note.lower() else [],
        risk_flags=RiskFlags(),
        normalized_runtime_text=note,
    )


def test_mediqa_oe_qwen_extractor_normalizes_patient_request_and_already_taken():
    router = FakeRouter(
        '{"medication_events":['
        '{"description":"Augmentin","ingredient":"Augmentin","brand":"Augmentin","status":"patient_requested_not_authorized","source":"patient","doctor_authorized":false,"reason":"patient request","provenance_turns":[1],"include_as_order":false,"confidence":0.96},'
        '{"description":"Doliprane 500 mg huit fois","ingredient":"paracetamol","brand":"Doliprane","status":"already_taken","source":"patient","quantity":8,"strength":"500 mg","time_window":"today","reason":"already taken","provenance_turns":[2],"include_as_order":false,"confidence":0.97}'
        '],"orders":[],"clinical_facts":{"symptoms":[],"red_flags":[],"risks":[],"missing_information":[]},"excluded_mentions":[],"self_check":{"provenance_complete":true},"confidence":0.97}'
    )
    extractor = QwenMediqaOeExtractor(llm_router=router, confidence_threshold=0.6)  # type: ignore[arg-type]
    payload = extractor.extract(ConsultationInput(language="fr", doctor_notes="Je veux Augmentin. Déjà pris Doliprane."))
    statuses = {m.medication: m.authorization_status for m in payload.medication_mentions}
    assert statuses["amoxicillin + clavulanic acid"] == "requested_not_authorized"
    assert statuses["paracetamol"] == "already_taken"
    assert payload.metadata["accepted_by_confidence"] is True
    assert "Few-shot example" in router.last_prompt


def test_mediqa_oe_payload_is_merged_before_policy_and_planner():
    payload = MediqaOeExtractionPayload()
    # Simulate Qwen catching arabizi overuse even if local rules are incomplete.
    payload.medication_mentions.append(
        __import__("services.order_extraction.contracts", fromlist=["MedicalOrder"]).MedicalOrder(
            description="doliprane barcha",
            order_type="medication",
            medication="paracetamol",
            source="already_taken",
            authorization_status="already_taken",
            reason="Qwen MEDIQA-OE event: already taken repeatedly",
            confidence=0.95,
        )
    )
    payload.orders.extend(payload.medication_mentions)
    payload.metadata = {"confidence": 0.95, "accepted_by_confidence": True}

    class FakeMediqaOe:
        def extract(self, item, *, runtime_text=""):
            return payload

    service = MedicalOrderExtractionService(llm_mediqa_oe_extractor=FakeMediqaOe(), llm_mediqa_oe_mode="assist", llm_mediqa_oe_policy="always")
    snap = _snapshot("3andi s5ana, khdhit doli barcha depuis ce matin.")
    orders = service.extract(snap)
    assert "paracetamol" in orders.already_taken_medications
    assert orders.diagnostics["mediqa_oe_qwen_extraction"]["status"] == "accepted"

    policy = SafetyPolicyEngine().evaluate(snap, medical_orders=orders)
    plan = ExecutionPlanner(policy_mode="enforce").plan(snap, medical_orders=orders, policy_decision=policy)
    assert policy.reason_code == "paracetamol_already_taken_overuse_structured"
    assert plan.route == "review"
    assert plan.sub_route == "review_blocked"

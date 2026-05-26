from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, TranscriptTurn
from services.domain.route_decision_engine import RouteDecisionEngine
from services.domain.contracts import BusinessInputs
from services.order_extraction.contracts import MedicalOrder, MedicalOrderExtractionResult


def snap(text: str, *, age_years: float = 32, pregnant=None, breastfeeding=False, renal=False, hepatic=False, weight=70):
    return PatientSnapshot(
        patient=PatientProfile(
            patient_id="p1",
            age_years=age_years,
            weight_kg=weight,
            pregnant=pregnant,
            breastfeeding=breastfeeding,
            renal_impairment=renal,
            hepatic_impairment=hepatic,
        ),
        consultation=ConsultationInput(language="fr", doctor_notes=text, transcript=[TranscriptTurn(speaker="patient", text=text)]),
        normalized_runtime_text=text,
        normalized_symptoms=[],
        suspected_conditions=[],
    )


def med_orders(*mentions, requested=None, authorized=None, already=None, forbidden=None):
    return MedicalOrderExtractionResult(
        medication_mentions=list(mentions),
        requested_medications=requested or [],
        authorized_medications=authorized or [],
        already_taken_medications=already or [],
        forbidden_ingredients=forbidden or [],
    )


def test_patient_requested_target_is_review_blocked_not_draft():
    engine = RouteDecisionEngine()
    s = snap("Patient demande Augmentin pour sinus depuis trois jours")
    orders = med_orders(
        MedicalOrder(description="Augmentin", order_type="medication", medication="amoxicillin clavulanic acid", source="patient_request", authorization_status="requested_not_authorized"),
        requested=["amoxicillin clavulanic acid"],
    )
    decision = engine.decide(snapshot=s, medical_orders=orders, inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["amoxicillin clavulanic acid"]))
    assert decision.route == "review"
    assert decision.display_route == "review_blocked"
    assert decision.allowed_to_generate is False
    assert "amoxicillin + clavulanic acid" in decision.forbidden_ingredients


def test_negated_only_medication_context_is_non_pharma():
    engine = RouteDecisionEngine()
    s = snap("Le patient dit ne pas prendre amoxicilline, conseil non pharmacologique seulement")
    orders = med_orders(
        MedicalOrder(description="amoxicilline", order_type="medication", medication="amoxicillin", source="not_currently_taking", authorization_status="not_currently_taking"),
    )
    decision = engine.decide(snapshot=s, medical_orders=orders, inputs=BusinessInputs(candidate_route="prescription", candidate_targets=[]))
    assert decision.route == "non_pharma"
    assert decision.display_route == "non_pharma"
    assert decision.allowed_to_generate is False


def test_vulnerable_low_risk_goes_review_draft_allowed():
    engine = RouteDecisionEngine()
    s = snap("Rhinite allergique simple, patiente allaite", breastfeeding=True)
    decision = engine.decide(snapshot=s, medical_orders=med_orders(), inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["cetirizine"]))
    assert decision.route == "review"
    assert decision.display_route == "review_draft_allowed"
    assert decision.allowed_to_generate is True


def test_low_risk_missing_duration_is_informative_not_blocking():
    engine = RouteDecisionEngine()
    s = snap("Diarrhee aqueuse legere sans sang ni forte fievre")
    decision = engine.decide(snapshot=s, medical_orders=med_orders(), inputs=BusinessInputs(candidate_route="review", candidate_targets=["oral_rehydration_salts"], candidate_missing=["symptom duration", "allergy history"]))
    assert decision.route == "prescription"
    assert decision.display_route == "draft_prescription"
    assert decision.allowed_to_generate is True
    assert decision.missing_information.blocking == []
    assert "symptom duration" in decision.missing_information.informative


def test_emergency_precedence_over_low_risk_target():
    engine = RouteDecisionEngine()
    s = snap("Fièvre avec douleur du flanc et frissons vomissements")
    decision = engine.decide(snapshot=s, medical_orders=med_orders(), inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["paracetamol"]))
    assert decision.route == "emergency"
    assert decision.display_route == "emergency"
    assert decision.allowed_to_generate is False


def test_pediatric_weight_blocks_systemic_dosing():
    engine = RouteDecisionEngine()
    s = snap("Enfant avec fièvre", age_years=4, weight=None)
    decision = engine.decide(snapshot=s, medical_orders=med_orders(), inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["paracetamol"], candidate_missing=["weight"]))
    assert decision.route == "review"
    assert decision.display_route == "missing_info"
    assert decision.allowed_to_generate is False
    assert "weight" in decision.missing_information.blocking

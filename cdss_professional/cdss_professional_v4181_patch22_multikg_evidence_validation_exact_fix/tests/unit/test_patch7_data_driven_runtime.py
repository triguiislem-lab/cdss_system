from __future__ import annotations

from pathlib import Path

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from libs.utils.medical_text import normalize_search_text
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever

RUNTIME_DIR = Path(__file__).resolve().parents[2] / "data" / "runtime"


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


def test_patch7_amm_generated_alias_maps_local_brand_to_canonical_dci_with_review_for_antibiotic():
    snapshot = _snapshot("Médecin prescrit AMOXAL 500 mg pour infection documentée.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert any(m.product_name == "AMOXAL" and m.medication == "amoxicillin" for m in orders.medication_mentions)

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert "amoxicillin" in plan.forbidden_ingredients
    assert "antibiotic_stewardship" in plan.required_safety_screens


def test_patch7_authorized_antihistamine_class_maps_to_cetirizine_profile():
    snapshot = _snapshot("Rhinorrhea et éternuement saisonnier, médecin recommande antihistaminique.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    assert any(c.canonical_class == "antihistamine" and c.status == "authorized" for c in orders.therapeutic_class_mentions)

    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "prescription"
    assert plan.target_ingredients == ["cetirizine"]
    assert "sedation_risk" in plan.required_safety_screens


def test_patch7_plain_therapeutic_class_still_fails_closed():
    snapshot = _snapshot("Antihistaminique?")
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.target_ingredients == []


def test_patch7_chronic_medication_requests_are_review_only():
    snapshot = _snapshot("Patient demande un antihypertenseur pour hypertension.")
    orders = MedicalOrderExtractionService().extract(snapshot)
    plan = ExecutionPlanner(policy_mode="off").plan(snapshot, medical_orders=orders)
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert plan.target_ingredients == []


def test_patch7_prescription_evidence_corpus_is_primary_runtime_vector_source():
    client = VectorIndexClient(backend="final_release_jsonl", corpus_path=RUNTIME_DIR / "tn_prescription_evidence_corpus.jsonl")
    chunks = client.similarity_search("paracetamol 500 mg fever dosage contraindication", top_k=5, filters={"accepted_for_clinical_use": "true"})
    assert chunks
    assert chunks[0].metadata["final_data_release_used"] is True
    assert chunks[0].metadata["quality_tier"] == "tier_1_structured_prescription_evidence"


def test_patch7_local_formulary_prefers_strict_mono_strength_match_over_combinations():
    client = LocalFormularyClient(backend="csv", catalog_path=RUNTIME_DIR / "tn_master_amm_catalog.csv")
    retriever = LocalFormularyRetriever(client=client)
    products = retriever.retrieve("paracetamol 500 mg oral Tunisia mono ingredient local formulary", limit=5)
    assert products
    top = products[0]
    assert top.active_ingredient == "paracetamol"
    assert top.strength == "500 mg"
    assert top.metadata.get("strict_mono_localization_eligible") is True
    assert top.metadata.get("is_combination") is False

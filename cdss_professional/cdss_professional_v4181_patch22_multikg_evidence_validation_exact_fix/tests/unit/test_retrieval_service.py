from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.evidence import KnowledgeGraphFact
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.knowledge_connectors.neo4j_client import Neo4jClient
from services.retrieval.service import RetrievalService


def test_retrieval_service_builds_plan_and_local_products() -> None:
    service = RetrievalService()
    snapshot = PatientSnapshot(
        patient=PatientProfile(
            patient_id="p-100",
            age_years=30,
            sex="female",
            current_medications=["metformin"],
            chronic_conditions=["type 2 diabetes"],
        ),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever", "sore throat"],
        suspected_conditions=["viral syndrome"],
        risk_flags=RiskFlags(),
    )
    config = RuntimePipelineConfig()

    evidence = service.build_evidence(snapshot, config)

    assert evidence.retrieval_plan is not None
    assert len(evidence.retrieval_plan.queries) == 3
    assert evidence.local_products
    assert any(product.active_ingredient == "paracetamol" for product in evidence.local_products)
    assert "Top local product" in evidence.merged_summary


def test_kg_entity_fallback_retrieves_alias_anchored_fact() -> None:
    client = Neo4jClient()
    client._facts_cache = [
        KnowledgeGraphFact(
            subject="albuterol",
            predicate="treats:drug->disease",
            object="asthma",
            score=0.58,
            provenance="cdss_kg:drug_disease:test",
        ),
        KnowledgeGraphFact(
            subject="hydralazine",
            predicate="related_to",
            object="hypertension",
            score=0.99,
            provenance="cdss_kg:drug_disease:test",
        ),
    ]

    results = client.fetch_related_facts("asthma salbutamol bronchodilator", limit=3)

    assert results
    assert results[0].subject == "albuterol"
    assert all("hydralazine" not in fact.subject for fact in results)

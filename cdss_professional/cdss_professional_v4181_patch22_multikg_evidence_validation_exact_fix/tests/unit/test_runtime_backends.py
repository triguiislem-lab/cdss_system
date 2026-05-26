import json

from libs.contracts.evidence import EvidenceBundle, EvidenceChunk, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.neo4j_client import Neo4jClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from services.generation.llm_router import LLMRouter
from services.retrieval.vector_retriever import VectorRetriever


def test_vector_client_json_backend_reads_real_corpus(tmp_path) -> None:
    corpus = [
        {
            "source": "guideline",
            "title": "Renal dosing guidance",
            "content": "Paracetamol remains an option while NSAIDs should be avoided in severe renal impairment.",
            "metadata": {"language": "fr"},
            "score": 0.4,
        }
    ]
    path = tmp_path / "vector.json"
    path.write_text(json.dumps(corpus), encoding="utf-8")

    client = VectorIndexClient(backend="json", corpus_path=path)
    results = client.similarity_search("renal impairment paracetamol", top_k=3, filters={"language": "fr"})

    assert results
    assert results[0].title == "Renal dosing guidance"


def test_vector_client_final_release_jsonl_streams_without_full_cache(tmp_path) -> None:
    path = tmp_path / "final_evidence_sections_runtime.jsonl"
    path.write_text(
        json.dumps(
            {
                "source": "tunisia_dpm_local_rcp_pdf",
                "title": "ADOL RCP",
                "content": "Paracetamol 500 mg oral fever dosing and contraindications.",
                "metadata": {"language": "fr", "route": "prescription"},
                "score": 0.8,
            }
        )
        + "\n",
        encoding="utf-8",
    )

    client = VectorIndexClient(backend="final_release_jsonl", corpus_path=path)
    results = client.similarity_search("paracetamol fever dosing", top_k=3, filters={"language": "fr", "route": "prescription"})

    assert results
    assert results[0].metadata["final_data_release_used"] is True
    assert results[0].metadata["source_priority"] == "primary_final_data_release"


def test_kg_client_json_backend_reads_fact_file(tmp_path) -> None:
    facts = [
        {"subject": "paracetamol", "predicate": "treats", "object": "fever", "score": 0.6, "provenance": "json_test"}
    ]
    path = tmp_path / "kg.json"
    path.write_text(json.dumps(facts), encoding="utf-8")

    client = Neo4jClient(backend="json", json_path=path)
    results = client.fetch_related_facts("fever paracetamol", limit=3)

    assert results
    assert results[0].subject == "paracetamol"


def test_kg_client_cdss_csv_dir_reads_notebook54_exports(tmp_path) -> None:
    kg_dir = tmp_path / "kg_cdss_review_outputs" / "cdss_integration_files"
    kg_dir.mkdir(parents=True)
    (kg_dir / "cdss_drug_disease_edges.csv").write_text(
        "src,dst,relation,rel_type,source,origin,coasserted_key,source_node_name,target_node_name,source_type_family,target_type_family,rel_table\n"
        "drug::1,disease::1,contraindication,contraindication,primekg,primekg,True,Ibuprofen,renal impairment,compound,disease,CONTRAINDICATION\n",
        encoding="utf-8",
    )

    client = Neo4jClient(backend="cdss_csv_dir", csv_path=kg_dir)
    results = client.fetch_related_facts(
        "ibuprofen renal impairment prescription",
        limit=3,
        filters={"disease": "renal impairment", "route": "prescription"},
    )

    assert results
    assert results[0].subject == "Ibuprofen"
    assert "contraindication" in results[0].predicate
    assert results[0].provenance and results[0].provenance.startswith("cdss_kg:drug_disease")


def test_local_formulary_client_csv_backend_reads_catalog(tmp_path) -> None:
    path = tmp_path / "catalog.csv"
    path.write_text(
        "product_name,active_ingredient,strength,dosage_form,veic,indication\n"
        "Doliprane TN 500 mg,paracetamol,500 mg,tablet,Essentiel,fever pain\n",
        encoding="utf-8",
    )

    client = LocalFormularyClient(backend="csv", catalog_path=path)
    products = client.load_products()

    assert products
    assert products[0].product_name == "Doliprane TN 500 mg"
    assert products[0].metadata["indication"] == "fever pain"


def test_http_router_falls_back_to_notebook_heuristic_when_backend_unreachable() -> None:
    router = LLMRouter(
        backend="openai_compatible",
        base_url="http://127.0.0.1:9",
        model="fake-model",
        timeout_seconds=0.1,
    )
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-http", age_years=30, sex="female"),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever", "sore throat"],
        suspected_conditions=["viral syndrome"],
        risk_flags=RiskFlags(),
    )
    evidence = EvidenceBundle(
        local_products=[
            LocalProductEvidence(
                product_name="Doliprane TN 500 mg",
                active_ingredient="paracetamol",
                strength="500 mg",
                dosage_form="tablet",
                score=0.8,
                metadata={"indication": "fever pain"},
            )
        ]
    )

    raw = router.generate_structured_text("ignored", snapshot=snapshot, evidence=evidence)

    assert "problem_summary:" in raw
    assert "paracetamol" in raw


class _VectorClient:
    def __init__(self, results):
        self.results = results

    def similarity_search(self, query, top_k=5, filters=None):
        return self.results[:top_k]


def test_vector_retriever_uses_primary_final_release_then_fallback_when_needed() -> None:
    primary = [
        EvidenceChunk(
            source="tunisia_dpm_local_rcp_pdf",
            title="ADOL RCP",
            content="Paracetamol oral dosing",
            score=0.9,
            metadata={"final_data_release_used": True},
        )
    ]
    fallback = [
        EvidenceChunk(
            source="pubmedqa_context",
            title="PubMedQA",
            content="Paracetamol fever context",
            score=0.7,
            metadata={},
        )
    ]

    results = VectorRetriever(client=_VectorClient(primary), fallback_client=_VectorClient(fallback)).retrieve(
        "paracetamol fever",
        top_k=2,
    )

    assert results[0].metadata["retrieval_role"] == "primary_final_data_release"
    assert results[1].metadata["retrieval_role"] == "fallback_vector_store"

from pathlib import Path

from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.neo4j_client import Neo4jClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever

RUNTIME_DIR = Path(__file__).resolve().parents[2] / "data" / "runtime"


def test_runtime_kg_csv_returns_abces_dentaire_candidates():
    client = Neo4jClient(backend="csv", csv_path=RUNTIME_DIR / "tn_master_kg_edges.csv")
    facts = client.fetch_related_facts("abces_dentaire amoxicilline prescription", limit=5, filters={"disease": "abces_dentaire", "route": "prescription"})
    assert facts
    assert any("abces_dentaire" in fact.subject for fact in facts)
    assert any("candidate_product" in fact.predicate for fact in facts)


def test_runtime_vector_jsonl_returns_grippe_summary():
    client = VectorIndexClient(backend="jsonl", corpus_path=RUNTIME_DIR / "tn_master_vs_corpus.jsonl")
    chunks = client.similarity_search("grippe fièvre toux traitement", top_k=5, filters={"language": "fr", "route": "prescription", "disease": "grippe"})
    assert chunks
    assert any((chunk.metadata.get("disease") == "grippe") or ("gripp" in chunk.title.lower()) for chunk in chunks)


def test_runtime_amm_catalog_localizes_amoxicilline():
    client = LocalFormularyClient(backend="csv", catalog_path=RUNTIME_DIR / "tn_master_amm_catalog.csv")
    retriever = LocalFormularyRetriever(client=client)
    products = retriever.retrieve("abces dentaire amoxicilline 1 g comprimé", limit=5)
    assert products
    assert any("amoxicill" in product.active_ingredient.lower() for product in products)

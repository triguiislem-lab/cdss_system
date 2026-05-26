import sqlite3

from libs.knowledge_connectors.tn_med_client import TNMedEnrichmentClient
from services.retrieval.tn_med_enrichment_retriever import TNMedEnrichmentRetriever
from services.retrieval.hybrid_retriever import HybridRetriever
from libs.contracts.evidence import RetrievalPlan, RetrievalQuery, EvidenceBundle


def _build_tn_med_db(path):
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE medicaments (
            id_medicament TEXT PRIMARY KEY,
            nom_medicament TEXT,
            dci_raw TEXT,
            amm TEXT,
            dosage TEXT,
            forme TEXT
        );
        CREATE TABLE substances_actives (id_substance TEXT PRIMARY KEY, nom_substance TEXT);
        CREATE TABLE medicament_substance (id_medicament TEXT, id_substance TEXT);
        CREATE TABLE classes_therapeutiques (id_classe TEXT PRIMARY KEY, nom_classe TEXT);
        CREATE TABLE sous_classes_therapeutiques (id_sous_classe TEXT PRIMARY KEY, nom_sous_classe TEXT);
        CREATE TABLE medicament_classification (id_medicament TEXT, id_classe TEXT, id_sous_classe TEXT);
        CREATE TABLE indications_medicament (id_medicament TEXT, indication TEXT);
        CREATE TABLE prix_remboursement (id_medicament TEXT, prix_public TEXT, taux_remboursement TEXT);
        CREATE TABLE preuves_cliniques_brutes (amm TEXT, section TEXT, texte TEXT);
        CREATE TABLE regles_heuristiques (amm TEXT, type_regle TEXT, texte_regle TEXT);
        INSERT INTO medicaments VALUES ('1', 'DOLIPRANE', 'PARACETAMOL', 'AMM-001', '500 mg', 'comprimé');
        INSERT INTO substances_actives VALUES ('S1', 'PARACETAMOL');
        INSERT INTO medicament_substance VALUES ('1', 'S1');
        INSERT INTO classes_therapeutiques VALUES ('C1', 'SYSTEME NERVEUX');
        INSERT INTO sous_classes_therapeutiques VALUES ('SC1', 'ANALGESIQUES');
        INSERT INTO medicament_classification VALUES ('1', 'C1', 'SC1');
        INSERT INTO indications_medicament VALUES ('1', 'Douleurs légères à modérées et fièvre');
        INSERT INTO prix_remboursement VALUES ('1', '4.500', '80%');
        INSERT INTO preuves_cliniques_brutes VALUES ('AMM-001', 'posologie', '500 mg toutes les 6 heures selon RCP');
        INSERT INTO regles_heuristiques VALUES ('AMM-001', 'dose', 'Ne pas dépasser la dose maximale');
        """
    )
    con.commit()
    con.close()


class _EmptyRetriever:
    def retrieve(self, query, limit=5):
        return []


class _IdentityFuser:
    def fuse(self, vector_chunks, graph_facts, local_products, retrieval_plan=None):
        return EvidenceBundle(
            vector_chunks=list(vector_chunks),
            graph_facts=list(graph_facts),
            local_products=list(local_products),
            retrieval_plan=retrieval_plan,
            merged_summary="test",
        )


def test_tn_med_client_returns_structured_enrichment(tmp_path):
    db_path = tmp_path / "TN_Med.db"
    _build_tn_med_db(db_path)
    client = TNMedEnrichmentClient(db_path=db_path, enabled=True)

    assert client.is_available()
    health = client.health_check()
    assert health["tables"]["medicaments"] == 1

    profiles = client.search("DOLIPRANE", limit=3)
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile["therapeutic_classes"] == ["SYSTEME NERVEUX"]
    assert profile["therapeutic_subclasses"] == ["ANALGESIQUES"]
    assert profile["indication_rows"] == 1
    assert profile["price_rows"] == 1
    assert profile["raw_clinical_evidence_rows"] == 1
    assert profile["heuristic_rules_rows"] == 1

    chunks = client.retrieve_chunks("paracetamol", limit=2)
    titles = " ".join(chunk.title for chunk in chunks)
    assert "classification" in titles.lower()
    assert any(chunk.metadata.get("source_system") == "tn_med_db_v1" for chunk in chunks)


def test_hybrid_retriever_appends_tn_med_chunks(tmp_path):
    db_path = tmp_path / "TN_Med.db"
    _build_tn_med_db(db_path)
    retriever = TNMedEnrichmentRetriever(client=TNMedEnrichmentClient(db_path=db_path, enabled=True), enabled=True)
    hybrid = HybridRetriever(
        vector_retriever=_EmptyRetriever(),
        kg_retriever=_EmptyRetriever(),
        local_retriever=_EmptyRetriever(),
        tn_med_retriever=retriever,
        tn_med_enabled=True,
        fuser=_IdentityFuser(),
    )
    plan = RetrievalPlan(
        primary_terms=["DOLIPRANE"],
        queries=[
            RetrievalQuery(source="local_formulary", text="DOLIPRANE", limit=5),
            RetrievalQuery(source="vector", text="DOLIPRANE posologie", limit=5),
            RetrievalQuery(source="kg", text="DOLIPRANE safety", limit=5),
        ],
    )
    bundle = hybrid.retrieve_from_plan(plan)
    assert any(chunk.source == "tn_med_db_v1" for chunk in bundle.vector_chunks)
    assert bundle.retrieval_diagnostics["tn_med_final_count"] >= 1

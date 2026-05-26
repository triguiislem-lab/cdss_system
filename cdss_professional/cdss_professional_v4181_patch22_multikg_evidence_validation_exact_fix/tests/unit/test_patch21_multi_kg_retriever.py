from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.main import app
from libs.config.settings import AppSettings
from libs.contracts.evidence import KnowledgeGraphFact, RetrievalQuery
from services.retrieval.hybrid_retriever import HybridRetriever
from services.retrieval.kg_retriever import MultiKGRetriever


class _FakeRetriever:
    def __init__(self, name: str, facts: list[KnowledgeGraphFact], calls: list[str] | None = None) -> None:
        self.name = name
        self.facts = facts
        self.calls = calls if calls is not None else []
        self.last_query = None

    def retrieve(self, query, limit: int | None = None):
        self.calls.append(self.name)
        self.last_query = query
        return self.facts[: limit or 5]


def test_multi_kg_retriever_queries_primary_then_backup_and_tags_support_only():
    calls: list[str] = []
    primary = _FakeRetriever(
        "primary",
        [KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.9)],
        calls,
    )
    backup = _FakeRetriever(
        "backup",
        [
            KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.95),
            KnowledgeGraphFact(subject="warfarin", predicate="increases_risk_of", object="bleeding", score=0.8),
        ],
        calls,
    )

    facts = MultiKGRetriever(
        primary_retriever=primary,
        backup_retrievers=[backup],
        backup_enabled=True,
        backup_score_multiplier=0.5,
    ).retrieve("ibuprofen warfarin", limit=5)

    assert calls == ["primary", "backup"]
    assert len(facts) == 2
    duplicate = next(f for f in facts if f.subject == "ibuprofen")
    support = next(f for f in facts if f.subject == "warfarin")
    assert duplicate.kg_source == "tn_primary_kg"
    assert duplicate.support_only is False
    assert duplicate.score == 0.9
    assert support.kg_source == "backup_kg_1"
    assert support.support_only is True
    assert support.score == 0.4


def test_multi_kg_retriever_preserves_retrieval_query_filters_for_backups():
    primary = _FakeRetriever("primary", [])
    backup = _FakeRetriever("backup", [KnowledgeGraphFact(subject="renal", predicate="related_to", object="ibuprofen", score=0.7)])
    query = RetrievalQuery(source="kg", text="ibuprofen renal", limit=3, filters={"route": "safety", "disease": "renal"})

    facts = MultiKGRetriever(
        primary_retriever=primary,
        backup_retrievers=[backup],
        backup_enabled=True,
    ).retrieve(query)

    assert facts[0].kg_source == "backup_kg_1"
    assert isinstance(backup.last_query, RetrievalQuery)
    assert backup.last_query.filters == {"route": "safety", "disease": "renal"}
    assert backup.last_query.limit >= 3


def test_hybrid_retriever_diagnostics_expose_kg_source_counts():
    class _Vector:
        def retrieve(self, *args, **kwargs):
            return []

    class _Local:
        def retrieve(self, *args, **kwargs):
            return []

    class _KG:
        def retrieve(self, *args, **kwargs):
            return [
                KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.9, kg_source="tn_primary_kg"),
                KnowledgeGraphFact(subject="warfarin", predicate="risk", object="bleeding", score=0.6, kg_source="backup_kg_1", support_only=True),
            ]

    from libs.contracts.evidence import RetrievalPlan
    from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot

    retriever = HybridRetriever(vector_retriever=_Vector(), kg_retriever=_KG(), local_retriever=_Local())
    plan = RetrievalPlan(primary_terms=["ibuprofen"], queries=[RetrievalQuery(source="kg", text="ibuprofen", limit=2)])
    snapshot = PatientSnapshot(patient=PatientProfile(patient_id="p", age_years=30, sex="female"), consultation=ConsultationInput(language="fr"))
    bundle = retriever.retrieve_from_plan(plan)

    assert bundle.retrieval_diagnostics["kg_source_counts"] == {"tn_primary_kg": 1, "backup_kg_1": 1}
    assert bundle.retrieval_diagnostics["kg_support_only_count"] == 1


def test_kg_search_endpoint_uses_multikg_even_with_filters(monkeypatch):
    seen = {}

    class _EndpointRetriever:
        def retrieve(self, query, limit=None, **kwargs):
            seen["query"] = query
            seen["kwargs"] = kwargs
            return [KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.7, kg_source="backup_kg_1", support_only=True)]

    import apps.api.routers.prescriptions as prescriptions_router

    monkeypatch.setattr(prescriptions_router, "get_kg_retriever", lambda: _EndpointRetriever())
    response = TestClient(app).get("/v1/prescriptions/kg/search", params={"query": "ibuprofen warfarin", "limit": 10, "route": "safety", "source_mode": "backup_only"})

    assert response.status_code == 200
    body = response.json()
    assert body["facts"][0]["kg_source"] == "backup_kg_1"
    assert body["facts"][0]["support_only"] is True
    assert isinstance(seen["query"], RetrievalQuery)
    assert seen["query"].filters == {"route": "safety"}
    assert seen["kwargs"] == {"source_mode": "backup_only"}


def test_readiness_reports_backup_kuzu_db_exists_for_nested_kaggle_dataset(tmp_path, monkeypatch):
    dataset_dir = tmp_path / "hetionet-primekg-kuzu-database"
    nested_kuzu = dataset_dir / "export" / "primekg.kuzu"
    nested_kuzu.mkdir(parents=True)
    settings = AppSettings(
        kg_backup_enabled=True,
        kg_backup_backend="kuzu",
        kg_backup_kuzu_db_path=str(dataset_dir),
        kg_backend="csv",
        vector_backend="csv",
        local_formulary_backend="csv",
        kg_catalog_path=str(tmp_path / "missing.csv"),
        vector_corpus_path=str(tmp_path / "missing.jsonl"),
        local_formulary_catalog_path=str(tmp_path / "missing_formulary.csv"),
    )

    import apps.api.routers.system as system_router

    monkeypatch.setattr(system_router, "get_settings", lambda: settings)
    body = system_router.readiness_status()

    assert body["backup_kuzu_db_exists"] is True
    assert body["resource_checks"]["kg"]["backup_kuzu_db_exists"] is True
    assert body["resource_checks"]["kg"]["resolved_backup_kuzu_db_path"].endswith("primekg.kuzu")


def test_curated_primary_kg_covers_acenocoumarol_bleeding_query():
    from services.retrieval.kg_retriever import KGRetriever

    class _EmptyClient:
        def fetch_related_facts(self, query, limit=5, filters=None):
            return []

    facts = KGRetriever(client=_EmptyClient(), enable_curated_fallbacks=True).retrieve(
        "acenocoumarol SINTROM anticoagulant bleeding interaction",
        limit=10,
    )

    rendered = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in facts).lower()
    assert "acenocoumarol" in rendered
    assert any(term in rendered for term in ["bleeding", "melaena", "coagulopathy"])


def test_kuzu_retriever_falls_back_to_minimal_schema_when_optional_edge_properties_missing(tmp_path):
    import pandas as pd

    from libs.knowledge_connectors.neo4j_client import Neo4jClient

    class _Result:
        def __init__(self, df):
            self._df = df

        def get_as_df(self):
            return self._df

    class _MinimalKuzuConnection:
        def __init__(self):
            self.calls = 0

        def execute(self, query, params):
            self.calls += 1
            if "relation_category" in query:
                raise RuntimeError("Binder exception: optional relation_category property is absent")
            return _Result(pd.DataFrame([
                {"subject": "Acenocoumarol", "predicate": "causes_ccse", "object": "Melaena"},
                {"subject": "Acenocoumarol", "predicate": "causes_ccse", "object": "Coagulopathy"},
            ]))

    kuzu_dir = tmp_path / "tn_kg_safety.kuzu"
    kuzu_dir.mkdir()
    client = Neo4jClient(backend="kuzu", csv_path=kuzu_dir)
    client._kuzu_conn = _MinimalKuzuConnection()

    facts = client.fetch_related_facts(
        "acenocoumarol SINTROM anticoagulant bleeding interaction",
        limit=10,
    )

    rendered = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in facts).lower()
    assert "acenocoumarol" in rendered
    assert "melaena" in rendered
    assert "coagulopathy" in rendered


def test_readiness_resolves_kaggle_kuzu_zip_dataset(tmp_path, monkeypatch):
    import zipfile
    from libs.config import AppSettings
    import apps.api.routers.system as system_router

    dataset_dir = tmp_path / "hetionet-primekg-kuzu-database"
    dataset_dir.mkdir()
    source_root = tmp_path / "zip_source" / "hetionet_primekg_kuzu_full" / "db.kuzu"
    source_root.mkdir(parents=True)
    (source_root / "catalog.kz").write_text("marker", encoding="utf-8")
    zip_path = dataset_dir / "hetionet_primekg_kuzu_full.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(source_root / "catalog.kz", "hetionet_primekg_kuzu_full/db.kuzu/catalog.kz")

    monkeypatch.setenv("CDSS_KUZU_EXTRACT_DIR", str(tmp_path / "extract"))
    settings = AppSettings(
        kg_backup_enabled=True,
        kg_backup_backend="kuzu",
        kg_backup_kuzu_db_path=str(dataset_dir),
        kg_backend="csv",
        vector_backend="csv",
        local_formulary_backend="csv",
        kg_catalog_path=str(tmp_path / "missing.csv"),
        vector_corpus_path=str(tmp_path / "missing.jsonl"),
        local_formulary_catalog_path=str(tmp_path / "missing_formulary.csv"),
    )

    monkeypatch.setattr(system_router, "get_settings", lambda: settings)
    body = system_router.readiness_status()

    resolved = body["resource_checks"]["kg"]["resolved_backup_kuzu_db_path"]
    assert body["backup_kuzu_db_exists"] is True
    assert resolved.endswith("hetionet_primekg_kuzu_full/db.kuzu")


def test_kuzu_retriever_supports_hetionet_primekg_rel_type_schema(tmp_path):
    import pandas as pd
    from libs.knowledge_connectors.neo4j_client import Neo4jClient

    class _Result:
        def __init__(self, df):
            self._df = df

        def get_as_df(self):
            return self._df

    class _RelTypeKuzuConnection:
        def execute(self, query, params):
            if "KG_REL" in query or "r.relation " in query or "r.relation AS" in query:
                raise RuntimeError("Binder exception: relation property absent")
            if "r.rel_type" not in query:
                raise RuntimeError("expected rel_type variant")
            return _Result(pd.DataFrame([
                {"subject": "Warfarin", "predicate": "synergistic interaction", "object": "Ibuprofen", "source_system": "primekg"},
                {"subject": "Acenocoumarol", "predicate": "causes", "object": "Melaena", "source_system": "hetionet"},
            ]))

    kuzu_dir = tmp_path / "db.kuzu"
    kuzu_dir.mkdir()
    client = Neo4jClient(backend="kuzu", csv_path=kuzu_dir)
    client._kuzu_conn = _RelTypeKuzuConnection()

    facts = client.fetch_related_facts("ibuprofen warfarin bleeding", limit=10)
    rendered = " ".join(f"{f.subject} {f.predicate} {f.object} {f.provenance}" for f in facts).lower()

    assert "warfarin" in rendered
    assert "ibuprofen" in rendered
    assert "synergistic interaction" in rendered
    assert "primekg" in rendered

from __future__ import annotations

from libs.contracts.evidence import KnowledgeGraphFact, RetrievalPlan, RetrievalQuery
from services.retrieval.hybrid_retriever import HybridRetriever
from services.retrieval.kg_retriever import MultiKGRetriever


class _FakeRetriever:
    def __init__(self, facts: list[KnowledgeGraphFact]):
        self.facts = facts
        self.last_query = None

    def retrieve(self, query, limit: int | None = None):
        self.last_query = query
        return self.facts[: limit or len(self.facts)]


def _backup_fact(subject: str, predicate: str, obj: str, score: float = 0.91) -> KnowledgeGraphFact:
    return KnowledgeGraphFact(subject=subject, predicate=predicate, object=obj, score=score, provenance="hetionet_primekg_test")


def test_source_mode_primary_only_excludes_backup_facts():
    retriever = MultiKGRetriever(
        primary_retriever=_FakeRetriever([KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.9)]),
        backup_retrievers=[_FakeRetriever([_backup_fact("warfarin", "increases_risk_of", "bleeding")])],
        backup_enabled=True,
    )

    facts = retriever.retrieve("ibuprofen warfarin", limit=10, source_mode="primary_only")

    assert facts
    assert {f.kg_source for f in facts} == {"tn_primary_kg"}
    assert all(f.support_only is False for f in facts)


def test_source_mode_backup_only_returns_sintrom_support_facts():
    retriever = MultiKGRetriever(
        primary_retriever=_FakeRetriever([KnowledgeGraphFact(subject="acenocoumarol", predicate="primary", object="safety", score=0.99)]),
        backup_retrievers=[_FakeRetriever([
            _backup_fact("Acenocoumarol", "causes_ccse", "Melaena"),
            _backup_fact("Acenocoumarol", "causes_ccse", "Coagulopathy"),
        ])],
        backup_enabled=True,
    )

    facts = retriever.retrieve("acenocoumarol SINTROM anticoagulant bleeding interaction", limit=10, source_mode="backup_only")
    rendered = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in facts).lower()

    assert "acenocoumarol" in rendered
    assert any(term in rendered for term in ["melaena", "coagulopathy"])
    assert {f.kg_source for f in facts} == {"backup_kg_1"}
    assert all(f.support_only is True for f in facts)


def test_source_mode_backup_only_returns_ibuprofen_warfarin_support_facts():
    retriever = MultiKGRetriever(
        primary_retriever=_FakeRetriever([]),
        backup_retrievers=[_FakeRetriever([
            _backup_fact("Ibuprofen", "interacts_with", "Warfarin"),
            _backup_fact("Warfarin", "increases_risk_of", "Bleeding"),
        ])],
        backup_enabled=True,
    )

    facts = retriever.retrieve("ibuprofen warfarin", limit=10, source_mode="backup_only")
    rendered = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in facts).lower()

    assert "ibuprofen" in rendered
    assert "warfarin" in rendered
    assert "bleeding" in rendered
    assert all(f.kg_source == "backup_kg_1" and f.support_only for f in facts)


def test_source_mode_backup_only_returns_warfarin_pharmacogenomic_support_facts():
    retriever = MultiKGRetriever(
        primary_retriever=_FakeRetriever([]),
        backup_retrievers=[_FakeRetriever([
            _backup_fact("Warfarin", "associated_with_gene", "CYP2C9"),
            _backup_fact("Warfarin", "associated_with_gene", "VKORC1"),
        ])],
        backup_enabled=True,
    )

    facts = retriever.retrieve("warfarin CYP2C9 VKORC1", limit=10, source_mode="backup_only")
    rendered = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in facts).lower()

    assert "cyp2c9" in rendered
    assert "vkorc1" in rendered
    assert all(f.support_only for f in facts)


def test_primary_plus_backups_reserves_support_slots_when_primary_is_full():
    primary_facts = [KnowledgeGraphFact(subject=f"primary-{i}", predicate="related_to", object="case", score=0.99 - i * 0.01) for i in range(10)]
    backup_facts = [
        _backup_fact("Ibuprofen", "interacts_with", "Warfarin"),
        _backup_fact("Warfarin", "increases_risk_of", "Bleeding"),
        _backup_fact("Acenocoumarol", "causes_ccse", "Melaena"),
    ]
    retriever = MultiKGRetriever(
        primary_retriever=_FakeRetriever(primary_facts),
        backup_retrievers=[_FakeRetriever(backup_facts)],
        backup_enabled=True,
        backup_min_support_facts=3,
    )

    facts = retriever.retrieve("ibuprofen warfarin bleeding", limit=8, source_mode="primary_plus_backups")

    backup_count = sum(1 for fact in facts if fact.kg_source == "backup_kg_1")
    assert len(facts) == 8
    assert backup_count >= 3
    assert all(fact.support_only for fact in facts if fact.kg_source == "backup_kg_1")


def test_hybrid_diagnostics_include_source_attribution_for_multikg():
    class _Vector:
        def retrieve(self, *args, **kwargs):
            return []

    class _Local:
        def retrieve(self, *args, **kwargs):
            return []

    kg = _FakeRetriever([
        KnowledgeGraphFact(subject="ibuprofen", predicate="interacts_with", object="warfarin", score=0.9, kg_source="tn_primary_kg"),
        KnowledgeGraphFact(subject="warfarin", predicate="increases_risk_of", object="bleeding", score=0.6, kg_source="backup_kg_1", support_only=True),
    ])
    plan = RetrievalPlan(primary_terms=["ibuprofen"], queries=[RetrievalQuery(source="kg", text="ibuprofen warfarin", limit=2)])

    bundle = HybridRetriever(vector_retriever=_Vector(), kg_retriever=kg, local_retriever=_Local()).retrieve_from_plan(plan)
    attribution = {item["source"]: item for item in bundle.retrieval_diagnostics["source_attribution"]}

    assert attribution["tn_primary_kg"]["influence"] == "blocking"
    assert attribution["backup_kg_1"]["influence"] == "support_only"
    assert attribution["backup_kg_1"]["support_only_facts"] == 1


def test_patch22_stroke_fast_pattern_routes_emergency_not_false_safe():
    from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
    from services.order_extraction.service import MedicalOrderExtractionService
    from services.planning.execution_planner import ExecutionPlanner
    from services.safety.policy_engine import SafetyPolicyEngine

    note = "FAST positive: face droop, arm weakness and speech difficulty started suddenly 1 hour ago."
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-stroke", age_years=64, sex="female"),
        consultation=ConsultationInput(language="en", doctor_notes=note),
        normalized_symptoms=[],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=note,
        route_recommendation="prescription",
    )
    orders = MedicalOrderExtractionService().extract(snapshot)
    policy = SafetyPolicyEngine().evaluate(snapshot, medical_orders=orders)
    plan = ExecutionPlanner(policy_mode="enforce").plan(snapshot, medical_orders=orders, policy_decision=policy)

    assert plan.route == "emergency"
    assert plan.allowed_to_generate is False


def test_patch22_arabizi_chest_pain_left_arm_routes_emergency_not_false_safe():
    from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
    from services.order_extraction.service import MedicalOrderExtractionService
    from services.planning.execution_planner import ExecutionPlanner
    from services.safety.policy_engine import SafetyPolicyEngine

    note = "3andi wja3 sderi m3a t3arra9 w pain fi left arm depuis 30 minutes."
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-arabizi-cardiac", age_years=55, sex="male"),
        consultation=ConsultationInput(language="fr", doctor_notes=note),
        normalized_symptoms=[],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=note,
        route_recommendation="prescription",
    )
    orders = MedicalOrderExtractionService().extract(snapshot)
    policy = SafetyPolicyEngine().evaluate(snapshot, medical_orders=orders)
    plan = ExecutionPlanner(policy_mode="enforce").plan(snapshot, medical_orders=orders, policy_decision=policy)

    assert plan.route == "emergency"
    assert plan.allowed_to_generate is False


def test_patch23_arabizi_cardiac_variant_forms_do_not_false_safe():
    """Regression for v3_smoke arabizi_chest_pain_sweating_left_arm false-safe.

    The executed Patch22 notebook showed this clinical family could return
    prescription/draft_prescription because some Arabizi/Arabic variants were
    not recognized as cardiac red flags.  Every phrase below must be captured
    as emergency without relying on Qwen.
    """
    from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
    from services.order_extraction.service import MedicalOrderExtractionService
    from services.planning.execution_planner import ExecutionPlanner
    from services.safety.policy_engine import SafetyPolicyEngine

    variants = [
        "3andi wajaa fi sderi w 3ra9 w yedi lisra touja3ni depuis 30 minutes.",
        "wji3a f sderi m3a ta3req w yeddi lisra.",
        "wja3 fel sder, 3are9 barcha, yeddi lissar touja3ni.",
        "وجيعة في صدري مع عرق و يدي اليسرى توجعني.",
        "وجع صدر مع تعرق و ألم في الذراع اليسرى.",
    ]
    service = MedicalOrderExtractionService()
    planner = ExecutionPlanner(policy_mode="enforce")
    engine = SafetyPolicyEngine()

    for note in variants:
        snapshot = PatientSnapshot(
            patient=PatientProfile(patient_id="p-arabizi-cardiac-var", age_years=58, sex="male"),
            consultation=ConsultationInput(language="fr_arabizi", doctor_notes=note),
            normalized_symptoms=[],
            suspected_conditions=[],
            missing_critical_information=[],
            risk_flags=RiskFlags(),
            normalized_runtime_text=note,
            route_recommendation="prescription",
        )
        orders = service.extract(snapshot)
        policy = engine.evaluate(snapshot, medical_orders=orders)
        plan = planner.plan(snapshot, medical_orders=orders, policy_decision=policy)

        assert plan.route == "emergency", note
        assert plan.display_route == "emergency", note
        assert plan.allowed_to_generate is False, note
        assert any(getattr(m, "canonical", "") == "chest_pain_red_flags" for m in orders.red_flag_mentions), note

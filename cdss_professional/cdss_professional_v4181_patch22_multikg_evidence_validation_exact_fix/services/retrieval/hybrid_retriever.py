from __future__ import annotations

import os
import time
from typing import Any, Callable

from libs.contracts.evidence import EvidenceBundle, RetrievalPlan, RetrievalQuery
from libs.contracts.patient import PatientSnapshot
from services.retrieval.evidence_fuser import EvidenceFuser
from services.retrieval.evidence_ranker import EvidenceRanker
from services.retrieval.kg_retriever import KGRetriever
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever
from services.retrieval.query_builder import RetrievalQueryBuilder
from services.retrieval.vector_retriever import VectorRetriever
from services.retrieval.tn_med_enrichment_retriever import TNMedEnrichmentRetriever


class HybridRetriever:
    def __init__(self, vector_retriever=None, kg_retriever=None, local_retriever=None, tn_med_retriever=None, tn_med_enabled: bool = False, ranker=None, fuser=None, query_builder=None) -> None:
        self.vector_retriever = vector_retriever or VectorRetriever()
        self.kg_retriever = kg_retriever or KGRetriever()
        self.local_retriever = local_retriever or LocalFormularyRetriever()
        self.tn_med_enabled = bool(tn_med_enabled)
        self.tn_med_retriever = tn_med_retriever or (TNMedEnrichmentRetriever(enabled=True) if self.tn_med_enabled else None)
        self.ranker = ranker or EvidenceRanker()
        self.fuser = fuser or EvidenceFuser()
        self.query_builder = query_builder or RetrievalQueryBuilder()

    def retrieve(
        self,
        snapshot: PatientSnapshot,
        top_k_vector_results: int = 5,
        top_k_graph_facts: int = 5,
        top_k_local_products: int = 5,
        target_ingredients: list[str] | None = None,
        execution_plan: Any | None = None,
    ) -> EvidenceBundle:
        plan = self.query_builder.build(
            snapshot,
            top_k_vector_results=top_k_vector_results,
            top_k_graph_facts=top_k_graph_facts,
            top_k_local_products=top_k_local_products,
        )
        if target_ingredients:
            plan = _targeted_plan(plan, target_ingredients, execution_plan, top_k_vector_results, top_k_graph_facts, top_k_local_products)
        return self.retrieve_from_plan(plan, target_ingredients=target_ingredients)

    def retrieve_from_plan(self, plan: RetrievalPlan, target_ingredients: list[str] | None = None) -> EvidenceBundle:
        timings: dict[str, Any] = {}
        started_total = time.perf_counter()

        query_terms = plan.primary_terms + plan.patient_context_tokens
        vector_query = next((query for query in plan.queries if query.source == "vector"), None)
        kg_query = next((query for query in plan.queries if query.source == "kg"), None)
        local_query = next((query for query in plan.queries if query.source == "local_formulary"), None)

        vector_top_k = _env_int("VECTOR_TOP_K_RERANK", getattr(vector_query, "limit", 5) or 5)
        kg_top_k = _env_int("KG_TOP_K", getattr(kg_query, "limit", 5) or 5)
        local_top_k = _env_int("LOCAL_FORMULARY_TOP_K", getattr(local_query, "limit", 5) or 5)
        rerank_enabled = _env_bool("RERANK_ENABLED", False)

        t0 = time.perf_counter()
        vector_raw = _safe_retrieve(self.vector_retriever, vector_query or "general consultation", vector_top_k, timings, "vector")
        timings["vector_search_ms"] = _elapsed(t0)

        t0 = time.perf_counter()
        kg_raw = _safe_retrieve(self.kg_retriever, kg_query or "general consultation", kg_top_k, timings, "kg")
        timings["kg_search_ms"] = _elapsed(t0)

        t0 = time.perf_counter()
        local_raw = _safe_retrieve(self.local_retriever, local_query or "general consultation", local_top_k, timings, "local")
        timings["local_formulary_ms"] = _elapsed(t0)

        tn_med_raw = []
        if self.tn_med_enabled and self.tn_med_retriever is not None:
            t0 = time.perf_counter()
            enrichment_query = local_query or vector_query or kg_query or "general consultation"
            tn_med_top_k = _env_int("TN_MED_TOP_K", 4)
            tn_med_raw = _safe_retrieve(self.tn_med_retriever, enrichment_query, tn_med_top_k, timings, "tn_med")
            timings["tn_med_enrichment_ms"] = _elapsed(t0)
        else:
            timings["tn_med_enrichment_ms"] = 0.0

        if rerank_enabled:
            t0 = time.perf_counter()
            vector_chunks = _safe_rank(self.ranker.rank_chunks, vector_raw, query_terms, timings, "vector")[:vector_top_k]
            if tn_med_raw:
                # Keep structured TN Med enrichment reserved; it should not be
                # lost simply because semantic vector top-k is already full.
                vector_chunks = list(vector_chunks) + list(tn_med_raw)
            timings["vector_rerank_ms"] = _elapsed(t0)
            t0 = time.perf_counter()
            graph_facts = _safe_rank(self.ranker.rank_facts, kg_raw, query_terms, timings, "kg")[:kg_top_k]
            timings["kg_rerank_ms"] = _elapsed(t0)
            t0 = time.perf_counter()
            local_products = _safe_rank(self.ranker.rank_products, local_raw, query_terms, timings, "local")[:local_top_k]
            timings["local_rerank_ms"] = _elapsed(t0)
        else:
            vector_chunks = list(vector_raw[:vector_top_k]) + list(tn_med_raw)
            graph_facts, local_products = kg_raw[:kg_top_k], local_raw[:local_top_k]
            timings["vector_rerank_ms"] = timings["kg_rerank_ms"] = timings["local_rerank_ms"] = 0.0

        t0 = time.perf_counter()
        bundle = _safe_fuse(self.fuser, vector_chunks, graph_facts, local_products, plan, timings)
        timings["evidence_fusion_ms"] = _elapsed(t0)
        timings["retrieval_total_ms"] = _elapsed(started_total)
        timings["rerank_enabled"] = rerank_enabled
        targets = list(target_ingredients or getattr(plan, "expected_active_ingredients", []) or ([getattr(plan, "expected_active_ingredient")] if getattr(plan, "expected_active_ingredient", None) else []))
        timings["target_ingredients"] = [target for target in targets if target]
        timings["expected_active_ingredient_for_scoring"] = timings["target_ingredients"][0] if timings["target_ingredients"] else None
        timings["local_final_count"] = len(local_products)
        timings["kg_final_count"] = len(graph_facts)
        timings["vector_final_count"] = len(vector_chunks)
        timings["tn_med_final_count"] = len([chunk for chunk in vector_chunks if str(getattr(chunk, "source", "")) == "tn_med_db_v1" or str((getattr(chunk, "metadata", {}) or {}).get("source_system", "")) == "tn_med_db_v1"])
        kg_source_counts: dict[str, int] = {}
        kg_support_only_count = 0
        source_attribution: dict[str, dict[str, Any]] = {}
        for fact in graph_facts:
            kg_source = str(getattr(fact, "kg_source", None) or "unknown")
            kg_source_counts[kg_source] = kg_source_counts.get(kg_source, 0) + 1
            support_only = bool(getattr(fact, "support_only", False))
            if support_only:
                kg_support_only_count += 1
            attribution = source_attribution.setdefault(
                kg_source,
                {"source": kg_source, "facts": 0, "support_only_facts": 0, "influence": "support_only" if support_only else "context"},
            )
            attribution["facts"] += 1
            if support_only:
                attribution["support_only_facts"] += 1
            if _is_blocking_kg_fact(fact) and not support_only:
                attribution["influence"] = "blocking"
            elif _is_blocking_kg_fact(fact) and attribution.get("influence") != "blocking":
                attribution["influence"] = "support_only"
        timings["kg_source_counts"] = kg_source_counts
        timings["kg_support_only_count"] = kg_support_only_count
        timings["source_attribution"] = list(source_attribution.values())
        return bundle.model_copy(update={"retrieval_diagnostics": {**(bundle.retrieval_diagnostics or {}), **timings}})


def _is_blocking_kg_fact(fact: Any) -> bool:
    text = f"{getattr(fact, 'subject', '')} {getattr(fact, 'predicate', '')} {getattr(fact, 'object', '')}".lower()
    return any(
        token in text
        for token in [
            "contraindicat",
            "interact",
            "avoid",
            "bleeding",
            "melaena",
            "melena",
            "coagulopathy",
            "renal",
            "pregnan",
            "allergy",
            "anaphyl",
            "risk",
        ]
    )


def _targeted_plan(plan: RetrievalPlan, targets: list[str], execution_plan: Any | None, top_k_vector: int, top_k_kg: int, top_k_local: int) -> RetrievalPlan:
    primary = list(dict.fromkeys(list(targets) + list(plan.primary_terms or [])))
    target = targets[0] if targets else None
    route = getattr(execution_plan, "target_route", None) or ("inhalation" if target == "salbutamol" else "oral" if target == "paracetamol" else "")
    strength = getattr(execution_plan, "target_strength", None) or ("100 mcg" if target == "salbutamol" else "500 mg" if target == "paracetamol" else "")

    patient_context = " ".join(list(plan.primary_terms or []) + list(plan.patient_context_tokens or []))
    kg_terms = " ".join([target or "", patient_context, "safety contraindication interaction"]).strip()

    text_base = " ".join([target or "", strength or "", route or "", "Tunisia mono ingredient local formulary"]).strip()
    queries = [
        RetrievalQuery(source="local_formulary", text=text_base, limit=top_k_local, filters={"active_ingredient": target or "", "route": route or "", "strength": strength or ""}),
        RetrievalQuery(source="kg", text=kg_terms, limit=top_k_kg, filters={"active_ingredient": target or ""}),
        RetrievalQuery(source="vector", text=" ".join([target or "", strength or "", route or "", "dose contraindication warning runtime retrieval evidence requires RCP verification"]), limit=top_k_vector, filters={"active_ingredient": target or "", "accepted_for_runtime_retrieval": "true"}),
    ]
    return plan.model_copy(update={"primary_terms": primary, "queries": queries, "expected_active_ingredient": target, "expected_active_ingredients": targets})


def _safe_retrieve(component: Any, query: Any, top_k: int, diagnostics: dict[str, Any], label: str) -> list:
    method = component.retrieve
    attempts = [
        ("query_limit", lambda: method(query, limit=top_k)),
        ("query_top_k", lambda: method(query, top_k=top_k)),
        ("query_only", lambda: method(query)),
        ("text_limit", lambda: method(getattr(query, "text", str(query)), limit=top_k)),
        ("text_top_k", lambda: method(getattr(query, "text", str(query)), top_k=top_k)),
        ("text_only", lambda: method(getattr(query, "text", str(query)))),
    ]
    for name, fn in attempts:
        try:
            result = fn()
            diagnostics[f"{label}_retrieve_call_shape"] = name
            return list(result or [])[:top_k]
        except TypeError:
            continue
    return []


def _safe_rank(method: Callable, items: list, query_terms: list[str], diagnostics: dict[str, Any], label: str) -> list:
    for name, fn in [
        ("keyword", lambda: method(items, query_terms=query_terms)),
        ("positional", lambda: method(items, query_terms)),
        ("items", lambda: method(items)),
    ]:
        try:
            diagnostics[f"{label}_rank_call_shape"] = name
            return list(fn() or [])
        except TypeError:
            continue
    return list(items)


def _safe_fuse(fuser: EvidenceFuser, vector_chunks: list, graph_facts: list, local_products: list, plan: RetrievalPlan, diagnostics: dict[str, Any]) -> EvidenceBundle:
    try:
        return fuser.fuse(vector_chunks, graph_facts, local_products, retrieval_plan=plan)
    except TypeError:
        bundle = fuser.fuse(vector_chunks, graph_facts, local_products)
        return bundle.model_copy(update={"retrieval_plan": plan})


def _elapsed(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except Exception:
        return int(default)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", "disabled"}

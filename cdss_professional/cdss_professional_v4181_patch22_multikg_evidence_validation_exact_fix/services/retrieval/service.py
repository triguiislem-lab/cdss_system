from __future__ import annotations

import time
from typing import Any

from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from services.retrieval.evidence_quality import EvidenceQualityBuilder
from services.retrieval.hybrid_retriever import HybridRetriever


class RetrievalService:
    """High-level retrieval entrypoint with target propagation and diagnostics."""

    def __init__(self, retriever: HybridRetriever | None = None, deduplicator=None, quality_builder: EvidenceQualityBuilder | None = None) -> None:
        self.retriever = retriever or HybridRetriever()
        self.deduplicator = deduplicator
        self.quality_builder = quality_builder or EvidenceQualityBuilder()

    def build_evidence(self, snapshot: PatientSnapshot, config: RuntimePipelineConfig, execution_plan: Any | None = None) -> EvidenceBundle:
        started = time.perf_counter()
        target_ingredients = list(getattr(execution_plan, "target_ingredients", None) or _infer_target_ingredients(snapshot))
        evidence = self.retriever.retrieve(
            snapshot=snapshot,
            top_k_vector_results=config.top_k_vector_results,
            top_k_graph_facts=config.top_k_graph_facts,
            top_k_local_products=config.max_local_product_candidates,
            target_ingredients=target_ingredients,
            execution_plan=execution_plan,
        )
        diagnostics = dict(evidence.retrieval_diagnostics or {})
        diagnostics["target_ingredients"] = target_ingredients
        evidence, dedup_diagnostics = self._maybe_deduplicate(evidence)
        diagnostics.update(dedup_diagnostics)
        diagnostics["service_retrieve_ms"] = round((time.perf_counter() - started) * 1000, 2)
        evidence = evidence.model_copy(update={"retrieval_diagnostics": diagnostics})
        return self.quality_builder.build(evidence, expected_active_ingredient=(target_ingredients[0] if target_ingredients else None))

    def _maybe_deduplicate(self, evidence: EvidenceBundle) -> tuple[EvidenceBundle, dict[str, Any]]:
        if self.deduplicator is None:
            return evidence, {"deduplication_enabled": False}
        diagnostics: dict[str, Any] = {"deduplication_enabled": True}
        updates: dict[str, Any] = {}
        try:
            if evidence.vector_chunks:
                result = self.deduplicator.deduplicate_chunks(list(evidence.vector_chunks))
                updates["vector_chunks"] = result.kept_items
                diagnostics["deduplicated_vector_removed"] = result.removed_count
            if evidence.graph_facts:
                result = self.deduplicator.deduplicate_facts(list(evidence.graph_facts))
                updates["graph_facts"] = result.kept_items
                diagnostics["deduplicated_kg_removed"] = result.removed_count
            if evidence.local_products:
                result = self.deduplicator.deduplicate_products(list(evidence.local_products))
                updates["local_products"] = result.kept_items
                diagnostics["deduplicated_local_removed"] = result.removed_count
        except Exception as exc:
            diagnostics["deduplication_error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
            return evidence, diagnostics
        return evidence.model_copy(update=updates) if updates else evidence, diagnostics


def _infer_target_ingredients(snapshot: PatientSnapshot) -> list[str]:
    text = " ".join([
        " ".join(snapshot.normalized_symptoms or []),
        " ".join(snapshot.suspected_conditions or []),
        " ".join(snapshot.disease_tags or []),
        snapshot.normalized_runtime_text or "",
    ]).lower()
    targets = []
    if any(x in text for x in ["wheezing", "sifflement", "asthma", "asthme", "bronchospasm"]):
        targets.append("salbutamol")
    if any(x in text for x in ["fever", "fievre", "fièvre", "headache", "cephalee", "céphalée", "urti", "grippe", "viral"]):
        targets.append("paracetamol")
    return list(dict.fromkeys(targets))

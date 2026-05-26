from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle, EvidenceChunk, KnowledgeGraphFact, LocalProductEvidence, RetrievalPlan
from services.retrieval.evidence_quality import EvidenceQualityBuilder


class EvidenceFuser:
    """Fuses multiple evidence streams into a single bundle and attaches quality metadata."""

    def __init__(self, quality_builder: EvidenceQualityBuilder | None = None) -> None:
        self.quality_builder = quality_builder or EvidenceQualityBuilder()

    def fuse(
        self,
        vector_chunks: list[EvidenceChunk],
        graph_facts: list[KnowledgeGraphFact],
        local_products: list[LocalProductEvidence],
        retrieval_plan: RetrievalPlan | None = None,
    ) -> EvidenceBundle:
        summary_parts: list[str] = []
        if retrieval_plan and retrieval_plan.primary_terms:
            summary_parts.append(f"Primary terms: {', '.join(retrieval_plan.primary_terms[:5])}")
        if retrieval_plan and retrieval_plan.patient_context_tokens:
            summary_parts.append(f"Patient context: {', '.join(retrieval_plan.patient_context_tokens[:5])}")
        if vector_chunks:
            summary_parts.append(f"Top text evidence: {vector_chunks[0].title}")
        if graph_facts:
            top_fact = graph_facts[0]
            summary_parts.append(f"Top graph fact: {top_fact.subject} {top_fact.predicate} {top_fact.object}")
        if local_products:
            summary_parts.append(f"Top local product: {local_products[0].product_name}")
            summary_parts.append("Data priority: final_data_release local formulary is primary for Tunisian product grounding.")
        if vector_chunks:
            roles = sorted({str(chunk.metadata.get("retrieval_role") or chunk.metadata.get("source_priority") or chunk.metadata.get("source_system") or "vector") for chunk in vector_chunks})
            summary_parts.append(f"Text evidence roles: {', '.join(roles[:4])}.")
        if graph_facts:
            summary_parts.append("KG role: structured relation/safety evidence, not primary product authority.")
        if retrieval_plan and any(q.filters for q in retrieval_plan.queries):
            active_filters = []
            for query in retrieval_plan.queries:
                active_filters.extend([f"{k}={v}" for k, v in query.filters.items() if v])
            if active_filters:
                summary_parts.append(f"Filters: {', '.join(active_filters[:6])}")

        bundle = EvidenceBundle(
            vector_chunks=vector_chunks,
            graph_facts=graph_facts,
            local_products=local_products,
            retrieval_plan=retrieval_plan,
            merged_summary=" | ".join(summary_parts),
        )
        return self.quality_builder.build(bundle)

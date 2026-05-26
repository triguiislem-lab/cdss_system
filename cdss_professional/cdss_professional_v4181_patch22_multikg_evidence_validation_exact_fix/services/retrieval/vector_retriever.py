from __future__ import annotations

from libs.contracts.evidence import EvidenceChunk, RetrievalQuery
from libs.knowledge_connectors.vector_index_client import VectorIndexClient


class VectorRetriever:
    """Retrieves semantically relevant text evidence."""

    def __init__(self, client: VectorIndexClient | None = None, fallback_client: VectorIndexClient | None = None) -> None:
        self.client = client or VectorIndexClient()
        self.fallback_client = fallback_client

    def retrieve(self, query: RetrievalQuery | str, top_k: int | None = None) -> list[EvidenceChunk]:
        if isinstance(query, RetrievalQuery):
            text = query.text
            top_k = query.limit if top_k is None else top_k
            filters = query.filters
        else:
            text = query
            top_k = top_k or 5
            filters = {}
        primary = self.client.similarity_search(query=text, top_k=top_k, filters=filters)
        for item in primary:
            item.metadata.setdefault("retrieval_role", "primary_final_data_release" if item.metadata.get("final_data_release_used") else "primary_vector")
        if len(primary) >= top_k or self.fallback_client is None:
            return primary[:top_k]
        fallback = self.fallback_client.similarity_search(query=text, top_k=top_k - len(primary), filters=filters)
        fallback = [
            item.model_copy(update={"metadata": {**item.metadata, "retrieval_role": "fallback_vector_store"}})
            for item in fallback
        ]
        return [*primary, *fallback][:top_k]

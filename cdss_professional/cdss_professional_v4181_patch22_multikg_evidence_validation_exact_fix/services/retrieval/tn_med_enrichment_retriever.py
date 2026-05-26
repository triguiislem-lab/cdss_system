from __future__ import annotations

from libs.contracts.evidence import EvidenceChunk, RetrievalQuery
from libs.knowledge_connectors.tn_med_client import TNMedEnrichmentClient


class TNMedEnrichmentRetriever:
    """Retrieves structured enrichment chunks from TN Med DB v1."""

    def __init__(self, client: TNMedEnrichmentClient | None = None, enabled: bool = True) -> None:
        self.client = client or TNMedEnrichmentClient(enabled=enabled)
        self.enabled = bool(enabled)

    def retrieve(self, query: RetrievalQuery | str, limit: int = 5, top_k: int | None = None) -> list[EvidenceChunk]:
        if not self.enabled:
            return []
        if isinstance(query, RetrievalQuery):
            text = query.text
            filters = query.filters or {}
            limit = query.limit or limit
        else:
            text = str(query or "")
            filters = {}
        if top_k is not None:
            limit = top_k
        try:
            return self.client.retrieve_chunks(text, limit=limit, filters=filters)
        except Exception:
            return []

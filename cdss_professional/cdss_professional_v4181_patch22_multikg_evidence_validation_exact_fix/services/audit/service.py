from __future__ import annotations

from libs.contracts.execution import PipelineExecutionRecord
from services.audit.repository import AuditRepository, InMemoryAuditRepository


class AuditService:
    """Audit facade backed by a replaceable repository implementation."""

    def __init__(self, repository: AuditRepository | None = None) -> None:
        self.repository = repository or InMemoryAuditRepository()

    def record(self, result: PipelineExecutionRecord) -> None:
        self.repository.save(result)

    def fetch(self, trace_id: str) -> PipelineExecutionRecord | None:
        return self.repository.get(trace_id)

from services.audit.service import AuditService


class ReplayRunner:
    """Starter replay utility for audit traces."""

    def __init__(self, audit: AuditService | None = None) -> None:
        self.audit = audit or AuditService()

    def fetch_trace(self, trace_id: str):
        return self.audit.fetch(trace_id)

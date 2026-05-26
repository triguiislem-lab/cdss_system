from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class IngestionJobResult(BaseModel):
    job_name: str
    status: Literal['ok', 'warning', 'error']
    records_seen: int = Field(default=0, ge=0)
    records_written: int = Field(default=0, ge=0)
    notes: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IngestionReport(BaseModel):
    jobs: list[IngestionJobResult] = Field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(job.status == 'error' for job in self.jobs)

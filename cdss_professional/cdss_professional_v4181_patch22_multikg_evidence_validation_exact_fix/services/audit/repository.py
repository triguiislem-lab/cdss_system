from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Protocol

from libs.contracts.execution import PipelineExecutionRecord


class AuditRepository(Protocol):
    def save(self, result: PipelineExecutionRecord) -> None: ...

    def get(self, trace_id: str) -> PipelineExecutionRecord | None: ...


class InMemoryAuditRepository:
    """Temporary repository for local development."""

    def __init__(self) -> None:
        self._records: dict[str, PipelineExecutionRecord] = {}

    def save(self, result: PipelineExecutionRecord) -> None:
        self._records[result.trace_id] = result

    def get(self, trace_id: str) -> PipelineExecutionRecord | None:
        return self._records.get(trace_id)


class FileAuditRepository:
    """Durable JSON-backed audit repository suitable for local development and demos."""

    def __init__(self, base_dir: str | Path = "data/audit") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, result: PipelineExecutionRecord) -> None:
        path = self.base_dir / f"{result.trace_id}.json"
        try:
            payload = result.model_dump(mode="json")
        except Exception:
            try:
                payload = result.model_dump(mode="python", warnings=False, fallback=_json_safe)
            except TypeError:
                payload = result.model_dump(mode="python")
            payload = _json_safe(payload)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def get(self, trace_id: str) -> PipelineExecutionRecord | None:
        path = self.base_dir / f"{trace_id}.json"
        if not path.exists():
            return None
        return PipelineExecutionRecord.model_validate_json(path.read_text(encoding="utf-8"))


def _json_safe(value):
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, datetime | date):
        return value.isoformat()
    try:
        import numpy as np  # type: ignore

        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            return float(value)
        if isinstance(value, np.ndarray):
            return value.tolist()
    except Exception:
        pass
    return value

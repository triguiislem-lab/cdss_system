from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from libs.contracts.execution import StageTrace, WorkflowStage


class StageRunner:
    """Stage wrapper with lightweight timing, skip, and error tracing."""

    def __init__(self) -> None:
        self._traces: list[StageTrace] = []

    def reset(self) -> None:
        self._traces = []

    @property
    def traces(self) -> list[StageTrace]:
        return list(self._traces)

    def run(self, stage: WorkflowStage, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:  # pragma: no cover - defensive path
            duration_ms = (time.perf_counter() - started) * 1000
            self._traces.append(
                StageTrace(
                    stage_name=stage,
                    status="error",
                    duration_ms=duration_ms,
                    detail=f"{type(exc).__name__}: {exc}",
                )
            )
            raise
        duration_ms = (time.perf_counter() - started) * 1000
        self._traces.append(StageTrace(stage_name=stage, status="ok", duration_ms=duration_ms))
        return result

    def skip(self, stage: WorkflowStage, detail: str) -> None:
        self._traces.append(StageTrace(stage_name=stage, status="skipped", duration_ms=0.0, detail=detail))

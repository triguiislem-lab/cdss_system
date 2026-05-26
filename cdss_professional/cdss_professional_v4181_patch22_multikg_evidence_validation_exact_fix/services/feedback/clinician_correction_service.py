from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
from typing import Any


class ClinicianCorrectionService:
    """Append-only feedback capture for offline evaluation only.

    Corrections are never applied directly to production rules/model behavior.
    They become supervised examples for a later benchmarked promotion process.
    """

    def __init__(self, feedback_path: str | Path = "data/feedback/clinician_corrections.jsonl"):
        self.feedback_path = Path(feedback_path)
        self.feedback_path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, *, request_id: str, action: str, reason: str, before: dict[str, Any] | None = None, after: dict[str, Any] | None = None, clinician_id: str | None = None) -> dict[str, Any]:
        event = {
            "schema_version": "ClinicianCorrectionV1",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "clinician_id": clinician_id,
            "action": action,
            "reason": reason,
            "before": before or {},
            "after": after or {},
            "learning_policy": "offline_evaluation_only_no_runtime_mutation",
        }
        with self.feedback_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event

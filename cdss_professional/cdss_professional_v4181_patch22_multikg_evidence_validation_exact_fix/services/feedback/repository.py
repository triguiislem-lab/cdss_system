from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from libs.contracts.execution import PipelineExecutionRecord
from libs.contracts.feedback import ClinicianFeedbackRequest, FieldEdit, KNOWN_REASON_CODES
from libs.contracts.prescription import TherapeuticPlan
from services.audit.repository import _json_safe


def _resolve_feedback_base_dir(base_dir: str | Path | None) -> Path:
    env_dir = os.getenv("CDSS_FEEDBACK_DIR")
    if env_dir and (base_dir is None or str(base_dir) == "data/feedback"):
        return Path(env_dir)
    return Path(base_dir or "data/feedback")


def _repository_event_path(base_dir: Path) -> Path:
    return base_dir / "feedback_repository_events.jsonl"


def _write_repository_event(base_dir: Path, payload: dict[str, Any]) -> None:
    event = {
        "schema_version": "feedback_repository_event.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **_json_safe(payload),
    }
    try:
        _append_jsonl_locked(_repository_event_path(base_dir), json.dumps(event, ensure_ascii=False))
    except Exception:
        # Repository diagnostics must never block clinician feedback capture.
        pass


def _stable_json(value: Any) -> str:
    return json.dumps(_json_safe(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash_payload(value: Any) -> str:
    return hashlib.sha256(_stable_json(value).encode("utf-8")).hexdigest()


def _hash_text(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _plan_payload(plan: Any | None) -> dict[str, Any] | None:
    if plan is None:
        return None
    return _json_safe(plan.model_dump(mode="python", warnings=False, fallback=_json_safe))


def _diff_values(path: str, old: Any, new: Any, out: list[FieldEdit]) -> None:
    if isinstance(old, dict) and isinstance(new, dict):
        keys = sorted(set(old) | set(new))
        for key in keys:
            child = f"{path}.{key}" if path else str(key)
            _diff_values(child, old.get(key), new.get(key), out)
        return
    if isinstance(old, list) and isinstance(new, list):
        max_len = max(len(old), len(new))
        for idx in range(max_len):
            child = f"{path}[{idx}]" if path else f"[{idx}]"
            old_item = old[idx] if idx < len(old) else None
            new_item = new[idx] if idx < len(new) else None
            _diff_values(child, old_item, new_item, out)
        return
    if old != new:
        out.append(FieldEdit(field=path or "$", old_value=old, new_value=new, reason="clinician_final_plan_diff"))


def infer_field_diffs(draft_plan: Any | None, final_plan: Any | None) -> list[FieldEdit]:
    if draft_plan is None or final_plan is None:
        return []
    old_payload = _plan_payload(draft_plan) or {}
    new_payload = _plan_payload(final_plan) or {}
    diffs: list[FieldEdit] = []
    _diff_values("", old_payload, new_payload, diffs)
    return diffs


def _reason_code_summary(reason_codes: list[str]) -> dict[str, Any]:
    unknown = [code for code in reason_codes if code not in KNOWN_REASON_CODES]
    return {"known_count": len(reason_codes) - len(unknown), "unknown_codes": unknown}


def build_feedback_event(
    *,
    trace_id: str,
    request: ClinicianFeedbackRequest,
    record: PipelineExecutionRecord,
    model_version: str = "unknown",
    runtime_config_version: str = "patch8_feedback_v1",
    evidence_version: str = "unknown",
) -> dict[str, Any]:
    draft_plan = record.proposal.plan if record.proposal else record.draft_plan
    draft_payload = _plan_payload(draft_plan)
    final_payload = _plan_payload(request.final_plan)
    inferred_diffs = infer_field_diffs(draft_plan, request.final_plan)
    provided_edits = [edit.model_dump(mode="python") for edit in request.field_edits]
    inferred_edits = [edit.model_dump(mode="python") for edit in inferred_diffs]
    patient_id = getattr(record.snapshot.patient, "patient_id", None) if record.snapshot else None
    now = datetime.now(timezone.utc).isoformat()
    event = {
        "schema_version": "clinician_feedback.v1",
        "trace_id": trace_id,
        "request_id": record.request_id,
        "created_at": now,
        "clinician_id": request.clinician_id,
        "decision": request.decision,
        "reason_codes": request.reason_codes,
        "reason_code_summary": _reason_code_summary(request.reason_codes),
        "field_edits": provided_edits,
        "inferred_field_edits": inferred_edits,
        "clinician_notes": request.clinician_notes,
        "safety_override": request.safety_override,
        "evidence_rating": request.evidence_rating,
        "patient_id_hash": _hash_text(patient_id),
        "model_version": model_version,
        "runtime_config_version": runtime_config_version,
        "evidence_version": evidence_version,
        "draft_hash": _hash_payload(draft_payload),
        "final_plan_hash": _hash_payload(final_payload) if final_payload is not None else None,
        "draft_status": record.status,
        "draft_blocked": record.blocked,
        "draft_route": record.execution_plan.route if record.execution_plan else getattr(record.snapshot, "route_recommendation", None),
        "doctor_final_validation_required": True,
        "feedback_use_policy": "offline_evaluation_only",
        "live_retraining_allowed": False,
        "learning_signal": {
            "approved_as_is": request.decision == "approved_as_is",
            "edited": request.decision == "approved_with_edits",
            "rejected": request.decision == "rejected",
            "incomplete_decision": request.decision in {"revise_requested", "more_info_requested"},
        },
    }
    return _json_safe(event)


def _append_jsonl_locked(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        try:
            import fcntl  # type: ignore
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        except Exception:  # pragma: no cover - platform fallback
            pass
        f.write(line + "\n")
        f.flush()
        try:
            os.fsync(f.fileno())
        except Exception:  # pragma: no cover
            pass
        try:
            import fcntl  # type: ignore
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except Exception:  # pragma: no cover - platform fallback
            pass


class ClinicianFeedbackRepository:
    def __init__(self, base_dir: str | Path | None = "data/feedback", backend: str = "jsonl") -> None:
        self.backend = (backend or "jsonl").lower()
        self.base_dir = _resolve_feedback_base_dir(base_dir)
        self.by_trace_dir = self.base_dir / "by_trace"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.by_trace_dir.mkdir(parents=True, exist_ok=True)
        self.jsonl_path = self.base_dir / "clinician_feedback.jsonl"
        self.sqlite_path = self.base_dir / "clinician_feedback.sqlite"
        if self.backend == "sqlite":
            self._init_sqlite()

    def _init_sqlite(self) -> None:
        self._ensure_sqlite_database()

    def _ensure_sqlite_database(self) -> None:
        try:
            self._create_sqlite_schema()
            with sqlite3.connect(self.sqlite_path) as conn:
                result = conn.execute("PRAGMA integrity_check").fetchone()
            if not result or str(result[0]).lower() != "ok":
                raise sqlite3.DatabaseError(f"SQLite integrity_check failed: {result}")
        except sqlite3.DatabaseError as exc:
            corrupt_path = None
            if self.sqlite_path.exists():
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                corrupt_path = self.sqlite_path.with_name(f"{self.sqlite_path.name}.{stamp}.corrupt")
                try:
                    self.sqlite_path.replace(corrupt_path)
                except Exception:
                    corrupt_path = None
                    try:
                        self.sqlite_path.unlink(missing_ok=True)
                    except Exception:
                        pass
            _write_repository_event(
                self.base_dir,
                {
                    "event_type": "feedback_database_corrupted_detected",
                    "old_path": str(self.sqlite_path),
                    "new_path": str(corrupt_path) if corrupt_path else None,
                    "action": "recreated_empty_database",
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:300],
                },
            )
            self._create_sqlite_schema()

    def _create_sqlite_schema(self) -> None:
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS clinician_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trace_id TEXT NOT NULL,
                    request_id TEXT,
                    decision TEXT NOT NULL,
                    created_at TEXT,
                    clinician_id TEXT,
                    patient_id_hash TEXT,
                    payload_json TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_trace ON clinician_feedback(trace_id)")
            conn.commit()

    def save(self, event: dict[str, Any]) -> dict[str, Any]:
        trace_id = str(event.get("trace_id") or "unknown")
        line = json.dumps(_json_safe(event), ensure_ascii=False)
        # Keep JSONL as a portable audit/export format even when SQLite is the pilot store.
        _append_jsonl_locked(self.jsonl_path, line)
        trace_path = self.by_trace_dir / f"{trace_id}.jsonl"
        _append_jsonl_locked(trace_path, line)
        if self.backend == "sqlite":
            with sqlite3.connect(self.sqlite_path) as conn:
                conn.execute(
                    "INSERT INTO clinician_feedback(trace_id, request_id, decision, created_at, clinician_id, patient_id_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (trace_id, event.get("request_id"), event.get("decision"), event.get("created_at"), event.get("clinician_id"), event.get("patient_id_hash"), line),
                )
                conn.commit()
        out = dict(event)
        out["_storage_path"] = str(self.sqlite_path if self.backend == "sqlite" else self.jsonl_path)
        out["_export_jsonl_path"] = str(self.jsonl_path)
        return out

    def list_events(self) -> list[dict[str, Any]]:
        if self.backend == "sqlite" and self.sqlite_path.exists():
            with sqlite3.connect(self.sqlite_path) as conn:
                rows = conn.execute("SELECT payload_json FROM clinician_feedback ORDER BY id").fetchall()
            return [json.loads(row[0]) for row in rows]
        if not self.jsonl_path.exists():
            return []
        events = []
        for line in self.jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events

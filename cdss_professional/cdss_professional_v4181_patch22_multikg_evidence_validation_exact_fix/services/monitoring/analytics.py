from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median
from typing import Any


def _safe_get(payload: Any, path: str, default: Any = None) -> Any:
    cur = payload
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return default
        if cur is None:
            return default
    return cur


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _rate(num: int | float, denom: int | float) -> float:
    if not denom:
        return 0.0
    return round(float(num) / float(denom), 4)


def _avg(values: list[float]) -> float:
    return round(float(mean(values)), 3) if values else 0.0


def _p50(values: list[float]) -> float:
    return round(float(median(values)), 3) if values else 0.0


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
    return round(float(ordered[idx]), 3)


def _top(counter: Counter, limit: int = 10) -> dict[str, int]:
    return {str(k): int(v) for k, v in counter.most_common(limit)}


def _parse_time(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


@dataclass(frozen=True)
class MonitoringData:
    audits: list[dict[str, Any]]
    feedback: list[dict[str, Any]]
    audit_load_errors: list[dict[str, str]]
    feedback_load_errors: list[dict[str, str]]


class MonitoringAnalyticsService:
    """Read-only monitoring analytics for clinician-in-the-loop CDSS pilots.

    The service intentionally reads audit and feedback artifacts only. It never
    changes runtime behavior and never performs live learning. Clinician feedback
    is summarized for offline supervised improvement and governance.
    """

    def __init__(self, audit_dir: str | Path = "data/audit", feedback_dir: str | Path = "data/feedback", feedback_backend: str = "jsonl") -> None:
        self.audit_dir = Path(audit_dir)
        self.feedback_dir = Path(feedback_dir)
        self.feedback_backend = (feedback_backend or "jsonl").lower()

    def load(self) -> MonitoringData:
        audit_errors: list[dict[str, str]] = []
        feedback_errors: list[dict[str, str]] = []
        audits = self._load_audits(audit_errors)
        feedback = self._load_feedback(feedback_errors)
        return MonitoringData(audits=audits, feedback=feedback, audit_load_errors=audit_errors, feedback_load_errors=feedback_errors)

    def _load_audits(self, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not self.audit_dir.exists():
            return out
        for path in sorted(self.audit_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    payload.setdefault("_source_path", str(path))
                    out.append(payload)
            except Exception as exc:
                errors.append({"path": str(path), "error_type": type(exc).__name__, "error": str(exc)[:300]})
        return out

    def _load_feedback(self, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
        jsonl_path = self.feedback_dir / "clinician_feedback.jsonl"
        if jsonl_path.exists():
            return self._load_feedback_jsonl(jsonl_path, errors)
        sqlite_path = self.feedback_dir / "clinician_feedback.sqlite"
        if self.feedback_backend == "sqlite" and sqlite_path.exists():
            return self._load_feedback_sqlite(sqlite_path, errors)
        return []

    def _load_feedback_jsonl(self, path: Path, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception as exc:
            errors.append({"path": str(path), "error_type": type(exc).__name__, "error": str(exc)[:300]})
            return out
        for idx, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
                if isinstance(payload, dict):
                    payload.setdefault("_source_path", str(path))
                    payload.setdefault("_source_line", idx)
                    out.append(payload)
            except Exception as exc:
                errors.append({"path": str(path), "line": str(idx), "error_type": type(exc).__name__, "error": str(exc)[:300]})
        return out

    def _load_feedback_sqlite(self, path: Path, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        try:
            with sqlite3.connect(path) as conn:
                rows = conn.execute("SELECT payload_json FROM clinician_feedback ORDER BY id").fetchall()
            for row in rows:
                payload = json.loads(row[0])
                if isinstance(payload, dict):
                    payload.setdefault("_source_path", str(path))
                    out.append(payload)
        except Exception as exc:
            errors.append({"path": str(path), "error_type": type(exc).__name__, "error": str(exc)[:300]})
        return out

    def overview(self) -> dict[str, Any]:
        data = self.load()
        audits = data.audits
        total = len(audits)
        status_counts = Counter(str(a.get("status") or "unknown") for a in audits)
        route_counts = Counter(str(_safe_get(a, "execution_plan.route") or _safe_get(a, "snapshot.route_recommendation") or "unknown") for a in audits)
        display_counts = Counter(str(_safe_get(a, "execution_plan.display_route") or _safe_get(a, "execution_plan.sub_route") or "unknown") for a in audits)
        blocked = sum(1 for a in audits if _as_bool(a.get("blocked")) or str(a.get("status")) == "blocked")
        ready = sum(1 for a in audits if str(a.get("status")) == "ready_for_review")
        latencies = [self._pipeline_latency_ms(a) for a in audits]
        latencies = [v for v in latencies if v is not None]
        empty_plan = sum(1 for a in audits if not _safe_get(a, "draft_plan.medications", []))
        generation_failures = sum(1 for a in audits if self._stage_status(a, "generation") == "error")
        json_parse_failures = sum(1 for a in audits if self._has_post_generation_issue(a, "json"))
        missing_info_cases = sum(1 for a in audits if str(_safe_get(a, "execution_plan.display_route") or _safe_get(a, "execution_plan.sub_route") or "") == "missing_info")
        human_review_cases = sum(1 for a in audits if str(_safe_get(a, "execution_plan.route") or "") in {"review", "emergency", "blocked"} or str(a.get("status")) == "ready_for_review")
        unsafe_prevented = sum(1 for a in audits if _as_bool(a.get("blocked")) or str(_safe_get(a, "execution_plan.display_route") or "") in {"review_blocked", "emergency"})
        hallucination_detected = sum(1 for a in audits if self._has_post_generation_issue(a, "hallucination"))
        feedback_summary = self._feedback_summary(data.feedback, audits)
        return {
            "schema_version": "monitoring.overview.v1",
            "total_cases": total,
            "requests_total": total,
            "blocked_cases": blocked,
            "human_review_cases": human_review_cases,
            "model_errors": generation_failures + json_parse_failures,
            "ready_for_review_rate": _rate(ready, total),
            "blocked_rate": _rate(blocked, total),
            "blocked_cases_rate": _rate(blocked, total),
            "missing_info_rate": _rate(missing_info_cases, total),
            "unsafe_generation_prevented_rate": _rate(unsafe_prevented, total),
            "doctor_acceptance_rate": feedback_summary.get("approved_as_is_rate", 0.0),
            "doctor_correction_rate": feedback_summary.get("approved_with_edits_rate", 0.0),
            "doctor_rejection_rate": feedback_summary.get("rejected_rate", 0.0),
            "hallucination_detected_rate": _rate(hallucination_detected, total),
            "average_latency_ms": _avg(latencies),
            "model_failure_rate": _rate(generation_failures + json_parse_failures, total),
            "extraction_json_valid_rate": _rate(total - json_parse_failures, total),
            "emergency_route_rate": _rate(route_counts.get("emergency", 0), total),
            "review_route_rate": _rate(route_counts.get("review", 0), total),
            "route_counts": _top(route_counts, 20),
            "display_route_counts": _top(display_counts, 20),
            "status_counts": _top(status_counts, 20),
            "average_pipeline_latency_ms": _avg(latencies),
            "pipeline_latency_p50_ms": _p50(latencies),
            "pipeline_latency_p95_ms": _p95(latencies),
            "generation_failure_rate": _rate(generation_failures, total),
            "json_parse_failure_rate": _rate(json_parse_failures, total),
            "empty_plan_rate": _rate(empty_plan, total),
            "audit_load_errors": data.audit_load_errors,
            "feedback_load_errors": data.feedback_load_errors,
            "doctor_feedback_policy": "offline_evaluation_only",
            "live_retraining_allowed": False,
        }

    def pipeline(self) -> dict[str, Any]:
        data = self.load()
        stage_counts: Counter = Counter()
        stage_errors: Counter = Counter()
        stage_latencies: dict[str, list[float]] = defaultdict(list)
        for audit in data.audits:
            for trace in _as_list(audit.get("stage_traces")):
                if not isinstance(trace, dict):
                    continue
                stage = str(trace.get("stage_name") or "unknown")
                status = str(trace.get("status") or "unknown")
                stage_counts[(stage, status)] += 1
                if status == "error":
                    stage_errors[stage] += 1
                duration = trace.get("duration_ms")
                if isinstance(duration, (int, float)):
                    stage_latencies[stage].append(float(duration))
        latency_summary = {
            stage: {"avg_ms": _avg(vals), "p50_ms": _p50(vals), "p95_ms": _p95(vals), "count": len(vals)}
            for stage, vals in sorted(stage_latencies.items())
        }
        return {
            "schema_version": "monitoring.pipeline.v1",
            "total_cases": len(data.audits),
            "stage_status_counts": {f"{stage}:{status}": int(count) for (stage, status), count in stage_counts.items()},
            "stage_error_counts": _top(stage_errors, 20),
            "stage_latency_ms": latency_summary,
            "slowest_cases": self._slowest_cases(data.audits),
        }

    def performance(self) -> dict[str, Any]:
        overview = self.overview()
        pipeline = self.pipeline()
        model = self.model()
        return {
            "schema_version": "monitoring.performance.v1",
            "requests_total": overview.get("requests_total", 0),
            "average_latency_ms": overview.get("average_latency_ms", 0.0),
            "pipeline_latency_p50_ms": overview.get("pipeline_latency_p50_ms", 0.0),
            "pipeline_latency_p95_ms": overview.get("pipeline_latency_p95_ms", 0.0),
            "model_failure_rate": overview.get("model_failure_rate", 0.0),
            "model_errors": overview.get("model_errors", 0),
            "stage_error_counts": pipeline.get("stage_error_counts", {}),
            "llm_status_counts": model.get("llm_status_counts", {}),
        }

    def model(self) -> dict[str, Any]:
        data = self.load()
        total = len(data.audits)
        llm_used = 0
        llm_accepted = 0
        llm_skipped = 0
        llm_low_conf = 0
        llm_static_conflict = 0
        generation_used = 0
        fallback_generation = 0
        unparseable = 0
        status_counts: Counter = Counter()
        for audit in data.audits:
            moe_diag = _safe_get(audit, "medical_order_extraction.diagnostics", {}) or {}
            llm_diag = moe_diag.get("llm_mediqa_oe") or moe_diag.get("llm_order_extraction") or {}
            level1 = _safe_get(audit, "snapshot.extracted_context.llm_level1_extraction", {}) or {}
            for diag in (llm_diag, level1):
                if isinstance(diag, dict):
                    status = str(diag.get("status") or "")
                    if status:
                        status_counts[status] += 1
            selected = any(_as_bool(d.get("selected_for_llm")) for d in (llm_diag, level1) if isinstance(d, dict))
            accepted = any(str(d.get("status")) == "accepted" for d in (llm_diag, level1) if isinstance(d, dict))
            skipped = any(str(d.get("status")).startswith("skipped") for d in (llm_diag, level1) if isinstance(d, dict))
            if selected or accepted:
                llm_used += 1
            if accepted:
                llm_accepted += 1
            if skipped:
                llm_skipped += 1
            confidence = llm_diag.get("confidence") if isinstance(llm_diag, dict) else None
            if isinstance(confidence, (int, float)) and float(confidence) < 0.6:
                llm_low_conf += 1
            if _as_bool((llm_diag or {}).get("static_conflict") if isinstance(llm_diag, dict) else False):
                llm_static_conflict += 1
            if self._stage_status(audit, "generation") == "ok":
                generation_used += 1
            notes = " ".join(str(x).lower() for x in _as_list(_safe_get(audit, "draft_plan.generation_notes", [])))
            if "fallback" in notes or "deterministic" in notes:
                fallback_generation += 1
            if self._has_post_generation_issue(audit, "parse") or self._has_post_generation_issue(audit, "json"):
                unparseable += 1
        return {
            "schema_version": "monitoring.model.v1",
            "total_cases": total,
            "llm_used_rate": _rate(llm_used, total),
            "llm_extraction_acceptance_rate": _rate(llm_accepted, max(llm_used, 1)),
            "llm_skipped_rate": _rate(llm_skipped, total),
            "llm_low_confidence_rate": _rate(llm_low_conf, total),
            "llm_static_conflict_rate": _rate(llm_static_conflict, total),
            "generation_model_used_rate": _rate(generation_used, total),
            "fallback_generation_rate": _rate(fallback_generation, total),
            "unparseable_output_rate": _rate(unparseable, total),
            "llm_status_counts": _top(status_counts, 20),
        }

    def safety(self) -> dict[str, Any]:
        data = self.load()
        category_counts: Counter = Counter()
        blocking_category_counts: Counter = Counter()
        rule_counts: Counter = Counter()
        emergency = 0
        unsafe_removed = 0
        block_keywords = {
            "allergy_block_count": ["allergy", "hypersensitivity"],
            "pregnancy_block_count": ["pregnancy", "pregnant"],
            "renal_block_count": ["renal", "kidney", "ckd"],
            "hepatic_block_count": ["hepatic", "liver"],
            "ddi_block_count": ["interaction", "ddi", "anticoagulant", "bleeding"],
            "dose_guardrail_count": ["dose", "overdose", "overuse", "duplicate"],
        }
        keyword_counts = {name: 0 for name in block_keywords}
        for audit in data.audits:
            route = str(_safe_get(audit, "execution_plan.route") or "")
            if route == "emergency":
                emergency += 1
            for hit in _as_list(_safe_get(audit, "execution_plan.policy_hits", [])):
                if isinstance(hit, dict):
                    rid = hit.get("rule_id") or hit.get("id")
                    if rid:
                        rule_counts[str(rid)] += 1
            for finding in _as_list(_safe_get(audit, "safety.findings", [])):
                if not isinstance(finding, dict):
                    continue
                category = str(finding.get("category") or "unknown")
                category_counts[category] += 1
                hay = " ".join(str(finding.get(k) or "") for k in ["category", "message", "rule_id", "medication"]).lower()
                if _as_bool(finding.get("blocked")):
                    blocking_category_counts[category] += 1
                    for metric, terms in block_keywords.items():
                        if any(term in hay for term in terms):
                            keyword_counts[metric] += 1
                rid = finding.get("rule_id")
                if rid:
                    rule_counts[str(rid)] += 1
            pgv = audit.get("post_generation_validation") or {}
            if isinstance(pgv, dict):
                removed = pgv.get("removed_medications") or pgv.get("removed_ingredients") or []
                if isinstance(removed, list):
                    unsafe_removed += len(removed)
                elif removed:
                    unsafe_removed += 1
        return {
            "schema_version": "monitoring.safety.v1",
            "total_cases": len(data.audits),
            **keyword_counts,
            "emergency_detected_count": emergency,
            "unsafe_generation_removed_count": unsafe_removed,
            "safety_finding_counts_by_category": _top(category_counts, 30),
            "blocking_finding_counts_by_category": _top(blocking_category_counts, 30),
            "top_policy_or_safety_rules": _top(rule_counts, 30),
        }

    def feedback(self) -> dict[str, Any]:
        data = self.load()
        return self._feedback_summary(data.feedback, data.audits)

    def retrieval(self) -> dict[str, Any]:
        data = self.load()
        total = len(data.audits)
        retrieval_attempted = 0
        retrieval_hit = 0
        accepted_evidence = 0
        fallback_evidence = 0
        kg_safety = 0
        local_product_match = 0
        evidence_conf: Counter = Counter()
        for audit in data.audits:
            stage = self._stage_status(audit, "retrieval")
            if stage == "ok":
                retrieval_attempted += 1
            evidence_hits = _as_list(_safe_get(audit, "evidence.evidence_hits", []))
            if evidence_hits:
                retrieval_hit += 1
            for hit in evidence_hits:
                if not isinstance(hit, dict):
                    continue
                if _as_bool(hit.get("accepted_for_clinical_use")) or _as_bool(hit.get("accepted_for_runtime_retrieval")):
                    accepted_evidence += 1
                if _as_bool(hit.get("fallback_used")) or str(hit.get("channel")) == "vector_fallback":
                    fallback_evidence += 1
            eq = _safe_get(audit, "evidence.evidence_quality_summary", {}) or {}
            if isinstance(eq, dict):
                kg_safety += int(eq.get("kg_safety_facts_count") or 0)
                if eq.get("evidence_confidence"):
                    evidence_conf[str(eq.get("evidence_confidence"))] += 1
                if _as_bool(eq.get("localized_product_verified")):
                    local_product_match += 1
            if _safe_get(audit, "proposal.localized_medications", []):
                local_product_match += 1
        avg_rating = self._average_evidence_rating(data.feedback)
        return {
            "schema_version": "monitoring.retrieval.v1",
            "total_cases": total,
            "retrieval_attempted_rate": _rate(retrieval_attempted, total),
            "retrieval_hit_rate": _rate(retrieval_hit, max(retrieval_attempted, 1)),
            "accepted_evidence_count": accepted_evidence,
            "fallback_evidence_count": fallback_evidence,
            "fallback_evidence_rate": _rate(fallback_evidence, max(accepted_evidence + fallback_evidence, 1)),
            "local_product_match_rate": _rate(local_product_match, total),
            "kg_safety_fact_count": kg_safety,
            "evidence_confidence_counts": _top(evidence_conf, 10),
            "evidence_rating_average_from_doctors": avg_rating,
        }

    def localization(self) -> dict[str, Any]:
        data = self.load()
        total = len(data.audits)
        localization_required = 0
        localized = 0
        skipped: Counter = Counter()
        local_product_names: Counter = Counter()
        rejected_candidates = 0
        for audit in data.audits:
            if _as_bool(_safe_get(audit, "execution_plan.localization_required")):
                localization_required += 1
            meds = _as_list(_safe_get(audit, "proposal.localized_medications", []))
            if meds:
                localized += 1
            reason = audit.get("localization_skipped_reason")
            if reason:
                skipped[str(reason)[:120]] += 1
            for med in meds:
                if not isinstance(med, dict):
                    continue
                name = med.get("local_product_name")
                if name:
                    local_product_names[str(name)] += 1
                rejected_candidates += len(_as_list(med.get("rejected_candidates")))
        return {
            "schema_version": "monitoring.localization.v1",
            "total_cases": total,
            "localization_required_rate": _rate(localization_required, total),
            "local_product_match_rate": _rate(localized, max(localization_required, 1)),
            "localized_case_count": localized,
            "rejected_localization_candidate_count": rejected_candidates,
            "top_local_products": _top(local_product_names, 20),
            "top_localization_skip_reasons": _top(skipped, 10),
        }

    def clinical_quality(self) -> dict[str, Any]:
        data = self.load()
        feedback_summary = self._feedback_summary(data.feedback, data.audits)
        by_route: dict[str, Counter] = defaultdict(Counter)
        feedback_by_trace = {str(f.get("trace_id")): f for f in data.feedback if f.get("trace_id")}
        for audit in data.audits:
            trace_id = str(audit.get("trace_id") or "")
            route = str(_safe_get(audit, "execution_plan.route") or _safe_get(audit, "snapshot.route_recommendation") or "unknown")
            fb = feedback_by_trace.get(trace_id)
            decision = str(fb.get("decision") if fb else "no_feedback")
            by_route[route][decision] += 1
        return {
            "schema_version": "monitoring.clinical_quality.v1",
            "total_cases": len(data.audits),
            "total_feedback": len(data.feedback),
            "feedback_summary": feedback_summary,
            "decision_counts_by_route": {route: dict(counter) for route, counter in by_route.items()},
            "quality_gate_notes": [
                "Clinician feedback is used for supervised offline improvement only.",
                "Rejected or edited cases should be converted into evaluation fixtures before any prompt/rule/model promotion.",
                "Production behavior must not change from feedback without offline validation and clinical governance approval.",
            ],
            "live_retraining_allowed": False,
        }

    def _feedback_summary(self, feedback: list[dict[str, Any]], audits: list[dict[str, Any]]) -> dict[str, Any]:
        total = len(feedback)
        decisions = Counter(str(f.get("decision") or "unknown") for f in feedback)
        reason_codes: Counter = Counter()
        edited_fields: Counter = Counter()
        evidence_ratings: list[float] = []
        review_times: list[float] = []
        audits_by_trace = {str(a.get("trace_id")): a for a in audits if a.get("trace_id")}
        for event in feedback:
            reason_codes.update(str(c) for c in _as_list(event.get("reason_codes")) if c)
            for edit in _as_list(event.get("field_edits")) + _as_list(event.get("inferred_field_edits")):
                if isinstance(edit, dict) and edit.get("field"):
                    edited_fields[str(edit.get("field"))] += 1
            rating = event.get("evidence_rating")
            if isinstance(rating, (int, float)):
                evidence_ratings.append(float(rating))
            trace_id = str(event.get("trace_id") or "")
            created_feedback = _parse_time(event.get("created_at"))
            created_audit = _parse_time((audits_by_trace.get(trace_id) or {}).get("created_at"))
            if created_feedback and created_audit and created_feedback >= created_audit:
                review_times.append((created_feedback - created_audit).total_seconds() / 60.0)
        return {
            "schema_version": "monitoring.feedback_summary.v1",
            "total_feedback": total,
            "approved_as_is_rate": _rate(decisions.get("approved_as_is", 0), total),
            "approved_with_edits_rate": _rate(decisions.get("approved_with_edits", 0), total),
            "rejected_rate": _rate(decisions.get("rejected", 0), total),
            "more_info_requested_rate": _rate(decisions.get("more_info_requested", 0), total),
            "revise_requested_rate": _rate(decisions.get("revise_requested", 0), total),
            "decision_counts": _top(decisions, 20),
            "average_review_time_minutes": _avg(review_times),
            "top_rejection_reasons": _top(reason_codes, 20),
            "top_edited_fields": _top(edited_fields, 20),
            "evidence_rating_average": _avg(evidence_ratings),
            "feedback_use_policy": "offline_evaluation_only",
            "live_retraining_allowed": False,
        }

    def _average_evidence_rating(self, feedback: list[dict[str, Any]]) -> float:
        ratings = [float(f.get("evidence_rating")) for f in feedback if isinstance(f.get("evidence_rating"), (int, float))]
        return _avg(ratings)

    def _pipeline_latency_ms(self, audit: dict[str, Any]) -> float | None:
        vals: list[float] = []
        for trace in _as_list(audit.get("stage_traces")):
            if isinstance(trace, dict) and isinstance(trace.get("duration_ms"), (int, float)):
                vals.append(float(trace["duration_ms"]))
        return round(sum(vals), 3) if vals else None

    def _stage_status(self, audit: dict[str, Any], stage_name: str) -> str | None:
        for trace in _as_list(audit.get("stage_traces")):
            if not isinstance(trace, dict):
                continue
            if str(trace.get("stage_name")) == stage_name:
                return str(trace.get("status") or "unknown")
        return None

    def _slowest_cases(self, audits: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
        rows = []
        for audit in audits:
            total = self._pipeline_latency_ms(audit)
            if total is None:
                continue
            rows.append({
                "trace_id": audit.get("trace_id"),
                "request_id": audit.get("request_id"),
                "route": _safe_get(audit, "execution_plan.route") or _safe_get(audit, "snapshot.route_recommendation"),
                "status": audit.get("status"),
                "latency_ms": total,
            })
        return sorted(rows, key=lambda x: x["latency_ms"], reverse=True)[:limit]

    def _has_post_generation_issue(self, audit: dict[str, Any], needle: str) -> bool:
        pgv = audit.get("post_generation_validation") or _safe_get(audit, "execution_plan.post_generation_validation_audit", {}) or {}
        text = json.dumps(pgv, ensure_ascii=False, sort_keys=True).lower() if isinstance(pgv, dict) else str(pgv).lower()
        return needle.lower() in text and any(word in text for word in ["fail", "error", "invalid", "unparse", "parse"])

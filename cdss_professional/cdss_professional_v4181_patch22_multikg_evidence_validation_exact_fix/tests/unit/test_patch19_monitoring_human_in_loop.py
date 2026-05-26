from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from services.monitoring.analytics import MonitoringAnalyticsService


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_monitoring_feedback_summary_and_offline_learning_policy(tmp_path: Path):
    audit_dir = tmp_path / "audit"
    feedback_dir = tmp_path / "feedback"
    _write_json(
        audit_dir / "trace-a.json",
        {
            "trace_id": "trace-a",
            "request_id": "req-a",
            "created_at": "2026-05-14T10:00:00+00:00",
            "status": "ready_for_review",
            "blocked": False,
            "snapshot": {"route_recommendation": "prescription"},
            "execution_plan": {"route": "prescription", "display_route": "draft_prescription", "allowed_to_generate": True},
            "draft_plan": {"medications": [{"active_ingredient": "paracetamol"}]},
            "proposal": {"localized_medications": [{"local_product_name": "ADOL"}]},
            "evidence": {"evidence_hits": [{"accepted_for_clinical_use": True}], "evidence_quality_summary": {"localized_product_verified": True, "evidence_confidence": "strong"}},
            "safety": {"findings": []},
            "stage_traces": [
                {"stage_name": "clinical_understanding", "status": "ok", "duration_ms": 10},
                {"stage_name": "generation", "status": "ok", "duration_ms": 20},
                {"stage_name": "retrieval", "status": "ok", "duration_ms": 30},
            ],
        },
    )
    feedback_dir.mkdir(parents=True)
    (feedback_dir / "clinician_feedback.jsonl").write_text(
        json.dumps(
            {
                "trace_id": "trace-a",
                "created_at": "2026-05-14T10:05:00+00:00",
                "decision": "approved_with_edits",
                "reason_codes": ["wrong_dose"],
                "field_edits": [{"field": "medications[0].dose", "new_value": "500 mg"}],
                "evidence_rating": 4,
                "feedback_use_policy": "offline_evaluation_only",
                "live_retraining_allowed": False,
            }
        )
        + "\n",
        encoding="utf-8",
    )

    service = MonitoringAnalyticsService(audit_dir=audit_dir, feedback_dir=feedback_dir)
    overview = service.overview()
    feedback = service.feedback()
    clinical_quality = service.clinical_quality()

    assert overview["total_cases"] == 1
    assert overview["ready_for_review_rate"] == 1.0
    assert overview["live_retraining_allowed"] is False
    assert feedback["total_feedback"] == 1
    assert feedback["approved_with_edits_rate"] == 1.0
    assert feedback["top_rejection_reasons"]["wrong_dose"] == 1
    assert feedback["top_edited_fields"]["medications[0].dose"] == 1
    assert feedback["average_review_time_minutes"] == 5.0
    assert clinical_quality["live_retraining_allowed"] is False


def test_monitoring_safety_and_retrieval_metrics(tmp_path: Path):
    audit_dir = tmp_path / "audit"
    _write_json(
        audit_dir / "trace-b.json",
        {
            "trace_id": "trace-b",
            "request_id": "req-b",
            "status": "blocked",
            "blocked": True,
            "snapshot": {"route_recommendation": "review"},
            "execution_plan": {
                "route": "review",
                "display_route": "review_blocked",
                "allowed_to_generate": False,
                "policy_hits": [{"rule_id": "NSAID_RENAL_RISK"}],
            },
            "draft_plan": {"medications": []},
            "proposal": {"localized_medications": []},
            "evidence": {
                "evidence_hits": [{"accepted_for_runtime_retrieval": True, "channel": "kg"}],
                "evidence_quality_summary": {"kg_safety_facts_count": 2, "evidence_confidence": "moderate"},
            },
            "safety": {
                "findings": [
                    {"severity": "critical", "category": "renal_safety", "message": "NSAID renal impairment", "blocked": True, "rule_id": "NSAID_RENAL_RISK"}
                ]
            },
            "stage_traces": [{"stage_name": "retrieval", "status": "ok", "duration_ms": 100}],
        },
    )
    service = MonitoringAnalyticsService(audit_dir=audit_dir, feedback_dir=tmp_path / "feedback")
    safety = service.safety()
    retrieval = service.retrieval()
    localization = service.localization()

    assert safety["renal_block_count"] == 1
    assert safety["top_policy_or_safety_rules"]["NSAID_RENAL_RISK"] >= 1
    assert retrieval["retrieval_hit_rate"] == 1.0
    assert retrieval["kg_safety_fact_count"] == 2
    assert localization["localized_case_count"] == 0


def test_monitoring_router_is_registered():
    client = TestClient(app)
    paths = {route.path for route in app.routes}
    assert "/v1/monitoring/overview" in paths
    assert "/v1/monitoring/feedback/summary" in paths
    assert "/v1/monitoring/clinical-quality" in paths

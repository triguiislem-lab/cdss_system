from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from libs.config.settings import get_settings
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, TranscriptTurn
from services.domain.contracts import BusinessInputs
from services.domain.route_decision_engine import RouteDecisionEngine
from services.feedback.repository import ClinicianFeedbackRepository


def _snapshot(text: str, *, known_allergies=None, missing=None):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="p21", age_years=34, sex="female", weight_kg=65, known_allergies=known_allergies or []),
        consultation=ConsultationInput(language="fr", doctor_notes=text, transcript=[TranscriptTurn(speaker="patient", text=text)]),
        normalized_runtime_text=text,
        missing_critical_information=missing or [],
    )


def test_allergy_polarity_no_known_allergy_does_not_forbid_low_risk_draft():
    decision = RouteDecisionEngine().decide(
        snapshot=_snapshot("Fièvre simple. No known allergy.", known_allergies=["no known allergy"]),
        inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["paracetamol"]),
    )
    assert decision.display_route == "draft_prescription"
    assert decision.allowed_to_generate is True
    assert decision.forbidden_ingredients == []
    assert decision.allergy_evidence[0].polarity == "negated"


def test_positive_penicillin_allergy_blocks_amoxicillin_target():
    decision = RouteDecisionEngine().decide(
        snapshot=_snapshot("Allergie penicilline documentée. Le médecin envisage amoxicilline.", known_allergies=["penicillin allergy"]),
        inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["amoxicillin"]),
    )
    assert decision.display_route == "review_blocked"
    assert decision.allowed_to_generate is False
    assert "amoxicillin" in decision.forbidden_ingredients
    assert "DOMAIN_TRUE_CONTRAINDICATION_BLOCKS_GENERATION" in decision.business_rule_ids


def test_unknown_allergy_status_is_missing_info_not_false_contraindication():
    decision = RouteDecisionEngine().decide(
        snapshot=_snapshot("Allergy status unknown before antibiotic."),
        inputs=BusinessInputs(candidate_route="prescription", candidate_targets=["amoxicillin"], candidate_missing=["allergy history"]),
    )
    assert decision.display_route == "missing_info"
    assert decision.allowed_to_generate is False
    assert "amoxicillin" not in decision.forbidden_ingredients
    assert "allergy history" in decision.missing_information.blocking


def test_sqlite_feedback_repository_isolated_and_recovers_corrupt_db(tmp_path: Path, monkeypatch):
    feedback_dir = tmp_path / "feedback"
    feedback_dir.mkdir()
    monkeypatch.setenv("CDSS_FEEDBACK_DIR", str(feedback_dir))
    bad_db = feedback_dir / "clinician_feedback.sqlite"
    bad_db.write_text("not a sqlite database", encoding="utf-8")

    repo = ClinicianFeedbackRepository(backend="sqlite")
    saved = repo.save({"trace_id": "trace-sqlite", "request_id": "req", "decision": "approved_as_is", "created_at": "2026-05-14T00:00:00+00:00"})

    assert saved["_storage_path"].endswith("clinician_feedback.sqlite")
    assert list(feedback_dir.glob("clinician_feedback.sqlite.*.corrupt"))
    events_path = feedback_dir / "feedback_repository_events.jsonl"
    assert "feedback_database_corrupted_detected" in events_path.read_text(encoding="utf-8")
    with sqlite3.connect(feedback_dir / "clinician_feedback.sqlite") as conn:
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("SELECT COUNT(*) FROM clinician_feedback").fetchone()[0] == 1


def test_monitoring_and_human_in_loop_endpoint_contracts(tmp_path: Path, monkeypatch):
    feedback_dir = tmp_path / "feedback"
    audit_dir = tmp_path / "audit"
    feedback_dir.mkdir()
    audit_dir.mkdir()
    monkeypatch.setenv("FEEDBACK_DIR", str(feedback_dir))
    monkeypatch.setenv("AUDIT_DIR", str(audit_dir))
    monkeypatch.setenv("FEEDBACK_BACKEND", "jsonl")
    get_settings.cache_clear()

    client = TestClient(app)
    overview = client.get("/v1/monitoring/overview")
    assert overview.status_code == 200
    for key in ["requests_total", "blocked_cases", "human_review_cases", "model_errors"]:
        assert key in overview.json()

    payload = {
        "trace_id": "trace-test-001",
        "doctor_id": "doctor-test",
        "action": "corrected",
        "original_draft": {"drug": "paracetamol"},
        "corrected_draft": {"drug": "ibuprofen"},
        "reason": "clinical correction",
    }
    posted = client.post("/v1/feedback/clinician", json=payload)
    assert posted.status_code in (200, 201)

    summary = client.get("/v1/monitoring/feedback/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_feedback"] >= 1
    assert body["approved_with_edits_rate"] == 1.0

    paths = {route.path for route in app.routes}
    assert "/v1/monitoring/performance" in paths
    assert "/v1/monitoring/safety" in paths
    assert "/v1/audit/traces/{trace_id}" in paths
    assert "/v1/feedback/clinician" in paths

    get_settings.cache_clear()

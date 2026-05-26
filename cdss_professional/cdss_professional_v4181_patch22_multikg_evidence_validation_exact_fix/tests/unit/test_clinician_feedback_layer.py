from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from tools.build_feedback_dataset import build_feedback_datasets

client = TestClient(app)


def _draft_payload(request_id: str = "req-feedback-1") -> dict:
    return {
        "request_id": request_id,
        "patient": {
            "patient_id": "patient-feedback-1",
            "age_years": 35,
            "sex": "female",
            "pregnant": False,
            "known_allergies": [],
            "current_medications": [],
            "chronic_conditions": [],
        },
        "consultation": {
            "language": "fr",
            "doctor_notes": "Médecin recommande Doliprane 500 mg pour fièvre légère.",
            "transcript": [],
        },
    }


def _final_plan(dose: str = "500 mg") -> dict:
    return {
        "problem_summary": "Fièvre légère",
        "medications": [
            {
                "active_ingredient": "paracetamol",
                "indication": "fever",
                "dose": dose,
                "frequency": "every 8 hours if needed",
                "duration": "2 days",
                "route": "oral",
                "rationale": "Clinician-corrected draft",
                "supporting_evidence": [],
                "safety_considerations": ["avoid duplicate paracetamol"],
            }
        ],
        "non_drug_recommendations": ["hydration"],
        "monitoring": ["temperature"],
        "unresolved_questions": [],
        "generation_notes": [],
        "triage_recommendation": "clinician_review",
        "confidence": 0.8,
    }


def test_unified_feedback_endpoint_stores_approved_with_edits() -> None:
    draft = client.post("/v1/prescriptions/draft", json=_draft_payload("req-feedback-edit")).json()
    trace_id = draft["trace_id"]
    response = client.post(
        f"/v1/prescriptions/{trace_id}/feedback",
        json={
            "clinician_id": "dr_123",
            "decision": "approved_with_edits",
            "final_plan": _final_plan("500 mg"),
            "reason_codes": ["wrong_dose", "bad_local_product"],
            "field_edits": [
                {
                    "field": "medications[0].dose",
                    "old_value": "1 g",
                    "new_value": "500 mg",
                    "reason": "dose too high for this context",
                    "reason_code": "wrong_dose",
                }
            ],
            "clinician_notes": "Corrected dose before validation.",
            "safety_override": False,
            "evidence_rating": 4,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    event = body["event"]
    assert event["trace_id"] == trace_id
    assert event["decision"] == "approved_with_edits"
    assert event["doctor_final_validation_required"] is True
    assert event["feedback_use_policy"] == "offline_evaluation_only"
    assert event["live_retraining_allowed"] is False
    assert event["draft_hash"]
    assert event["final_plan_hash"]
    assert event["field_edits"][0]["field"] == "medications[0].dose"
    assert event["learning_signal"]["edited"] is True
    assert event["patient_id_hash"] != "patient-feedback-1"


def test_rejected_feedback_requires_reason_codes() -> None:
    draft = client.post("/v1/prescriptions/draft", json=_draft_payload("req-feedback-reject")).json()
    trace_id = draft["trace_id"]
    response = client.post(
        f"/v1/prescriptions/{trace_id}/feedback",
        json={"clinician_id": "dr_123", "decision": "rejected"},
    )
    assert response.status_code == 422


def test_feedback_dataset_builder_creates_offline_splits(tmp_path: Path) -> None:
    input_path = tmp_path / "clinician_feedback.jsonl"
    rows = [
        {"trace_id": "t1", "decision": "approved_as_is", "reason_codes": [], "field_edits": [], "inferred_field_edits": [], "draft_route": "prescription"},
        {"trace_id": "t2", "decision": "approved_with_edits", "reason_codes": ["wrong_dose"], "field_edits": [{"field": "medications[0].dose"}], "inferred_field_edits": [], "draft_route": "prescription"},
        {"trace_id": "t3", "decision": "rejected", "reason_codes": ["unsafe_medication"], "field_edits": [], "inferred_field_edits": [], "draft_route": "review"},
        {"trace_id": "t4", "decision": "revise_requested", "reason_codes": ["missing_patient_info"], "field_edits": [], "inferred_field_edits": [], "draft_route": "review"},
    ]
    input_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
    summary = build_feedback_datasets(input_path, tmp_path / "datasets")
    assert summary["total_feedback_events"] == 4
    assert summary["edit_rate"] == 0.25
    assert summary["rejection_rate"] == 0.25
    assert (tmp_path / "datasets" / "approved_cases.jsonl").exists()
    assert (tmp_path / "datasets" / "edited_cases.jsonl").exists()
    assert (tmp_path / "feedback_summary.json").exists()
    assert (tmp_path / "error_taxonomy.md").exists()

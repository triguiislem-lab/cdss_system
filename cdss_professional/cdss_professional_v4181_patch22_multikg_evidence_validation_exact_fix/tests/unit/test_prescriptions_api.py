from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def _draft_payload() -> dict:
    return {
        "request_id": "req-api-1",
        "patient": {
            "patient_id": "p1",
            "age_years": 31,
            "sex": "female",
            "pregnant": False,
            "known_allergies": [],
            "current_medications": [],
            "chronic_conditions": [],
        },
        "consultation": {
            "language": "fr",
            "doctor_notes": "Suspected upper respiratory infection.",
            "transcript": [{"speaker": "patient", "text": "J'ai mal à la gorge et de la fièvre."}],
        },
    }


def test_draft_endpoint_returns_pipeline_result() -> None:
    response = client.post("/v1/prescriptions/draft", json=_draft_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == "req-api-1"
    assert body["status"] in {"blocked", "ready_for_review"}
    assert "blocked" in body

    trace_id = body["trace_id"]
    audit_response = client.get(f"/v1/prescriptions/audit/{trace_id}")
    assert audit_response.status_code == 200
    assert audit_response.json()["trace_id"] == trace_id


def test_validate_endpoint_returns_safety_report() -> None:
    response = client.post(
        "/v1/prescriptions/validate",
        json={
            "patient": {"patient_id": "p2", "age_years": 29, "sex": "female", "pregnant": True},
            "plan": {
                "problem_summary": "Pain management",
                "medications": [
                    {
                        "active_ingredient": "ibuprofen",
                        "indication": "pain",
                        "dose": "400 mg",
                        "frequency": "every 8 hours",
                        "duration": "3 days",
                        "route": "oral",
                    }
                ],
                "non_drug_recommendations": [],
                "monitoring": [],
                "unresolved_questions": [],
                "generation_notes": [],
                "triage_recommendation": "clinician_review",
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "findings" in body

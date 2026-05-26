from fastapi.testclient import TestClient

from apps.api.main import app


def test_openapi_contains_professional_cdss_endpoints():
    client = TestClient(app)
    schema = client.get('/openapi.json').json()
    paths = schema['paths']
    expected = {
        '/health',
        '/v1/system/status',
        '/v1/system/model-cache',
        '/v1/prescriptions/draft',
        '/v1/prescriptions/analyze',
        '/v1/prescriptions/evidence',
        '/v1/prescriptions/validate',
        '/v1/prescriptions/localize',
        '/v1/prescriptions/formulary/search',
        '/v1/prescriptions/kg/search',
        '/v1/prescriptions/{trace_id}/feedback',
    }
    assert expected.issubset(paths.keys())


def test_runtime_status_endpoint_does_not_force_model_load():
    client = TestClient(app)
    response = client.get('/v1/system/status')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert 'qwen_model_cache' in payload


def test_consultation_request_accepts_frontend_aliases():
    from apps.api.schemas import ConsultationRequest

    payload = {
        "requestId": "req-frontend",
        "patient": {
            "id": "p1",
            "age": 30,
            "sex": "F",
            "weightKg": 60,
            "allergies": ["penicillin"],
            "currentMedications": ["warfarin"],
            "chronicConditions": ["asthma"],
            "pregnancyStatus": "not_pregnant",
        },
        "consultation": {
            "doctorNotes": "Prescrire cetirizine si pas de contre-indication.",
            "transcript": [
                {"speaker": "medecin", "message": "On peut proposer un antihistaminique."}
            ],
        },
    }

    parsed = ConsultationRequest.model_validate(payload)
    assert parsed.request_id == "req-frontend"
    assert parsed.patient.patient_id == "p1"
    assert parsed.patient.age_years == 30
    assert parsed.patient.sex == "female"
    assert parsed.patient.weight_kg == 60
    assert parsed.patient.known_allergies == ["penicillin"]
    assert parsed.patient.current_medications == ["warfarin"]
    assert parsed.patient.chronic_conditions == ["asthma"]
    assert parsed.patient.pregnancy_status == "not_pregnant"
    assert parsed.consultation.doctor_notes.startswith("Prescrire")
    assert parsed.consultation.transcript[0].speaker == "doctor"
    assert parsed.consultation.transcript[0].text.startswith("On peut proposer")


def test_medication_draft_accepts_frontend_aliases():
    from libs.contracts.prescription import MedicationDraft, TherapeuticPlan

    medication = MedicationDraft.model_validate({
        "drug": "cetirizine",
        "reason": "rhinite allergique",
        "dosage": "10 mg",
        "freq": "une fois par jour",
        "durationText": "5 jours",
        "voie": "orale",
        "warnings": "somnolence",
    })
    assert medication.active_ingredient == "cetirizine"
    assert medication.indication == "rhinite allergique"
    assert medication.dose == "10 mg"
    assert medication.frequency == "une fois par jour"
    assert medication.duration == "5 jours"
    assert medication.route == "orale"
    assert medication.safety_considerations == ["somnolence"]

    plan = TherapeuticPlan.model_validate({
        "problemSummary": "rhinite allergique",
        "medications": [{
            "activeIngredient": "cetirizine",
            "indication": "allergy",
            "doseText": "10 mg",
            "frequencyText": "daily",
            "durationText": "5 days",
        }],
        "nonDrugRecommendations": "lavage nasal",
        "triageRecommendation": "clinician_review",
    })
    assert plan.problem_summary == "rhinite allergique"
    assert plan.medications[0].active_ingredient == "cetirizine"
    assert plan.non_drug_recommendations == ["lavage nasal"]

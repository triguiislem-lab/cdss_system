from __future__ import annotations

import json
from pathlib import Path

from apps.api.container import get_pipeline
from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile


def main() -> None:
    example = Path("examples/request_demo.json")
    if example.exists():
        payload = json.loads(example.read_text(encoding="utf-8"))
        request_id = payload.get("request_id", "demo-request")
        patient = PatientProfile.model_validate(payload.get("patient") or {"patient_id": "demo-patient"})
        consultation = ConsultationInput.model_validate(payload.get("consultation") or {"doctor_notes": payload.get("text") or payload.get("raw_text") or "Patient with fever."})
    else:
        request_id = "demo-request"
        patient = PatientProfile(patient_id="demo-patient", age_years=35, sex="unknown")
        consultation = ConsultationInput(doctor_notes="Patient adulte avec fièvre, toux et douleurs diffuses. Pas d'allergie connue.")

    command = DraftPrescriptionCommand(request_id=request_id, patient=patient, consultation=consultation)
    result = get_pipeline().run(command)
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()

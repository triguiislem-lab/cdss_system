from __future__ import annotations
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile, TranscriptTurn
from services.orchestration.pipeline import PrescriptionPipeline


def run_case(case_id: str, text: str, *, age: int = 30, weight: float | None = 65):
    config = RuntimePipelineConfig(
        safety_policy_mode="enforce",
        medical_order_extraction_mode="audit",
        clinical_action_enabled=True,
        post_generation_validator_mode="audit",
    )
    pipeline = PrescriptionPipeline(config=config)
    return pipeline.draft(
        DraftPrescriptionCommand(
            request_id=case_id,
            patient=PatientProfile(patient_id=case_id, age_years=age, sex="female", weight_kg=weight),
            consultation=ConsultationInput(language="fr", transcript=[TranscriptTurn(speaker="patient", text=text)]),
        )
    )


def main():
    failures = []
    rows = []

    fever = run_case("simple_fever", "Fievre depuis 2 jours, not pregnant, no allergy.")
    rows.append({"case_id": "simple_fever", "route": fever.execution_plan.route, "policy_audit": fever.execution_plan.policy_audit})
    if fever.execution_plan.route != "prescription":
        failures.append("simple fever should remain prescription")

    abx = run_case("viral_amoxicillin_request", "Viral sore throat and cough. Patient asks for amoxicillin.")
    rows.append({"case_id": "viral_amoxicillin_request", "route": abx.execution_plan.route, "block_reason": abx.execution_plan.block_reason, "medical_order_audit": abx.execution_plan.medical_order_audit, "clinical_action": abx.clinical_action.model_dump(mode="json") if abx.clinical_action else None})
    if "amoxicillin" not in abx.execution_plan.medical_order_audit.get("requested_medications", []):
        failures.append("amoxicillin request was not detected before planning")
    if abx.execution_plan.route != "review":
        failures.append("viral amoxicillin request should route to review in enforce mode")
    if abx.execution_plan.block_reason != "antibiotic_stewardship_viral_request":
        failures.append("viral amoxicillin request should be blocked by antibiotic stewardship policy")

    overuse = run_case("doliprane_overuse", "Fever persists. Patient already took Doliprane several times today.")
    rows.append({"case_id": "doliprane_overuse", "route": overuse.execution_plan.route, "block_reason": overuse.execution_plan.block_reason, "medical_order_audit": overuse.execution_plan.medical_order_audit})
    if "paracetamol" not in overuse.execution_plan.medical_order_audit.get("already_taken_medications", []):
        failures.append("already-taken paracetamol/Doliprane was not detected before planning")
    if overuse.execution_plan.route != "review":
        failures.append("paracetamol overuse/current use concern should route to review")

    report = {"ok": not failures, "failures": failures, "rows": rows}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

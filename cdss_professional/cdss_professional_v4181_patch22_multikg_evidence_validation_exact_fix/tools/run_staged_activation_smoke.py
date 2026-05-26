from __future__ import annotations

import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.order_extraction.service import MedicalOrderExtractionService
from services.orchestration.action_builder import ClinicalActionBuilder
from services.planning.execution_planner import ExecutionPlanner
from services.retrieval.multilingual_stack import MultilingualRetrievalStack
from services.safety.post_generation_validator import PostGenerationSafetyValidator


def snapshot(text: str, route: str = "prescription"):
    return PatientSnapshot(
        patient=PatientProfile(patient_id="smoke", age_years=30, sex="female", pregnant=False),
        consultation=ConsultationInput(doctor_notes=text),
        normalized_runtime_text=text,
        route_recommendation=route,
    )


def check(condition: bool, name: str, detail=None):
    if not condition:
        raise AssertionError(f"{name}: {detail}")


def main() -> int:
    results = []
    c = RuntimePipelineConfig()
    check(c.safety_policy_mode == "audit", "default safety policy mode", c.safety_policy_mode)
    check(c.clinical_action_enabled is False, "clinical action default", c.clinical_action_enabled)
    check(c.medical_order_extraction_mode == "off", "medical order default", c.medical_order_extraction_mode)
    check(c.post_generation_validator_mode == "off", "post validator default", c.post_generation_validator_mode)
    results.append("activation defaults ok")

    oe = MedicalOrderExtractionService()
    req = oe.extract(ConsultationInput(doctor_notes="Patient requests amoxicillin for viral sore throat."))
    check("amoxicillin" in req.requested_medications, "amoxicillin request detected", req.model_dump())
    taken = oe.extract(ConsultationInput(doctor_notes="Patient already took paracetamol today."))
    check("paracetamol" in taken.already_taken_medications, "paracetamol already taken detected", taken.model_dump())
    results.append("medical order extraction ok")

    snap = snapshot("Pregnant patient with fever needs review.", route="review")
    plan = ExecutionPlanner(policy_mode="audit").plan(snap)
    action = ClinicalActionBuilder().build(snap, plan)
    check(action.allowed_to_generate_prescription is False, "review action blocks generation", action.model_dump())
    results.append("clinical action builder ok")

    risky = snapshot("Patient on warfarin asks for ibuprofen.")
    risky_plan = ExecutionPlanner(policy_mode="audit").plan(risky)
    med_plan = TherapeuticPlan(
        problem_summary="test",
        medications=[MedicationDraft(active_ingredient="ibuprofen", indication="pain", dose="200 mg", frequency="once", duration="1 day")],
    )
    out_plan, validation = PostGenerationSafetyValidator().validate(risky, med_plan, risky_plan, mode="audit")
    check(bool(out_plan.medications), "audit mode does not mutate plan", out_plan.model_dump())
    check(validation.safe is False and validation.removed_medications, "post validator detects unsafe med", validation.model_dump())
    results.append("post-generation validator audit ok")

    ml = MultilingualRetrievalStack()
    status = ml.validate_offline_assets()
    check(status["offline_safe"] is True and status["enabled"] is False, "multilingual default offline-safe", status)
    results.append("multilingual scaffold ok")

    report = {"ok": True, "checks": results}
    Path("staged_activation_smoke_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

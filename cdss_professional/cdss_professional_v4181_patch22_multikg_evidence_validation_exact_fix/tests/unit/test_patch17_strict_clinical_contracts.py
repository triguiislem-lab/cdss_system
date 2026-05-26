import json
import os

import pytest
from pydantic import ValidationError

from libs.contracts.clinical_runtime import PrescriptionDraftV1
from libs.contracts.evidence import EvidenceBundle, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.config.settings import AppSettings
from services.generation.output_parser import OutputParser
from services.generation.prompt_builder import PromptBuilder
from services.generation.prescription_generator import PrescriptionGenerator
from services.safety.post_generation_validator import PostGenerationSafetyValidator
from libs.contracts.execution import ExecutionPlan
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan


def test_prescription_draft_v1_rejects_blocked_medications():
    with pytest.raises(ValidationError):
        PrescriptionDraftV1.model_validate(
            {
                "schema_version": "PrescriptionDraftV1",
                "problem_summary": "unsafe",
                "triage": "review_blocked",
                "medications": [
                    {
                        "active_ingredient": "amoxicillin",
                        "indication": "patient request",
                        "dose": "500 mg",
                        "frequency": "three times daily",
                        "duration": "5 days",
                        "route": "oral",
                    }
                ],
                "clinician_review_required": True,
                "confidence": 0.4,
            }
        )


def test_output_parser_accepts_strict_prescription_draft_v1():
    raw = json.dumps(
        {
            "schema_version": "PrescriptionDraftV1",
            "problem_summary": "Low-risk fever",
            "triage": "draft_prescription",
            "medications": [
                {
                    "active_ingredient": "paracetamol",
                    "indication": "fever",
                    "dose": "500 mg",
                    "frequency": "every 8 hours if needed",
                    "duration": "3 days",
                    "route": "oral",
                    "rationale": "controlled target",
                    "evidence_ids": ["ev1"],
                    "safety_considerations": ["avoid duplicate paracetamol"],
                }
            ],
            "non_drug_recommendations": ["hydrate"],
            "monitoring": ["review if worse"],
            "missing_questions": [],
            "evidence_ids": ["ev1"],
            "clinician_review_required": True,
            "confidence": 0.8,
        }
    )
    plan = OutputParser().parse(raw)
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].dose == "500 mg"
    assert plan.triage_recommendation == "outpatient_follow_up"
    assert any("PrescriptionDraftV1" in n for n in plan.generation_notes)


def test_invalid_strict_json_fails_closed_and_does_not_merge_compact_fallback():
    raw = """
{"schema_version":"PrescriptionDraftV1","problem_summary":"bad","triage":"draft_prescription","medications":[{"active_ingredient":"paracetamol","indication":"fever","dose":"unspecified","frequency":"unspecified","duration":"unspecified","route":"oral"}],"clinician_review_required":true,"confidence":0.7}
medication: paracetamol | fever | 500 mg | every 8 hours | 3 days | oral | should not merge
"""
    plan = OutputParser().parse(raw)
    assert plan.medications == []
    assert plan.triage_recommendation == "clinician_review"
    assert any("strict_json_validation_failed" in n for n in plan.generation_notes)


def test_prompt_builder_contains_real_json_schema_not_compact_contract():
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p17", age_years=30, sex="female"),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever"],
        risk_flags=RiskFlags(),
    )
    evidence = EvidenceBundle(local_products=[LocalProductEvidence(product_name="ADOL", active_ingredient="paracetamol", strength="500 mg", dosage_form="tablet", score=0.9)])
    prompt = PromptBuilder().build(snapshot, evidence)
    assert "PrescriptionDraftV1" in prompt
    assert '"schema_version"' in prompt
    assert "medication: <" not in prompt
    assert "No compact text" in PromptBuilder().system_prompt


def test_clinical_env_rejects_validator_off_without_explicit_escape(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("POST_GENERATION_VALIDATOR_MODE", "off")
    monkeypatch.setenv("SAFETY_POLICY_MODE", "enforce")
    monkeypatch.setenv("MEDICAL_ORDER_EXTRACTION_MODE", "enforce")
    monkeypatch.delenv("ALLOW_UNSAFE_VALIDATOR_OFF", raising=False)
    with pytest.raises(ValueError):
        AppSettings()


def test_post_generation_validator_enforce_removes_forbidden_medication():
    plan = TherapeuticPlan(
        problem_summary="test",
        medications=[MedicationDraft(active_ingredient="ibuprofen", indication="pain", dose="400 mg", frequency="every 8 hours", duration="3 days")],
        triage_recommendation="outpatient_follow_up",
    )
    execution_plan = ExecutionPlan(
        route="prescription",
        allowed_to_generate=True,
        display_route="draft_prescription",
        sub_route="draft_prescription",
        target_ingredients=["paracetamol"],
        forbidden_ingredients=["ibuprofen"],
        required_modules=[],
        planner_reason="test",
    )
    snapshot = PatientSnapshot(patient=PatientProfile(patient_id="p", age_years=40), consultation=ConsultationInput())
    new_plan, result = PostGenerationSafetyValidator().validate(snapshot, plan, execution_plan, mode="enforce")
    assert new_plan.medications == []
    assert result.safe is False
    assert result.removed_medications[0].active_ingredient == "ibuprofen"

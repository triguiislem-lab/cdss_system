from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile, TranscriptTurn
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.generation.service import GenerationService
from services.orchestration.pipeline import PrescriptionPipeline


class BlockingGenerationService(GenerationService):
    def draft(self, snapshot, evidence):
        return TherapeuticPlan(
            problem_summary="Acute pain",
            medications=[
                MedicationDraft(
                    active_ingredient="ibuprofen",
                    indication="pain",
                    dose="400 mg",
                    frequency="every 8 hours",
                    duration="3 days",
                    route="oral",
                )
            ],
            triage_recommendation="clinician_review",
            generation_notes=["forced blocking stub for orchestration test"],
        )


def test_pipeline_produces_reviewable_result() -> None:
    pipeline = PrescriptionPipeline()
    result = pipeline.draft(
        DraftPrescriptionCommand(
            request_id="req-1",
            patient=PatientProfile(patient_id="p1", age_years=30, sex="female"),
            consultation=ConsultationInput(
                language="fr",
                transcript=[TranscriptTurn(speaker="patient", text="J'ai mal à la gorge et de la fièvre")],
            ),
        )
    )

    assert result.request_id == "req-1"
    assert result.status in {"blocked", "ready_for_review"}
    assert result.stage_traces
    assert result.proposal.plan.problem_summary
    stage_names = [trace.stage_name.value for trace in result.stage_traces]
    assert "clinical_understanding" in stage_names
    assert "medical_order_extraction" in stage_names
    assert "safety_policy" in stage_names
    assert "execution_planning" in stage_names
    assert stage_names.index("clinical_understanding") < stage_names.index("safety_policy")
    assert stage_names.index("medical_order_extraction") < stage_names.index("safety_policy")
    assert stage_names.index("safety_policy") < stage_names.index("execution_planning")


def test_pipeline_skips_localization_when_blocked() -> None:
    pipeline = PrescriptionPipeline(generation=BlockingGenerationService())
    result = pipeline.draft(
        DraftPrescriptionCommand(
            request_id="req-2",
            patient=PatientProfile(patient_id="p2", age_years=28, sex="female", known_allergies=["nsaid"]),
            consultation=ConsultationInput(
                language="fr",
                transcript=[TranscriptTurn(speaker="patient", text="I have pain")],
            ),
        )
    )

    assert result.blocked is True
    assert result.localization_skipped_reason is not None
    assert result.proposal.localized_medications == []
    assert any(trace.stage_name.value == "localization" and trace.status == "skipped" for trace in result.stage_traces)

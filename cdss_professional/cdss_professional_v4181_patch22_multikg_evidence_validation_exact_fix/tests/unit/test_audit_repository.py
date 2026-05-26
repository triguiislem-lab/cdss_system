from pathlib import Path

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.execution import PipelineExecutionRecord
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from libs.contracts.prescription import PrescriptionProposal, TherapeuticPlan
from libs.contracts.safety import SafetyReport
from services.audit.repository import FileAuditRepository


def test_file_audit_repository_persists_records(tmp_path: Path) -> None:
    repo = FileAuditRepository(tmp_path / "audit")
    record = PipelineExecutionRecord(
        request_id="req-audit-1",
        snapshot=PatientSnapshot(patient=PatientProfile(patient_id="p1"), consultation=ConsultationInput()),
        evidence=EvidenceBundle(),
        draft_plan=TherapeuticPlan(problem_summary="summary"),
        safety=SafetyReport(),
        proposal=PrescriptionProposal(plan=TherapeuticPlan(problem_summary="summary")),
        trace_id="trace-audit-1",
    )

    repo.save(record)
    loaded = repo.get("trace-audit-1")

    assert loaded is not None
    assert loaded.trace_id == record.trace_id
    assert (tmp_path / "audit" / "trace-audit-1.json").exists()

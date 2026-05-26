import json

from libs.contracts.patient import ConsultationInput, PatientProfile, TranscriptTurn
from libs.governance import DeploymentGovernanceService
from services.clinical_understanding.service import ClinicalUnderstandingService


def test_multilingual_parser_and_router_handle_emergency_case() -> None:
    service = ClinicalUnderstandingService()
    snapshot = service.build_snapshot(
        PatientProfile(patient_id="p1", age_years=34, sex="female"),
        ConsultationInput(
            language="fr",
            transcript=[
                TranscriptTurn(speaker="patient", text="douleur thoracique avec dyspnée depuis 1 jour"),
                TranscriptTurn(speaker="doctor", text="suspicion de stemi"),
            ],
        ),
    )
    assert "chest pain" in snapshot.normalized_symptoms
    assert snapshot.route_recommendation == "emergency"


def test_multilingual_parser_routes_non_pharma_for_myopia() -> None:
    service = ClinicalUnderstandingService()
    snapshot = service.build_snapshot(
        PatientProfile(patient_id="p2", age_years=18, sex="male"),
        ConsultationInput(
            language="fr",
            transcript=[TranscriptTurn(speaker="patient", text="myopie avec vision floue sans douleur")],
        ),
    )
    assert snapshot.route_recommendation == "non_pharma"


def test_governance_service_blocks_without_approvals(tmp_path) -> None:
    runtime = tmp_path / "data" / "runtime"
    runtime.mkdir(parents=True)
    (runtime / "tn_master_kg_edges.csv").write_text("disease,route\nasthme,prescription\n", encoding="utf-8")
    (runtime / "tn_master_vs_corpus.jsonl").write_text('{"text":"asthma evidence"}\n', encoding="utf-8")
    (runtime / "tn_master_amm_catalog.csv").write_text("dci,product_name\nparacetamol,Doliprane\n", encoding="utf-8")

    manifest = tmp_path / "data" / "governance" / "deployment_approval_manifest.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(
        json.dumps(
            {
                "required_approvals": {
                    "clinical_validation_signed": False,
                    "safety_validation_signed": False,
                    "benchmark_validation_signed": True,
                    "data_governance_signed": True,
                },
                "minimum_runtime_asset_counts": {"kg_rows": 1, "vs_passages": 1, "amm_rows": 1},
            }
        ),
        encoding="utf-8",
    )

    svc = DeploymentGovernanceService(project_root=tmp_path, manifest_path=manifest)
    report = svc.validate()
    assert report.ok is False
    assert any("Missing deployment approvals" in issue for issue in report.issues)


def test_governance_service_passes_with_approvals_and_assets(tmp_path) -> None:
    runtime = tmp_path / "data" / "runtime"
    runtime.mkdir(parents=True)
    (runtime / "tn_master_kg_edges.csv").write_text("disease,route\nasthme,prescription\n", encoding="utf-8")
    (runtime / "tn_master_vs_corpus.jsonl").write_text('{"text":"asthma evidence"}\n', encoding="utf-8")
    (runtime / "tn_master_amm_catalog.csv").write_text("dci,product_name\nparacetamol,Doliprane\n", encoding="utf-8")

    manifest = tmp_path / "data" / "governance" / "deployment_approval_manifest.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(
        json.dumps(
            {
                "required_approvals": {
                    "clinical_validation_signed": True,
                    "safety_validation_signed": True,
                    "benchmark_validation_signed": True,
                    "data_governance_signed": True,
                },
                "minimum_runtime_asset_counts": {"kg_rows": 1, "vs_passages": 1, "amm_rows": 1},
            }
        ),
        encoding="utf-8",
    )

    svc = DeploymentGovernanceService(project_root=tmp_path, manifest_path=manifest)
    report = svc.validate()
    assert report.ok is True
    assert report.asset_counts["kg_rows"] == 1

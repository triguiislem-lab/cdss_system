from __future__ import annotations

import zipfile
from pathlib import Path

from libs.config.settings import AppSettings
from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.patient import ConsultationInput, PatientProfile
from services.normalization.dci_normalizer import canonicalize_dci
from services.orchestration.pipeline import PrescriptionPipeline
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from libs.contracts.patient import PatientSnapshot


def _plan(text: str, symptoms: list[str] | None = None):
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p11", age_years=35, sex="female"),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_runtime_text=text,
        normalized_symptoms=symptoms or [],
        route_recommendation="prescription",
    )
    orders = MedicalOrderExtractionService().extract(snapshot)
    return orders, ExecutionPlanner(policy_mode="audit").plan(snapshot, medical_orders=orders)


def test_patch11_canonicalizes_dci_variants_and_typos():
    assert canonicalize_dci("ibuprofène") == "ibuprofen"
    assert canonicalize_dci("ibuprofenee") == "ibuprofen"
    assert canonicalize_dci("amoxicilline") == "amoxicillin"
    assert canonicalize_dci("cétirizine") == "cetirizine"


def test_patch11_antibiotic_confirmed_bacterial_is_review_draft_allowed_in_pipeline():
    result = PrescriptionPipeline(config=RuntimePipelineConfig.clinical_safe_test()).draft(
        DraftPrescriptionCommand(
            request_id="patch11-abx",
            patient=PatientProfile(patient_id="p-abx", age_years=28, sex="female", known_allergies=[]),
            consultation=ConsultationInput(
                language="fr",
                doctor_notes="Pas d allergie. Médecin prescrit AMOXAL 500 mg pour angine bactérienne confirmée.",
            ),
        )
    )
    plan = result.execution_plan
    assert plan is not None
    assert plan.route == "review"
    assert plan.sub_route == "review_draft_allowed"
    assert plan.allowed_to_generate is True
    assert plan.target_ingredients == ["amoxicillin"]


def test_patch11_viral_antibiotic_request_remains_blocked():
    _, plan = _plan("Rhume viral avec toux. Patient demande amoxicilline.", ["cough", "sore_throat"])
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert "amoxicillin" in plan.forbidden_ingredients


def test_patch11_nsaid_requires_complete_negative_screens_and_does_not_add_paracetamol():
    _, incomplete = _plan("Médecin prescrit Brufen 400 mg pour douleur.", ["pain"])
    assert incomplete.route == "review"
    assert incomplete.allowed_to_generate is False
    assert incomplete.sub_route != "review_draft_allowed"
    assert incomplete.target_ingredients == []

    _, complete = _plan(
        "Patient sans anticoagulant, pas enceinte, pas d ulcère, fonction rénale normale. Médecin prescrit Brufen 400 mg pour douleur.",
        ["pain"],
    )
    assert complete.route == "review"
    assert complete.sub_route == "review_draft_allowed"
    assert complete.allowed_to_generate is True
    assert complete.target_ingredients == ["ibuprofen"]
    assert "paracetamol" not in complete.target_ingredients


def test_patch11_unknown_dci_without_profile_is_not_direct_prescription():
    _, plan = _plan("Fer 80 mg prescrit pour anémie ferriprive.", [])
    assert plan.route == "review"
    assert plan.allowed_to_generate is False
    assert any("safety_profile_for_iron" == item for item in plan.missing_critical_information)


def test_patch11_clinical_eval_settings_enable_qwen_shadow():
    settings = AppSettings(_env_file=".env.clinical_eval")
    assert settings.clinical_llm_extraction_enabled is True
    assert settings.clinical_llm_extraction_mode == "shadow"
    assert settings.feedback_backend == "sqlite"
    assert settings.allow_stub_fallbacks is False


def test_patch11_release_package_excludes_feedback_sqlite(tmp_path):
    from tools.package_release import package

    root = Path.cwd()
    # Simulate a feedback SQLite DB in the working tree.
    db = root / "data" / "feedback" / "clinician_feedback.sqlite"
    db.parent.mkdir(parents=True, exist_ok=True)
    db.write_bytes(b"sqlite-test")
    out = tmp_path / "release.zip"
    package(root, out)
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
    assert not any(name.endswith("data/feedback/clinician_feedback.sqlite") for name in names)

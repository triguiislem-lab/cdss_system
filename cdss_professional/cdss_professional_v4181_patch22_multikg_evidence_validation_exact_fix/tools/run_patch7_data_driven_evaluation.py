from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from libs.utils.medical_text import normalize_search_text
from services.order_extraction.service import MedicalOrderExtractionService
from services.planning.execution_planner import ExecutionPlanner
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever

RUNTIME_DIR = ROOT_DIR / "data" / "runtime"
REPORT_DIR = ROOT_DIR / "reports"


def snapshot(text: str, symptoms: list[str] | None = None) -> PatientSnapshot:
    return PatientSnapshot(
        patient=PatientProfile(patient_id="eval", age_years=30, sex="female", weight_kg=65),
        consultation=ConsultationInput(language="fr", doctor_notes=text),
        normalized_symptoms=symptoms or [],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text=normalize_search_text(text),
        route_recommendation="prescription",
    )


GOLD_CASES = [
    {"id": "viral_uri_amoxicillin", "text": "Rhume viral, toux, mal de gorge, demande amoxicilline.", "symptoms": ["cough"], "expected_route": "review", "forbidden_contains": ["amoxicillin"]},
    {"id": "antalgique_authorized", "text": "Médecin recommande un antalgique.", "symptoms": [], "expected_route": "prescription", "targets": ["paracetamol"]},
    {"id": "antalgique_plain", "text": "Antalgique?", "symptoms": [], "expected_route": "review", "targets": []},
    {"id": "amm_brand_amoxal", "text": "Médecin prescrit AMOXAL 500 mg pour infection documentée.", "symptoms": [], "expected_route": "review", "targets": []},
    {"id": "allergic_rhinitis", "text": "Rhinorrhea et éternuement saisonnier, médecin recommande antihistaminique.", "symptoms": [], "expected_route": "prescription", "targets": ["cetirizine"]},
    {"id": "uti_review", "text": "Brûlure mictionnelle et pollakiurie, demande antibiotique.", "symptoms": [], "expected_route": "review", "targets": []},
    {"id": "hypertension_review", "text": "Patient demande un antihypertenseur pour hypertension.", "symptoms": [], "expected_route": "review", "targets": []},
]


def evaluate_cases() -> list[dict[str, Any]]:
    extractor = MedicalOrderExtractionService()
    planner = ExecutionPlanner(policy_mode="off")
    results = []
    for case in GOLD_CASES:
        snap = snapshot(case["text"], case.get("symptoms") or [])
        orders = extractor.extract(snap)
        plan = planner.plan(snap, medical_orders=orders)
        targets = list(plan.target_ingredients or [])
        forbidden = list(plan.forbidden_ingredients or [])
        passed = plan.route == case["expected_route"]
        if "targets" in case:
            passed = passed and targets == case["targets"]
        for item in case.get("forbidden_contains", []):
            passed = passed and item in forbidden
        results.append({
            "id": case["id"],
            "passed": passed,
            "expected_route": case["expected_route"],
            "actual_route": plan.route,
            "expected_targets": case.get("targets"),
            "actual_targets": targets,
            "forbidden_ingredients": forbidden,
            "case_type": orders.case_type,
            "extraction_conflicts": orders.extraction_conflicts,
        })
    return results


def asset_checks() -> dict[str, Any]:
    alias_count = sum(1 for _ in (RUNTIME_DIR / "tn_medication_aliases.csv").open(encoding="utf-8")) - 1
    class_map_count = sum(1 for _ in (RUNTIME_DIR / "tn_class_to_dci_map.csv").open(encoding="utf-8")) - 1
    safety_count = sum(1 for _ in (RUNTIME_DIR / "tn_dci_safety_profiles.csv").open(encoding="utf-8")) - 1
    corpus_count = sum(1 for _ in (RUNTIME_DIR / "tn_prescription_evidence_corpus.jsonl").open(encoding="utf-8"))
    vector = VectorIndexClient(backend="final_release_jsonl", corpus_path=RUNTIME_DIR / "tn_prescription_evidence_corpus.jsonl")
    chunks = vector.similarity_search("paracetamol 500 mg fever dosage contraindication", top_k=5, filters={"accepted_for_runtime_retrieval": "true"})
    local = LocalFormularyRetriever(client=LocalFormularyClient(backend="csv", catalog_path=RUNTIME_DIR / "tn_master_amm_catalog.csv"))
    products = local.retrieve("paracetamol 500 mg oral Tunisia mono ingredient local formulary", limit=5)
    return {
        "alias_count": alias_count,
        "class_to_dci_rows": class_map_count,
        "dci_safety_profiles": safety_count,
        "prescription_evidence_corpus_rows": corpus_count,
        "vector_paracetamol_hits": len(chunks),
        "local_paracetamol_hits": len(products),
        "top_local_product": products[0].model_dump(mode="json") if products else None,
    }


def main() -> None:
    case_results = evaluate_cases()
    passed = sum(1 for item in case_results if item["passed"])
    report = {
        "suite": "patch7_data_driven_evaluation",
        "passed": passed,
        "total": len(case_results),
        "pass_rate": round(passed / max(1, len(case_results)), 3),
        "cases": case_results,
        "assets": asset_checks(),
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORT_DIR / "patch7_data_driven_evaluation.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if passed != len(case_results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

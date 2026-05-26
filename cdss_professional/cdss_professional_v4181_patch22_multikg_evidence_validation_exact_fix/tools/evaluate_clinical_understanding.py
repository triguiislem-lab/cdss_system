from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.contracts.patient import ConsultationInput, PatientProfile, TranscriptTurn
from services.clinical_understanding.service import ClinicalUnderstandingService


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


def _f1(pred: set[str], gold: set[str]) -> tuple[float, float, float]:
    tp = len(pred & gold)
    precision = _safe_div(tp, len(pred))
    recall = _safe_div(tp, len(gold))
    f1 = _safe_div(2 * precision * recall, precision + recall)
    return precision, recall, f1


def _macro_route_f1(pred_routes: list[str], gold_routes: list[str]) -> tuple[float, float]:
    labels = sorted(set(pred_routes) | set(gold_routes))
    f1s: list[float] = []
    acc = 0
    for label in labels:
        tp = sum(p == label and g == label for p, g in zip(pred_routes, gold_routes))
        fp = sum(p == label and g != label for p, g in zip(pred_routes, gold_routes))
        fn = sum(p != label and g == label for p, g in zip(pred_routes, gold_routes))
        precision = _safe_div(tp, tp + fp)
        recall = _safe_div(tp, tp + fn)
        f1s.append(_safe_div(2 * precision * recall, precision + recall))
    for p, g in zip(pred_routes, gold_routes):
        if p == g:
            acc += 1
    return _safe_div(acc, len(gold_routes)), mean(f1s) if f1s else 0.0


def _recall_for_label(pred_routes: list[str], gold_routes: list[str], label: str) -> float:
    gold_count = sum(g == label for g in gold_routes)
    hit = sum(p == label and g == label for p, g in zip(pred_routes, gold_routes))
    return _safe_div(hit, gold_count)


def _case_to_inputs(case: dict) -> tuple[PatientProfile, ConsultationInput]:
    patient_data = case.get("patient", {}) or {}
    patient = PatientProfile(
        patient_id=str(patient_data.get("patient_id") or case.get("case_id") or "case"),
        age_years=patient_data.get("age_years"),
        sex=patient_data.get("sex", "unknown"),
        pregnant=patient_data.get("pregnant"),
        breastfeeding=patient_data.get("breastfeeding"),
        renal_impairment=bool(patient_data.get("renal_impairment", False)),
        hepatic_impairment=bool(patient_data.get("hepatic_impairment", False)),
        known_allergies=list(patient_data.get("known_allergies", []) or []),
        current_medications=list(patient_data.get("current_medications", []) or []),
        chronic_conditions=list(patient_data.get("chronic_conditions", []) or []),
    )
    text = case.get("text") or case.get("doctor_notes") or ""
    turns = [TranscriptTurn(speaker="patient", text=text)] if text else []
    for turn in case.get("transcript", []) or []:
        turns.append(TranscriptTurn(speaker=turn.get("speaker", "patient"), text=turn.get("text", "")))
    consultation = ConsultationInput(language=case.get("language", "fr"), doctor_notes=case.get("doctor_notes"), transcript=turns)
    return patient, consultation


def evaluate(cases: list[dict]) -> dict:
    service = ClinicalUnderstandingService()
    entity_f1s: list[float] = []
    symptom_f1s: list[float] = []
    condition_f1s: list[float] = []
    pred_routes: list[str] = []
    gold_routes: list[str] = []
    rows: list[dict] = []
    for case in cases:
        patient, consultation = _case_to_inputs(case)
        snapshot = service.build_snapshot(patient, consultation)
        gold_symptoms = set(case.get("expected_symptoms", []) or [])
        gold_conditions = set(case.get("expected_conditions", []) or case.get("expected_disease_tags", []) or [])
        gold_route = case.get("expected_route") or case.get("expected_final_state") or "prescription"
        pred_symptoms = set(snapshot.normalized_symptoms)
        pred_conditions = set(snapshot.disease_tags or snapshot.suspected_conditions)
        _, _, sym_f1 = _f1(pred_symptoms, gold_symptoms)
        _, _, cond_f1 = _f1(pred_conditions, gold_conditions)
        combined_pred = pred_symptoms | pred_conditions
        combined_gold = gold_symptoms | gold_conditions
        _, _, ent_f1 = _f1(combined_pred, combined_gold)
        symptom_f1s.append(sym_f1)
        condition_f1s.append(cond_f1)
        entity_f1s.append(ent_f1)
        pred_routes.append(snapshot.route_recommendation)
        gold_routes.append(str(gold_route))
        rows.append({
            "case_id": case.get("case_id"),
            "predicted_route": snapshot.route_recommendation,
            "expected_route": gold_route,
            "predicted_symptoms": sorted(pred_symptoms),
            "expected_symptoms": sorted(gold_symptoms),
            "predicted_conditions": sorted(pred_conditions),
            "expected_conditions": sorted(gold_conditions),
            "missing_critical_information": snapshot.missing_critical_information,
            "parser_quality": snapshot.extracted_context.get("parser_quality", {}),
        })
    route_accuracy, route_macro_f1 = _macro_route_f1(pred_routes, gold_routes)
    metrics = {
        "case_count": len(cases),
        "entity_macro_f1": mean(entity_f1s) if entity_f1s else 0.0,
        "symptom_macro_f1": mean(symptom_f1s) if symptom_f1s else 0.0,
        "condition_macro_f1": mean(condition_f1s) if condition_f1s else 0.0,
        "route_accuracy": route_accuracy,
        "route_macro_f1": route_macro_f1,
        "emergency_recall": _recall_for_label(pred_routes, gold_routes, "emergency"),
        "review_recall": _recall_for_label(pred_routes, gold_routes, "review"),
    }
    return {"metrics": metrics, "confusion": dict(Counter(f"{g}->{p}" for g, p in zip(gold_routes, pred_routes))), "cases": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the clinical-understanding layer on labeled cases.")
    parser.add_argument("--cases", required=True, help="JSON file containing a list of labeled cases.")
    parser.add_argument("--output", required=True, help="Output JSON report path.")
    args = parser.parse_args()
    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if isinstance(cases, dict):
        cases = cases.get("cases", [])
    report = evaluate(cases)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["metrics"], indent=2))


if __name__ == "__main__":
    main()

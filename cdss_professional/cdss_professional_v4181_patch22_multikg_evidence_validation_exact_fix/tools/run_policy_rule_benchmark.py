from __future__ import annotations
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from libs.contracts.patient import PatientProfile, ConsultationInput, PatientSnapshot, RiskFlags
from services.safety.policy_engine import SafetyPolicyEngine

def make_snapshot(text, age=30, weight=70):
    return PatientSnapshot(patient=PatientProfile(patient_id="policy_eval", age_years=age, sex="female", weight_kg=weight), consultation=ConsultationInput(language="mixed", doctor_notes=text), normalized_symptoms=[], suspected_conditions=[], disease_tags=[], missing_critical_information=[], risk_flags=RiskFlags(), normalized_runtime_text=text, route_recommendation="prescription")
def main():
    engine=SafetyPolicyEngine(); rows=[]
    positives=json.loads(Path("examples/evaluation/policy_rule_positive_cases.json").read_text(encoding="utf-8")); negatives=json.loads(Path("examples/evaluation/policy_rule_negative_controls.json").read_text(encoding="utf-8"))
    for case in positives:
        dec=engine.evaluate(make_snapshot(case["text"])); hit_ids=[h.rule_id for h in dec.policy_hits]
        rows.append({"case_id":case["case_id"],"type":"positive","hit_ids":hit_ids,"route_override":dec.route_override,"passed":case["expected_rule_id"] in hit_ids and dec.route_override==case["expected_route"]})
    for case in negatives:
        dec=engine.evaluate(make_snapshot(case["text"])); hit_ids=[h.rule_id for h in dec.policy_hits]
        rows.append({"case_id":case["case_id"],"type":"negative","hit_ids":hit_ids,"route_override":dec.route_override,"passed":not any(r in hit_ids for r in case["must_not_trigger"])})
    metrics={"case_count":len(rows),"pass_rate":round(sum(1 for r in rows if r["passed"])/len(rows),4),"failure_count":sum(1 for r in rows if not r["passed"]),"failure_map":[r for r in rows if not r["passed"]]}
    Path("policy_rule_benchmark_results.json").write_text(json.dumps({"metrics":metrics,"rows":rows},indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(metrics,indent=2,ensure_ascii=False)); return metrics
if __name__=="__main__": main()
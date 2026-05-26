from __future__ import annotations
import argparse, json
from pathlib import Path
from libs.contracts.evidence import EvidenceBundle
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.localization.service import LocalizationService
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--cases", type=Path, default=Path("examples/evaluation/localization_cases.json"))
    parser.add_argument("--output", type=Path, default=Path("localization_quality_metrics.json"))
    args=parser.parse_args()
    data=json.loads(args.cases.read_text(encoding="utf-8"))
    retriever=LocalFormularyRetriever(); localizer=LocalizationService(use_direct_lookup=True); rows=[]
    for case in data.get("cases",[]):
        query=f"{case['active_ingredient']} {case.get('dose','')} {case.get('route','')} Tunisia mono ingredient local formulary"
        products=retriever.retrieve(query, limit=25)
        med=MedicationDraft(active_ingredient=case["active_ingredient"], indication=case.get("indication","benchmark"), dose=case.get("dose","unspecified"), frequency="benchmark", duration="benchmark", route=case.get("route","oral"))
        loc=localizer.localize(TherapeuticPlan(problem_summary="localization benchmark", medications=[med]), EvidenceBundle(local_products=products))
        names=[x.local_product_name for x in loc]; blob=" ".join(names).lower()
        row={"case_id":case["case_id"],"retrieved_products":[p.model_dump(mode="json") for p in products[:8]],"selected":names,"include_hit":any(n.lower() in blob for n in case.get("must_include_any",[])),"forbidden_selected":any(n.lower() in blob for n in case.get("must_exclude_any",[])),"wrong_form_selected":any(f.lower() in blob for f in case.get("must_exclude_form",[])),"rejected_count":sum(len(x.rejected_candidates or []) for x in loc),"localized":[x.model_dump(mode="json") for x in loc]}
        rows.append(row); print(row)
    metrics={"case_count":len(rows),"must_include_hit_rate":rate(rows,"include_hit"),"forbidden_product_violation_rate":rate(rows,"forbidden_selected"),"wrong_form_violation_rate":rate(rows,"wrong_form_selected"),"rejected_candidate_explanation_rate":rate(rows, lambda r:r.get("rejected_count",0)>0)}
    args.output.write_text(json.dumps({"metrics":metrics,"rows":rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
def rate(rows, key):
    if not rows: return 0
    if callable(key): return round(sum(1 for r in rows if key(r))/len(rows),4)
    return round(sum(1 for r in rows if r.get(key))/len(rows),4)
if __name__=="__main__": main()

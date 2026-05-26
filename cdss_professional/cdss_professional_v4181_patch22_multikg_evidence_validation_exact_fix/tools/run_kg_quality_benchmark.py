from __future__ import annotations
import argparse, json
from pathlib import Path
from libs.contracts.evidence import RetrievalQuery
from services.retrieval.kg_retriever import KGRetriever

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", type=Path, default=Path("examples/evaluation/kg_quality_cases.json"))
    parser.add_argument("--output", type=Path, default=Path("kg_quality_metrics.json"))
    args = parser.parse_args()
    data = json.loads(args.cases.read_text(encoding="utf-8"))
    rows=[]; retriever=KGRetriever()
    for case in data.get("cases", []):
        facts = list(retriever.retrieve(RetrievalQuery(source="kg", text=case["query"], limit=10)) or [])
        triples = [(f.subject.lower(), f.predicate.lower(), f.object.lower()) for f in facts]
        expected = case.get("expected_triples_any") or []
        triple_hit = any(any(s.lower() in a and p.lower() in b and o.lower() in c for a,b,c in triples) for s,p,o in expected) if expected else False
        top1 = False
        if facts and expected:
            top=(facts[0].subject.lower(), facts[0].predicate.lower(), facts[0].object.lower())
            top1 = any(s.lower() in top[0] and p.lower() in top[1] and o.lower() in top[2] for s,p,o in expected)
        stub=sum(1 for f in facts if "stub" in str(f.provenance or "").lower())
        irrelevant=sum(1 for f in facts if _irrelevant(case, f))
        backed=sum(1 for f in facts if f.provenance and "stub" not in str(f.provenance).lower())
        row={"case_id":case["case_id"],"triple_hit":triple_hit,"top1_triple_hit":top1,"stub_fact_count":stub,"irrelevant_fact_count":irrelevant,"source_backed_fact_count":backed,"fact_count":len(facts),"facts":[f.model_dump(mode="json") for f in facts[:10]]}
        rows.append(row); print(row)
    total=max(1,sum(r["fact_count"] for r in rows))
    metrics={"case_count":len(rows),"expected_triple_hit_rate":rate(rows,"triple_hit"),"expected_top1_triple_hit_rate":rate(rows,"top1_triple_hit"),"stub_fact_rate":round(sum(r["stub_fact_count"] for r in rows)/total,4),"irrelevant_fact_rate":round(sum(r["irrelevant_fact_count"] for r in rows)/total,4),"source_backed_fact_rate":round(sum(r["source_backed_fact_count"] for r in rows)/total,4)}
    args.output.write_text(json.dumps({"metrics":metrics,"rows":rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
def _irrelevant(case, fact):
    q=str(case.get("query","")).lower(); obj=str(fact.object or "").lower(); prov=str(fact.provenance or "").lower()
    return ("pregnancy" in obj and "preg" not in q and "grossesse" not in q) or ("kg_stub" in prov and "pregnancy" in obj)
def rate(rows,key): return round(sum(1 for r in rows if r.get(key))/len(rows),4) if rows else 0
if __name__=="__main__": main()

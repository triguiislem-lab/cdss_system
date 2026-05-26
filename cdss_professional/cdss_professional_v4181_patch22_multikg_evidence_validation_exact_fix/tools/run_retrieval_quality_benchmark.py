from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from pathlib import Path

# Offline-safe benchmark: force-disable reranker even if notebook profile set full.
os.environ["RERANK_ENABLED"] = "false"

from libs.contracts.evidence import RetrievalPlan, RetrievalQuery
from services.retrieval.evidence_quality import EvidenceQualityBuilder
from services.retrieval.hybrid_retriever import HybridRetriever


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", type=Path, default=Path("examples/evaluation/retrieval_gold_cases.json"))
    parser.add_argument("--output", type=Path, default=Path("retrieval_quality_metrics.json"))
    args = parser.parse_args()

    data = json.loads(args.cases.read_text(encoding="utf-8"))
    rows = []
    retriever = HybridRetriever()
    quality_builder = EvidenceQualityBuilder()

    for case in data.get("cases", []):
        started = time.perf_counter()
        expected_ai = case.get("expected_active_ingredient")
        target_ingredients = [expected_ai] if expected_ai else []
        plan = RetrievalPlan(
            primary_terms=[expected_ai or "", case.get("query", "")],
            expected_active_ingredient=expected_ai,
            expected_active_ingredients=target_ingredients,
            queries=[
                RetrievalQuery(source="local_formulary", text=case["query"], limit=5, filters={"active_ingredient": expected_ai or ""}),
                RetrievalQuery(source="kg", text=case["query"], limit=5, filters={"active_ingredient": expected_ai or ""}),
                RetrievalQuery(source="vector", text=case["query"], limit=5, filters={"active_ingredient": expected_ai or "", "accepted_for_runtime_retrieval": "true"}),
            ],
        )
        bundle = retriever.retrieve_from_plan(plan, target_ingredients=target_ingredients)
        # Force rebuild so benchmark always sees V4 EvidenceHit/EvidenceQualitySummary
        # even if a retriever/fuser implementation returned legacy evidence only.
        bundle = quality_builder.build(bundle, expected_active_ingredient=expected_ai)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        hits = bundle.evidence_hits
        top_sources = [hit.source_system for hit in hits[:5]]
        top_sections = [hit.section_kind for hit in hits[:5]]
        top_ingredients = [hit.active_ingredient for hit in hits[:5]]
        expected_sections = {str(x).lower() for x in case.get("expected_section_kinds_any", [])}
        forbidden_sources = {str(x).lower() for x in case.get("forbidden_sources", [])}

        row = {
            "case_id": case["case_id"],
            "latency_ms": elapsed_ms,
            "ingredient_hit_at_5": any(expected_ai and expected_ai.lower() in str(x or "").lower() for x in top_ingredients),
            "section_hit_at_5": any(str(x or "").lower() in expected_sections for x in top_sections),
            "forbidden_source_found": any(str(x or "").lower() in forbidden_sources for x in top_sources),
            "accepted_only_top5": all(hit.accepted_for_runtime_retrieval is not False for hit in hits[:5]),
            "expected_active_ingredient_for_scoring": bundle.retrieval_diagnostics.get("expected_active_ingredient_for_scoring"),
            "rerank_enabled": os.environ.get("RERANK_ENABLED"),
            "top_sources": top_sources,
            "top_sections": top_sections,
            "top_ingredients": top_ingredients,
            "evidence_quality_summary": bundle.evidence_quality_summary.model_dump(mode="json"),
            "retrieval_diagnostics": bundle.retrieval_diagnostics,
        }
        rows.append(row)
        print(row)

    metrics = {
        "case_count": len(rows),
        "ingredient_recall_at_5": rate(rows, "ingredient_hit_at_5"),
        "section_recall_at_5": rate(rows, "section_hit_at_5"),
        "accepted_only_rate": rate(rows, "accepted_only_top5"),
        "forbidden_source_rate": rate(rows, "forbidden_source_found"),
        "latency_avg_ms": round(statistics.mean([row["latency_ms"] for row in rows]), 2) if rows else 0,
        "rerank_forced_disabled": os.environ.get("RERANK_ENABLED") == "false",
    }
    args.output.write_text(json.dumps({"metrics": metrics, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


def rate(rows, key):
    return round(sum(1 for row in rows if row.get(key)) / len(rows), 4) if rows else 0


if __name__ == "__main__":
    main()

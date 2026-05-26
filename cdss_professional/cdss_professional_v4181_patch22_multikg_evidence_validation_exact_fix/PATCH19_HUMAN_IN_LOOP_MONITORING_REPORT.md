# Patch19 — Human-in-the-Loop Monitoring and Clinical Quality Analytics

## Purpose

Patch19 makes the clinician-in-the-loop layer measurable and official. It adds read-only monitoring endpoints that aggregate audit records and structured clinician feedback, without changing runtime clinical behavior or enabling live learning.

Core rule:

```text
Doctor feedback is used for supervised offline improvement, not live autonomous learning.
```

## Why this patch exists

The CDSS already supports draft generation, analysis, evidence inspection, validation, audit review packets, and structured clinician feedback. The missing product layer was performance monitoring: measuring whether the system is safe, useful, accepted by clinicians, evidence-grounded, localized correctly, and improving under supervised governance.

## New API router

Added:

```text
apps/api/routers/monitoring.py
```

Registered in:

```text
apps/api/main.py
```

New endpoints:

```text
GET /v1/monitoring/overview
GET /v1/monitoring/pipeline
GET /v1/monitoring/model
GET /v1/monitoring/safety
GET /v1/monitoring/feedback
GET /v1/monitoring/feedback/summary
GET /v1/monitoring/retrieval
GET /v1/monitoring/localization
GET /v1/monitoring/clinical-quality
```

## New monitoring service

Added:

```text
services/monitoring/analytics.py
services/monitoring/__init__.py
```

The service reads:

```text
data/audit/*.json
data/feedback/clinician_feedback.jsonl
```

It can also read SQLite feedback if JSONL is not present.

## Metrics exposed

### Product / overview

- total_cases
- ready_for_review_rate
- blocked_rate
- emergency_route_rate
- review_route_rate
- route_counts
- display_route_counts
- average_pipeline_latency_ms
- pipeline_latency_p50_ms
- pipeline_latency_p95_ms
- generation_failure_rate
- json_parse_failure_rate
- empty_plan_rate

### Pipeline

- stage_status_counts
- stage_error_counts
- stage_latency_ms by stage
- slowest_cases

### Model / Qwen

- llm_used_rate
- llm_extraction_acceptance_rate
- llm_skipped_rate
- llm_low_confidence_rate
- llm_static_conflict_rate
- generation_model_used_rate
- fallback_generation_rate
- unparseable_output_rate
- llm_status_counts

### Safety

- allergy_block_count
- pregnancy_block_count
- renal_block_count
- hepatic_block_count
- ddi_block_count
- dose_guardrail_count
- emergency_detected_count
- unsafe_generation_removed_count
- safety_finding_counts_by_category
- blocking_finding_counts_by_category
- top_policy_or_safety_rules

### Feedback / clinician-in-the-loop

- total_feedback
- approved_as_is_rate
- approved_with_edits_rate
- rejected_rate
- more_info_requested_rate
- revise_requested_rate
- average_review_time_minutes
- top_rejection_reasons
- top_edited_fields
- evidence_rating_average

### Retrieval / evidence

- retrieval_attempted_rate
- retrieval_hit_rate
- accepted_evidence_count
- fallback_evidence_count
- fallback_evidence_rate
- local_product_match_rate
- kg_safety_fact_count
- evidence_confidence_counts
- evidence_rating_average_from_doctors

### Localization

- localization_required_rate
- local_product_match_rate
- localized_case_count
- rejected_localization_candidate_count
- top_local_products
- top_localization_skip_reasons

### Clinical quality

- decision_counts_by_route
- feedback_summary
- quality_gate_notes
- live_retraining_allowed=false

## Governance invariant

All monitoring responses explicitly preserve the invariant:

```json
{
  "feedback_use_policy": "offline_evaluation_only",
  "live_retraining_allowed": false
}
```

Patch19 does not implement live learning. It only helps clinicians and developers identify which rules, prompts, retrieval assets, localization data, datasets, or models should be improved offline and then promoted through evaluation and governance.

## Validation

Executed:

```text
python -m compileall -q apps libs services tests tools
pytest -q tests/unit/test_patch19_monitoring_human_in_loop.py tests/unit/test_patch18_business_logic_core.py tests/unit/test_patch17_strict_clinical_contracts.py tests/unit/test_prescriptions_api.py
```

Result:

```text
17 passed
```

## Next recommended step

Use this router in the Kaggle evaluation notebook after Patch18/Patch19 runs. After each benchmark or doctor-review pilot, export:

```text
/v1/monitoring/overview
/v1/monitoring/safety
/v1/monitoring/feedback/summary
/v1/monitoring/retrieval
/v1/monitoring/localization
/v1/monitoring/clinical-quality
```

These outputs become the governance evidence pack for deciding whether a patch can move from dev to clinical evaluation, staging, or production.

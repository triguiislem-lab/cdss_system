# Deployment validation evidence notes

This project separates implementation completeness from clinical deployment readiness.

The clinical-understanding layer should be validated as a clinical information-extraction problem, not as a generic text-classification task. The recommended evaluation set should include entity extraction, negation, uncertainty, route classification, and red-flag recall.

Deployment mode is intentionally blocked until:

1. clinician/pharmacist approvals are signed in `data/governance/deployment_approval_manifest.json`;
2. the clinical-understanding validation report meets the configured thresholds;
3. the safety validation report meets the configured thresholds;
4. the final benchmark report meets the configured thresholds;
5. runtime assets pass row-count and schema checks.

The default manifest makes these requirements explicit through `required_validation_reports`.

## Clinical-understanding report

Create:

`data/governance/clinical_understanding_validation_report.json`

with:

- `metrics.entity_macro_f1`
- `metrics.route_macro_f1`
- `metrics.emergency_recall`
- `metrics.review_recall`

Use:

```bash
python tools/evaluate_clinical_understanding.py \
  --cases path/to/labeled_cases.json \
  --output data/governance/clinical_understanding_validation_report.json
```

## Safety report

Create:

`data/governance/safety_validation_report.json`

with:

- `metrics.blocking_safety_recall`
- `metrics.false_safe_rate_inverted`

`false_safe_rate_inverted` means `1 - false_safe_rate`, so higher is safer.

## Final benchmark report

Create:

`data/governance/final_benchmark_report.json`

with:

- `metrics.final_state_accuracy`
- `metrics.localization_topk_accuracy`

## Why this exists

The code can be correct but still not clinically deployable. The governance gate prevents clinical mode unless measured evidence and sign-off are present.

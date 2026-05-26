# Clinical-understanding validation runbook

Clinical deployment should not rely on parser unit tests only. Build a labeled case set from real or clinician-written Tunisia consultations and score the extraction layer before enabling clinical mode.

## Required labeled fields

Each case should include:

- `text` or `transcript`
- `patient`
- `expected_symptoms`
- `expected_conditions` or `expected_disease_tags`
- `expected_route` in `prescription`, `review`, `emergency`, `non_pharma`

## Run

```bash
python tools/evaluate_clinical_understanding.py \
  --cases examples/validation/clinical_understanding_cases_template.json \
  --output data/governance/clinical_understanding_validation_report.json
```

## Deployment thresholds

The default deployment manifest requires:

- `metrics.entity_macro_f1 >= 0.85`
- `metrics.route_macro_f1 >= 0.90`
- `metrics.emergency_recall >= 0.98`
- `metrics.review_recall >= 0.90`

These thresholds are intentionally conservative because routing failures in emergency and review cases create direct safety risk.

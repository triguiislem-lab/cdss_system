# Clinician feedback learning layer

All generated prescriptions are physician-review drafts. A clinician must validate the final prescription before use.

Feedback is stored for offline evaluation and governed improvement only. It must not trigger live automatic retraining.

## Decisions

- `approved_as_is`: positive signal; useful for acceptance rates and high-confidence pattern analysis, not proof the draft is universally correct.
- `approved_with_edits`: highest-value learning signal. Store final corrected plan, field edits, and reasons.
- `rejected`: negative signal. Requires reason codes.
- `revise_requested` / `more_info_requested`: incomplete decision. Do not treat as final acceptance or rejection.

## API

`POST /v1/prescriptions/{trace_id}/feedback`

The event stores trace ID, model/runtime/evidence versions, patient hash, draft/final hashes, field-level edits, reason codes, and the policy `offline_evaluation_only`.

## Offline datasets

Run:

```bash
python tools/build_feedback_dataset.py
```

Outputs:

- `data/feedback/datasets/approved_cases.jsonl`
- `data/feedback/datasets/edited_cases.jsonl`
- `data/feedback/datasets/rejected_cases.jsonl`
- `data/feedback/datasets/incomplete_cases.jsonl`
- `data/feedback/feedback_summary.json`
- `data/feedback/error_taxonomy.md`

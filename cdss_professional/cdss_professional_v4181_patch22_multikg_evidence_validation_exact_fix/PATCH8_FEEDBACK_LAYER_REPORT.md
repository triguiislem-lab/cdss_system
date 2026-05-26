# Patch 8 — Clinician feedback learning layer

## Purpose

Patch 8 adds a unified human-in-the-loop feedback layer for the doctor-review workflow. Generated prescriptions remain drafts and always require physician validation before use.

Feedback is stored for offline evaluation and governed improvement only. It is not used for live automatic retraining.

## Added

- `POST /v1/prescriptions/{trace_id}/feedback`
- `libs/contracts/feedback.py`
- `services/feedback/repository.py`
- `tools/build_feedback_dataset.py`
- `docs/runbooks/clinician_feedback_learning_layer.md`
- `tests/unit/test_clinician_feedback_layer.py`

## Feedback decisions

- `approved_as_is`
- `approved_with_edits`
- `rejected`
- `revise_requested`
- `more_info_requested`

Rejected feedback requires at least one reason code. Approved-with-edits requires a final plan and/or field-level edits.

## Stored metadata

Each feedback event stores:

- `trace_id`
- `request_id`
- hashed patient ID
- model version
- runtime config version
- evidence version
- draft hash
- final plan hash when available
- clinician decision
- reason codes
- field edits
- inferred field differences between draft and final plan
- `doctor_final_validation_required = true`
- `feedback_use_policy = offline_evaluation_only`
- `live_retraining_allowed = false`

## Offline analytics

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

Metrics include approval rate, edit rate, rejection rate, incomplete-decision rate, blocked-but-approved rate, wrong-dose frequency, bad-localization frequency, missing-evidence frequency, and safety-miss frequency.

## Config update

Patch 8 also aligns packaged environment files with Patch 7 data-driven retrieval:

```bash
VECTOR_CORPUS_PATH=data/runtime/tn_prescription_evidence_corpus.jsonl
FEEDBACK_DIR=data/feedback
```

## Validation

- `123 passed, 1 skipped`
- `compileall` OK
- smoke scripts OK
- professional validation suite OK
- Patch 7 data-driven evaluation OK

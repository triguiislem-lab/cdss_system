# Patch14 - MEDIQA-OE style Qwen structured extraction

This patch changes the role of Qwen from mostly Level-1 clinical extraction / generation to a dedicated structured medical-order and clinical-event extraction layer.

## Main change

A new component was added:

- `services/order_extraction/llm_mediqa_oe_extractor.py`
- `QwenMediqaOeExtractor`

It uses a MEDIQA-OE style prompt with:

- role + extraction-only constraints;
- strict JSON output;
- medication events separate from true doctor orders;
- explicit `status` fields:
  - `doctor_ordered`
  - `doctor_authorized`
  - `patient_requested_not_authorized`
  - `already_taken`
  - `not_currently_taking`
  - `historical`
  - `negated_or_avoid`
  - `mentioned_only`
- `source` fields: doctor / patient / record / unknown;
- `reason` grounded in dialogue;
- `provenance_turns` using bracketed turn IDs;
- exclusions/self-checks for patient requests, already-taken medications, historical mentions, and negation.

## Pipeline position

The new layer runs inside `MedicalOrderExtractionService` before safety policy and planning:

```text
clinical_understanding
-> local structured extraction
-> Qwen MEDIQA-OE extraction for complex cases
-> reconciliation/merge
-> safety_policy
-> execution_planner
-> retrieval/generation only if allowed
```

Qwen is used for language understanding, not for final safety decisions.

## Selective policy

Qwen MEDIQA-OE extraction is called selectively when the consultation includes fragile contexts:

- medication mentions;
- patient requests;
- already-taken medication;
- negation / avoid;
- allergies;
- pregnancy;
- children / infants;
- Arabizi / franco-Arabic cues;
- antibiotics / NSAIDs / opioids / paracetamol.

It can also be forced with:

```env
MEDICAL_ORDER_LLM_EXTRACTION_POLICY=always
```

## Runtime flags

Added environment flags:

```env
MEDICAL_ORDER_LLM_EXTRACTION_ENABLED=true
MEDICAL_ORDER_LLM_EXTRACTION_MODE=assist
MEDICAL_ORDER_LLM_EXTRACTION_POLICY=selective
MEDICAL_ORDER_LLM_EXTRACTION_TEMPERATURE=0.0
MEDICAL_ORDER_LLM_EXTRACTION_MAX_OUTPUT_TOKENS=1800
MEDICAL_ORDER_LLM_EXTRACTION_CONFIDENCE_THRESHOLD=0.60
```

If enabled, Qwen uses the same shared model cache as generation, so it should not load a second Qwen model in the same process.

## Files changed

- `services/order_extraction/llm_mediqa_oe_extractor.py` added
- `services/order_extraction/service.py` modified
- `apps/api/container.py` modified
- `libs/config/settings.py` modified
- `.env*` files updated with MEDIQA-OE extraction flags
- `tests/unit/test_mediqa_oe_qwen_order_extraction.py` added

## Validation

Executed:

```bash
python -m compileall apps libs services tests
pytest -q tests/unit/test_patch13_benchmark_logic_hardening.py tests/unit/test_mediqa_oe_qwen_order_extraction.py tests/unit/test_prescriptions_api.py
```

Result:

```text
8 passed
```

## Expected benchmark impact

The main expected improvements are:

- better distinction between patient request and doctor order;
- better extraction of already-taken medication events;
- better Arabizi/franco-Arabic medication event understanding;
- richer provenance and audit trail;
- fewer false-safe `/analyze` routes caused by static parser confidence;
- better policy triggers for paracetamol overuse, antibiotics requested by patient, codeine in children, and negated/avoid medications.

The deterministic safety policy and planner remain responsible for blocking, review, emergency routing, and generation authorization.

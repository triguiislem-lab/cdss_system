# Patch17 — Strict Clinical Contracts, Prompt Separation and Runtime Safety Hardening

## Goal

Patch16 improved benchmark behavior, but the runtime still had several clinical-grade engineering risks:

- generation prompt claimed JSON while still allowing compact text lines;
- Level-1 and MEDIQA-OE extraction prompts were not formalized as separated prompt assets;
- internal LLM output contracts were not represented as strict Pydantic models;
- optional PatientProfile fields were too thin for renal, pregnancy, vitals and pediatric risk reasoning;
- post-generation validation could still be disabled by environment in clinical-like deployment;
- mojibake/encoding defects needed a CI-friendly audit tool.

Patch17 hardens the system around a central rule: **LLMs extract or draft, but deterministic policy/planner/validator decide safety.**

## Scientific design reference

MEDIQA-OE frames the problem as schema-aware extraction of actionable medical orders from doctor-patient dialogues. The shared task requires extracting a JSON list of orders with description, order type, reason and provenance, and explicitly excludes old treatments that are not renewed. The paper also reports that top systems used detailed instructions, JSON-constrained decoding or schema-aware few-shot prompting; Qwen3 32B performed competitively in a two-shot setup. Patch17 keeps this pattern: Qwen is used for structured extraction/drafting, while deterministic validators enforce safety.

## Implemented changes

### 1. Strict Pydantic contracts

Added `libs/contracts/clinical_runtime.py` with these formal contracts:

- `ClinicalFactsV1`
- `MedicalOrdersV1`
- `PatientRiskContextV1`
- `ExecutionPlanV1`
- `EvidenceBundleV1`
- `PrescriptionDraftV1`
- `SafetyValidationV1`
- `ClinicianReviewV1`
- `AuditEventV1`

`PrescriptionDraftV1` is strict (`extra='forbid'`) and fails closed for blocked/non-pharma/emergency/missing-info drafts that contain medications.

### 2. Real JSON generation contract

Replaced the legacy compact text contract in `services/generation/prompt_builder.py` with a real JSON schema generated from `PrescriptionDraftV1.model_json_schema()`.

The new prompt requires:

- JSON object only;
- no markdown;
- no compact `medication: ... | ...` lines;
- explicit fields for active ingredient, dose, frequency, duration and route;
- empty `medications` for `review_blocked`, `emergency`, `non_pharma`, and `missing_info`.

### 3. Strict JSON parsing with fail-closed behavior

`services/generation/output_parser.py` now detects `schema_version='PrescriptionDraftV1'` and validates with Pydantic.

If validation fails, it returns a clinician-review plan with no medications and does **not** merge compact fallback lines. This prevents invalid JSON plus legacy text from sneaking an unsafe medication into the draft.

Legacy compact parsing remains for old heuristic fallback paths that do not declare `PrescriptionDraftV1`.

### 4. Prompt separation

Added dedicated prompt files:

- `services/prompts/level1_extraction_system.txt`
- `services/prompts/medical_order_extraction_system.txt`
- `services/prompts/evidence_grounded_generation_system.txt`
- `services/prompts/post_generation_validation_system.txt`
- `services/prompts/clinician_review_summary_system.txt`

`LLMRouter.generate_structured_text()` now accepts `system_prompt_override`, so generation can inject the evidence-grounded generation system prompt separately from user content.

### 5. Enriched PatientProfile

`libs/contracts/patient.py` now supports optional structured risk context fields:

- `egfr`, `creatinine_value`, `creatinine_unit`, `creatinine_date`;
- `pregnancy_status`, `gestational_age_weeks`, `pregnancy_uncertain`;
- `temperature_c`, `systolic_bp`, `diastolic_bp`, `spo2`, `heart_rate`, `respiratory_rate`;
- `pain_score`, `symptom_severity`;
- `pediatric_weight_source`, `structured_history`.

Backward compatibility is preserved (`extra='ignore'`). `age_months` is still derived from fractional infant `age_years`, and `egfr < 60` marks renal impairment.

### 6. Runtime safety-mode guard

`libs/config/settings.py` now rejects unsafe modes in clinical-like environments unless explicitly escaped:

- `POST_GENERATION_VALIDATOR_MODE` must be `enforce`;
- `SAFETY_POLICY_MODE` must be `enforce`;
- `MEDICAL_ORDER_EXTRACTION_MODE` must be `enforce`.

Clinical-like environments are `prod`, `production`, `staging`, `clinical`, `clinical_eval`, or `CLINICAL_DEPLOYMENT_MODE=true`.

Escape hatch for local development only:

```env
ALLOW_UNSAFE_VALIDATOR_OFF=true
```

### 7. Mojibake/encoding audit

Added `tools/audit_mojibake.py`, a CI-friendly checker for common mojibake markers in source/config files. Current source audit result: `finding_count=0` outside documented allowlist files.

### 8. ExecutionPlan context carried into generation prompt

`services/orchestration/pipeline.py` now copies the final route/display route, `allowed_to_generate`, target ingredients, forbidden ingredients and required data into snapshot context before generation. This makes the generation prompt aware of final deterministic planning rather than stale pre-planner routing.

## Validation run

Targeted tests:

```text
pytest -q tests/unit/test_patch17_strict_clinical_contracts.py
6 passed

pytest -q tests/unit/test_generation_service.py tests/unit/test_mediqa_oe_qwen_order_extraction.py tests/unit/test_patch17_strict_clinical_contracts.py
11 passed

pytest -q tests/unit/test_patch16_dynamic_logic_hardening.py tests/unit/test_patch15_planner_safety_and_overblocking.py
12 passed

pytest -q tests/unit/test_prescriptions_api.py
2 passed
```

Compile check:

```text
python -m compileall -q apps libs services tests tools
ok
```

Encoding audit:

```text
python tools/audit_mojibake.py . --json
finding_count=0
```

## Expected benchmark impact

Patch17 is not a new rule-heavy patch. It should mainly improve robustness and prevent unsafe malformed outputs:

- safer Qwen generation output handling;
- fewer invalid medication drafts from non-JSON or malformed JSON;
- clearer audit trail for route/target/forbidden context;
- better support for future renal/pregnancy/vitals/pediatric scenarios;
- less risk of staging/prod being accidentally run with validator off.

The v3 benchmark should be rerun with the same Patch16 notebook workflow after changing the strict staging marker and ZIP name to Patch17.

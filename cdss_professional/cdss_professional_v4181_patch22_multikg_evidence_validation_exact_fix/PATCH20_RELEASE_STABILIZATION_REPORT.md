# Patch20 — Release Stabilization, Business Semantics, and Packaging Hygiene

## Purpose

Patch20 addresses the release-blocking findings from Patch19:

1. Full regression failures caused by route/generation semantic changes.
2. Vulnerable pregnancy contexts being promoted to `review_draft_allowed` with generation enabled.
3. Non-actionable/forbidden medication mentions being routed as `non_pharma` too early.
4. Runtime audit and feedback artifacts accidentally shipped in release zips.
5. Feedback SQLite packaging issue.
6. Level-1 and MEDIQA-OE extraction prompts not being passed as explicit system prompts.

## Business Logic Changes

### Vulnerable contexts fail closed unless explicitly low-risk breastfeeding review draft

Pregnancy, pregnancy uncertainty, renal impairment, hepatic impairment, and allergy risk now block generation in review routes. Breastfeeding can still produce `review_draft_allowed` for selected low-risk targets under clinician validation.

### Review-draft generation permission tightened

`GenerationPermissionPolicy` no longer allows generation merely because `review_draft_allowed=True`. It checks structured patient risk context and blocks generation for high-caution vulnerabilities.

### Non-actionable medication semantics corrected

Pure historical/not-current medication mentions may route to `non_pharma` when there is no actionable target. But negated/avoid/forbidden medication mentions now preserve review/audit semantics and do not silently become non-pharma.

### Authorized low-risk mentions restored

Doctor-authorized low-risk medications such as paracetamol/Doliprane can remain `prescription / draft_prescription` when no vulnerability or blocking safety policy is present. Salbutamol asthma rescue and breastfeeding still use `review_draft_allowed` as appropriate.

### Patient risk context includes RiskFlags

`patient_context()` now includes `risk_flags.pregnancy_risk`, `renal_risk`, and `hepatic_risk` so older and newer pipelines share the same business behavior.

## LLM Prompt Changes

`QwenClinicalExtractor` and `QwenMediqaOeExtractor` now pass their extraction system prompts explicitly via `system_prompt_override`. This makes the extractors robust when reused with router instances that do not preload the correct default system prompt.

## Packaging Hygiene

Release package excludes runtime state:

- `data/audit/trace-*.json`
- `data/feedback/clinician_feedback.*`
- `data/feedback/by_trace/*`
- `__pycache__`, `.pytest_cache`, temporary logs

The feedback repository already recreates SQLite if needed; Patch20 packages no SQLite DB at all.

## Validation Run

Targeted validations completed:

- `test_patch20_release_regression.py`: 6 passed
- `test_execution_plan_and_order_extraction.py`: 4 passed
- `test_patch18_business_logic_core.py`: 6 passed
- `test_patch16_dynamic_logic_hardening.py`: 5 passed
- `test_patch15_planner_safety_and_overblocking.py`: 7 passed
- `test_clinician_feedback_layer.py`: 3 passed
- `test_patch19_monitoring_human_in_loop.py`: 3 passed
- `test_generation_service.py`, `test_clinical_llm_extraction.py`, `test_mediqa_oe_qwen_order_extraction.py`: 11 passed
- `python -m compileall -q apps libs services tests tools`: ok
- `tools/audit_mojibake.py`: finding_count=0

Note: the whole test suite was not conclusively completed inside this environment because long aggregated pytest runs timed out/hung after partial progress. The previously identified release-blocking areas were validated individually.

## Governance

Doctor feedback remains `offline_evaluation_only`. Live retraining remains disabled.

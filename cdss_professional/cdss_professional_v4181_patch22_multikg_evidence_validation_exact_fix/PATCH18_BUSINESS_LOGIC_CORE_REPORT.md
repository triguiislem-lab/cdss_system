# Patch18 — Business Logic Core Hardening

## Goal

Patch18 centralizes clinical business logic so the LLM is not the source of truth for routing, blocking, medication authorization, or generation permission.

The target architecture is:

```text
Qwen / NLP extraction + controlled generation
→ strict contracts / normalization
→ central business logic engine
→ SafetyPolicyEngine
→ ExecutionPlanner
→ PostGenerationValidator
→ mandatory clinician validation
```

## What changed

### 1. New `services/domain/` layer

Added a dedicated business-domain layer:

```text
services/domain/contracts.py
services/domain/utils.py
services/domain/business_rule_registry.py
services/domain/clinical_case_classifier.py
services/domain/medication_authorization_policy.py
services/domain/missing_information_policy.py
services/domain/generation_permission_policy.py
services/domain/clinician_review_policy.py
services/domain/route_decision_engine.py
```

This separates business decisions from raw parser/LLM outputs.

### 2. Central route decision engine

`RouteDecisionEngine` is now the source of truth for:

- final route;
- display route;
- `allowed_to_generate`;
- blocking vs informative missing information;
- patient-requested vs doctor-authorized medication;
- vulnerable context handling;
- emergency/non-pharma precedence;
- forbidden ingredients from extraction and safety policy.

Decision priority:

1. Emergency red flags
2. Blocking safety policy
3. Non-pharma / only non-actionable mentions
4. Patient medication request without doctor authorization
5. Blocking missing information
6. Vulnerable low-risk context → review draft allowed
7. Low-risk protocol target → draft prescription
8. Conservative review fallback

### 3. Medication authorization policy

`MedicationAuthorizationPolicy` normalizes extracted medication mentions into:

- `patient_requested_not_authorized`
- `doctor_authorized`
- `already_taken`
- `negated_or_historical`
- `forbidden_by_extraction`

This prevents a medication that was merely requested, denied, avoided, historical, or not currently taken from becoming a generation target.

### 4. Missing information policy

`MissingInformationPolicy` distinguishes:

- blocking missing info: e.g. pediatric weight for systemic dosing, pregnancy/renal info for NSAIDs, allergy history for antibiotics/high-risk drugs;
- informative missing info: e.g. symptom duration/allergy history in low-risk ORS or simple symptomatic protocols when no safety block exists.

This reduces over-blocking without making high-risk cases permissive.

### 5. Generation permission policy

`GenerationPermissionPolicy` centrally enforces:

- no generation for emergency;
- no generation for non-pharma;
- no generation for blocking policy;
- no generation for patient-requested medication without doctor authorization;
- no generation when blocking missing data remain;
- generation only for controlled low-risk protocol targets or explicit review-draft-allowed cases.

### 6. Clinical case classifier

`ClinicalCaseClassifier` adds a defensive business layer for emergency/non-pharma/vulnerable contexts. It uses structured patient context plus positive-term matching with local negation and question-answer awareness.

It covers dynamic emergency families, not case IDs:

- young infant fever;
- chest pain + sweating/dyspnea;
- flank pain + fever/rigors/vomiting;
- thunderclap/worst headache + neurologic deficit/confusion;
- fever + neck stiffness + petechiae/purpura;
- dental swelling + fever/trismus/dysphagia;
- diabetic foot infection signs.

### 7. Business rule registry

Added `config/business_policy_rules.json` as auditable metadata for business rules:

- `rule_id`
- `category`
- `severity`
- `trigger_summary`
- `action`
- `clinical_explanation`

This is an incremental bridge from Python policies to future JSON/YAML configurable rules.

### 8. Clinician feedback policy

Added `services/feedback/clinician_correction_service.py`.

Corrections are appended to a JSONL feedback dataset with:

```text
learning_policy = offline_evaluation_only_no_runtime_mutation
```

Doctor corrections do not mutate production logic automatically.

## Integration point

`services/planning/execution_planner.py` now calls `RouteDecisionEngine` after extraction, safety policy and indication therapy planning have produced candidate signals.

The older planner logic now acts as candidate signal generation; the domain engine decides the final route/display/generation permission.

## Validation performed

```text
python -m compileall -q apps libs services tests tools
pytest -q tests/unit/test_patch18_business_logic_core.py \
          tests/unit/test_patch17_strict_clinical_contracts.py \
          tests/unit/test_patch16_dynamic_logic_hardening.py \
          tests/unit/test_patch15_planner_safety_and_overblocking.py \
          tests/unit/test_mediqa_oe_qwen_order_extraction.py \
          tests/unit/test_prescriptions_api.py
```

Result:

```text
28 passed
```

Encoding audit:

```text
python tools/audit_mojibake.py . --json
finding_count=0
```

A broader legacy test subset contains old expectations around pregnancy fever review behavior; this should be reconciled against current benchmark targets before treating it as a blocker.

## Expected impact on benchmark

Patch18 should improve:

- route/display consistency;
- patient-requested medication blocking;
- negated/historical medication handling;
- over-blocking from non-critical missing information;
- emergency precedence;
- clinician-review auditability;
- dynamic behavior on unseen cases.

## Safety invariant

The LLM may extract or draft, but business logic decides:

```text
route
allowed_to_generate
forbidden_ingredients
missing_info blocking vs informative
clinician_review_required
```

Doctor validation remains mandatory.

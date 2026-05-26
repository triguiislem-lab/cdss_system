# Patch15 — Planner alignment, Qwen MEDIQA-OE extraction hardening, and benchmark safety fixes

## Purpose
Patch15 targets the remaining issues observed after the Patch14 Kaggle run:

1. `route` / `display_route` inconsistency, e.g. `route=prescription` while `display_route=review_blocked`.
2. Four remaining safety failures in `v3_full`:
   - `sinus_symptoms_3_days_augmentin_request`
   - `ibuprofen_history_gi_bleed`
   - `diabetic_foot_wound_fever`
   - `fever_neck_stiffness_petechiae`
3. Over-blocking of simple positive cases into `missing_info` / `review_blocked`.
4. Better use of Qwen for MEDIQA-OE-style extraction of clinical events, red flags, provenance, and medication source/status.
5. KG curated fallback not appearing in debug endpoint `/v1/prescriptions/kg/search`.

## Main changes

### 1. Final route alignment
Added `_align_snapshot_with_execution_plan()` in `services/orchestration/pipeline.py` and used it in both `/draft` and `/analyze`.

This ensures `snapshot.route_recommendation` is updated to the final deterministic `ExecutionPlan.route`, while preserving the previous route under `extracted_context.pre_planner_route_recommendation`.

### 2. Safety policy additions
Added these deterministic policy rules in `config/safety_policy_rules.json`:

- `sinusitis_short_duration_patient_antibiotic_request`
- `nsaid_gi_bleed_or_antiplatelet_review`
- `diabetic_foot_infection_emergency`
- `fever_neck_stiffness_petechiae_emergency`

These rules are general and not tied to `case_id`.

### 3. Qwen MEDIQA-OE prompt hardening
Enhanced `services/order_extraction/llm_mediqa_oe_extractor.py`:

- Added stronger instructions to extract red flags and risks even when there is no medication order.
- Added speaker/source/status emphasis for medication events.
- Added a third few-shot example for fever + neck stiffness + non-blanching rash.
- Removed duplicate prompt line.
- Expanded selective Qwen triggers for sinusitis, GI bleed, diabetic foot, meningitis/sepsis red flags, and simple symptomatic local protocol targets.

### 4. Reduced over-blocking of safe positive cases
Added `_simple_protocol_draft_allowed()` to `services/planning/execution_planner.py`.

This allows controlled, low-risk protocol targets to return `draft_prescription` when:

- the target is in `SIMPLE_DRAFT_ALLOWLIST`,
- no SafetyPolicyEngine blocking hit exists,
- no true forbidden ingredient exists,
- no positive pregnancy/renal/hepatic/allergy/escalation risk is present,
- no unauthorized high-risk request context exists.

### 5. Red-flag negation handling in indication map
Added `_term_present_without_local_negation()` in `services/planning/indication_therapy_planner.py` so negative screening statements like `pas de sang`, `pas de dysphagie`, `no red flags` no longer suppress safe protocol rows.

### 6. Expanded controlled low-risk target support
Added controlled protocol support for:

- `alginate`
- `artificial_tears`
- `saline_nasal_spray`
- `benzoyl_peroxide_topical`
- `psyllium`
- `chlorhexidine_mouthwash`
- `dexpanthenol_topical`
- `aciclovir_topical`
- `dimenhydrinate`
- `lidocaine_topical`
- `diclofenac_topical`

Updated:

- `services/normalization/dci_normalizer.py`
- `services/planning/execution_planner.py`
- `data/runtime/tn_dci_safety_profiles.csv`
- `data/runtime/tn_indication_therapy_map.csv`

### 7. KG fallback debug endpoint
`/v1/prescriptions/kg/search` now uses `KGRetriever(..., enable_curated_fallbacks=settings.kg_curated_fallback_enabled)`. The default setting is now `KG_CURATED_FALLBACK_ENABLED=true`.

## Validation performed

Compiled:

```bash
python -m compileall apps libs services tests
```

Targeted tests:

```bash
pytest -q tests/unit/test_patch15_planner_safety_and_overblocking.py \
          tests/unit/test_patch13_benchmark_logic_hardening.py \
          tests/unit/test_mediqa_oe_qwen_order_extraction.py
# 13 passed

pytest -q tests/unit/test_hybrid_extraction_and_indication_planner.py \
          tests/unit/test_execution_plan_and_order_extraction.py
# 39 passed

pytest -q tests/unit/test_prescriptions_api.py \
          tests/unit/test_retrieval_service.py \
          tests/unit/test_safety_policy_engine.py
# 8 passed
```

A full `pytest tests/unit` run was attempted; it progressed without new failures in the visible output but hit the execution time limit, so only the targeted suites above are claimed as validated.

## Recommended next Kaggle run

First run smoke only:

```python
CDSS_EVAL_DATASET_NAMES = ["v3_smoke"]
RUN_CDSS_GENERATED_CASES_ANALYZE = True
RUN_CDSS_GENERATED_CASES_DRAFT = True
```

Then run full:

```python
CDSS_EVAL_DATASET_NAMES = ["v3_full"]
RUN_CDSS_GENERATED_CASES_ANALYZE = True
RUN_CDSS_GENERATED_CASES_DRAFT = True
```

Expected improvements:

- eliminate `route=prescription` + `display_route=review_blocked/emergency` inconsistency,
- block the four remaining safety failures from Patch14,
- reduce over-blocking of simple positive protocol cases,
- keep Qwen as extraction/comprehension engine while keeping safety/planning deterministic.

# CDSS V4.18 Integration Corrections Applied

This package contains the corrections requested after the project review.

## Corrections applied

1. **Planner pregnancy over-trigger fixed**
   - `services/planning/execution_planner.py` now uses positive-only pregnancy detection.
   - `missing_critical_information` is no longer used in the planner safety-trigger text blob by default.
   - Phrases such as `not pregnant`, `pregnancy status missing`, `ask pregnancy status`, and `denies pregnancy` no longer trigger pregnancy/breastfeeding review.

2. **SafetyPolicyEngine kept as reusable policy layer**
   - Existing `config/safety_policy_rules.json` and `services/safety/*` are preserved.
   - Planner records policy audit information and can enforce policies via `SAFETY_POLICY_MODE=enforce`.

3. **ExecutionPlan now propagates into retrieval**
   - `services/orchestration/pipeline.py` now calls `RetrievalService.build_evidence(..., execution_plan=execution_plan)`.
   - This preserves target ingredient propagation into retrieval/evidence scoring.

4. **Contract enforcement uses `execution_plan.route`**
   - `_enforce_contract_states()` now prefers the final `ExecutionPlan.route` instead of only `snapshot.route_recommendation`.
   - Empty prescription detection also uses the `ExecutionPlan` route.

5. **ClinicalActionProposal wiring fixed**
   - `ClinicalActionBuilder.build()` accepts `prescription`, `evidence`, and `safety` keyword arguments.
   - Pipeline now attaches the doctor-facing `clinical_action` when enabled.

6. **Post-generation and medical-order components preserved**
   - Medical order extraction and post-generation validator remain staged/audit-capable.
   - `.env` enables them in audit mode for runtime visibility.

7. **Prompt compatibility fixed**
   - `PromptBuilder` now includes both `pregnant: True` and backward-compatible `pregnant=True`.

8. **Runtime data paths fixed**
   - `.env`, `.env.example`, `.env.kaggle`, and `.env.tunisia_runtime` now point to shipped runtime files:
     - `data/runtime/tn_master_amm_catalog.csv`
     - `data/runtime/tn_master_vs_corpus.jsonl`
     - `data/runtime/tn_master_kg_edges.csv`

## Validation performed

- `python -m compileall -q apps libs services tools tests`
- `pytest -q` → **74 passed**
- `python tools/run_policy_rule_benchmark.py` → **pass_rate = 1.0**
- `python tools/run_professional_validation_suite.py` → **ok = true**
- Direct planner check confirms:
  - `Adult fever, not pregnant, no allergy.` → prescription
  - `Adult fever. Pregnancy status missing; ask pregnancy status.` → prescription
  - `Patient denies pregnancy and has fever.` → prescription

## Recommended next runtime validation

1. Restart FastAPI.
2. Warm Qwen.
3. Run quick Level 2.
4. Run full Level 2 30/30.
5. If stable, test `SAFETY_POLICY_MODE=enforce` for policy-enforced validation.

# Patch16 Dynamic Qwen/MEDIQA-OE Logic Hardening

## Purpose
Patch16 is a targeted hardening pass after the Patch15 executed notebook results. It focuses on generalizable logic, not case-id overrides:

- prevent negated medication mentions from becoming prescription targets;
- strengthen remaining emergency triage patterns;
- make negation/question-answer parsing more robust across new wording;
- reduce over-blocking for low-risk protocol targets;
- improve controlled target selection for GERD/ORS/paracetamol fixtures;
- keep Qwen/MEDIQA-OE extraction as the structured understanding layer while deterministic policy/planner remain the safety authority.

## Key implementation changes

### 1. Local, question-aware negation
Updated matching in:

- `services/safety/policy_matchers.py`
- `services/planning/indication_therapy_planner.py`
- `services/order_extraction/service.py`
- `services/planning/execution_planner.py`

The matcher now distinguishes:

- positive mention: `remontées acides depuis deux semaines`
- negative screening: `perte de poids, vomissements, dysphagie ? Non`
- speaker-normalized negative screening: `doctor douleur thoracique ... patient non`
- unrelated context: `without alarm features heartburn` should not negate heartburn.

### 2. Negated medication guardrail is not an order
`patient says not taking amoxicillin` now stays non-pharma/no target instead of `draft_prescription` or `review_blocked`.

Negated/not-current/historical medication mentions remain guardrails, but they are not actionable orders and do not automatically force a blocked review route.

### 3. Emergency coverage generalized
Patch16 strengthens general red-flag patterns for:

- UTI + flank pain + systemic symptoms;
- sudden/worst headache + neurologic symptoms;
- dental swelling + fever/trismus/swallowing difficulty;
- anaphylaxis/airway features.

### 4. Over-blocking reduction
Low-risk protocol targets are less likely to become missing-info when safety screens are negative:

- oral rehydration salts;
- paracetamol in safe adult viral syndrome;
- omeprazole for GERD with alarm features explicitly negated;
- cetirizine in breastfeeding stays review_draft_allowed, not direct prescription.

### 5. Controlled target normalization
- Added an ORS safety profile to `tn_dci_safety_profiles.csv`.
- Refined the pain indication row to avoid generic doctor questions like `Décrivez la douleur` producing paracetamol.
- GERD target preference now keeps omeprazole over alginate for longer/diagnosed reflux contexts.

## Validation performed

```text
pytest -vv tests/unit/test_patch16_dynamic_logic_hardening.py \
          tests/unit/test_patch15_planner_safety_and_overblocking.py \
          tests/unit/test_patch13_benchmark_logic_hardening.py -x

16 passed
```

```text
python -m compileall apps libs services tests
compileall ok
```

## Expected benchmark impact

Patch16 should improve:

- `patient_says_not_taking_amoxicillin_negation`;
- `flank_pain_fever_uti_pyelo_red_flag`;
- `sudden_worst_headache_neuro_deficit`;
- `dental_swelling_fever_trismus`;
- `breastfeeding_rhinitis_cetirizine_review`;
- `adult_diarrhea_mild_ors`;
- `gerd_simple_omeprazole`;
- `adult_fever_myalgia_no_red_flags_paracetamol`.

The next Kaggle run should still be considered the source of truth for full v3 performance.

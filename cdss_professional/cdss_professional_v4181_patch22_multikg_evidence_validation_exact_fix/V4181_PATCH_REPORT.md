# V4.18.1 Patch Report

## Scope
This patch completes the immediate missing integration identified after V4.18:

1. MedicalOrderExtraction now runs before ExecutionPlanner.
2. MedicalOrderExtraction is passed into ExecutionPlanner and SafetyPolicyEngine.
3. SafetyPolicyEngine can use requested/already-taken medications as policy inputs.
4. ClinicalActionProposal is completed with safety explanations, evidence summary, and optional attached prescription.
5. A V4.18.1 pre-planning smoke tool was added.

## Runtime pipeline after this patch

ClinicalUnderstanding → MedicalOrderExtraction → SafetyPolicyEngine / ExecutionPlanner → Retrieval → Generation → PostGenerationSafetyValidator → Safety → Localization → ClinicalActionProposal / PrescriptionProposal

## Key behavior checked

- Simple fever with `not pregnant` remains prescription.
- Viral sore throat + patient request for amoxicillin is detected before planning and routes to review in enforce mode.
- Already-taken Doliprane/paracetamol is detected before planning and routes to review for overuse/current-use concern.
- ClinicalActionProposal now includes `safety_explanations`, `evidence_summary`, and `prescription`.

## Validation executed

```bash
python -m compileall -q apps libs services tools tests
pytest -q
python tools/run_policy_rule_benchmark.py
python tools/run_professional_validation_suite.py
python tools/run_v4181_preplanning_smoke.py
```

Results:

- `pytest -q`: 74 passed
- policy rule benchmark: pass_rate = 1.0
- professional validation suite: ok = true
- V4.18.1 pre-planning smoke: ok = true

## Still intentionally deferred

The multilingual model stack remains scaffold/offline-safe only:

- NLLB translation/query expansion is not fully integrated yet.
- multilingual-e5-large-instruct PrescriptionEvidenceIndex is not built yet.
- ms-marco MiniLM reranker remains optional and disabled by default.
- paraphrase multilingual MiniLM similarity/dedup is not fully active yet.

These should be added after the safety and route pipeline is stable under full API benchmarks.

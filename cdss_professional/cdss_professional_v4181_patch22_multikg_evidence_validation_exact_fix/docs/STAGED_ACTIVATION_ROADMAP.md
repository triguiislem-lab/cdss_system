# Staged activation architecture: V4.18-V4.23

The source tree can contain all next-level components at once, but runtime behavior changes only through feature flags.

Default flags preserve the stable baseline:

```env
SAFETY_POLICY_MODE=audit
CLINICAL_ACTION_ENABLED=false
MEDICAL_ORDER_EXTRACTION_MODE=off
POST_GENERATION_VALIDATOR_MODE=off
MULTILINGUAL_RETRIEVAL_ENABLED=false
MULTILINGUAL_TRANSLATION_ENABLED=false
MULTILINGUAL_RERANKER_ENABLED=false
PROFESSIONAL_VALIDATION_ENABLED=true
```

Recommended activation order:

1. `SAFETY_POLICY_MODE=audit`
2. `SAFETY_POLICY_MODE=enforce`
3. `CLINICAL_ACTION_ENABLED=true`
4. `MEDICAL_ORDER_EXTRACTION_MODE=audit`
5. `MEDICAL_ORDER_EXTRACTION_MODE=enforce` after audit validation
6. `POST_GENERATION_VALIDATOR_MODE=audit`
7. `POST_GENERATION_VALIDATOR_MODE=enforce`
8. `MULTILINGUAL_RETRIEVAL_ENABLED=true` only after offline model paths are present
9. Run `python tools/run_professional_validation_suite.py`

The notebook should only unzip the source, set flags, start API, warm Qwen, and run benchmarks.

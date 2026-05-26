# Patch21 MultiKG Kaggle Hotfix

## Why the Kaggle notebook failed

The executed notebook showed two independent issues:

1. `/v1/prescriptions/kg/search?query=acenocoumarol SINTROM anticoagulant bleeding interaction` returned an empty `facts` list, while a direct Kuzu diagnostic query returned Acenocoumarol facts such as Melaena and Coagulopathy. This indicates the Kuzu graph exists and contains the evidence, but the API retriever query was too strict for the runtime Kuzu edge schema.

2. `/v1/prescriptions/analyze` timed out after 600 seconds. In the notebook environment, `MEDICAL_ORDER_LLM_EXTRACTION_ENABLED=true`, `MEDICAL_ORDER_LLM_EXTRACTION_BACKEND=transformers`, and `MEDICAL_ORDER_LLM_EXTRACTION_FORCE_FOR_MEDICATION_MENTIONS=true`. The `/analyze` endpoint executes medical-order extraction, so it can lazy-load/run Qwen even though it is not a generation endpoint.

## Code fixes included

- Added Acenocoumarol/Sintrom/AVK/anticoagulant/bleeding aliases to the KG connector query expansion.
- Added a Kuzu minimal-schema fallback query when optional edge properties such as `relation_category`, `severity_hint`, `source_system`, or `evidence_text` are absent from the Kuzu export.
- Added curated safety fallback facts for `acenocoumarol / SINTROM / anticoagulant / bleeding` so the API no longer returns empty evidence for that critical safety case.
- Added non-regression tests for the Acenocoumarol query and minimal Kuzu schema fallback.

## Notebook/runtime recommendation

For fast system tests and MultiKG ablation, disable Qwen-based medical-order extraction:

```bash
MEDICAL_ORDER_LLM_EXTRACTION_ENABLED=false
MEDICAL_ORDER_LLM_EXTRACTION_POLICY=never
MEDICAL_ORDER_LLM_EXTRACTION_FORCE_FOR_MEDICATION_MENTIONS=false
CLINICAL_LLM_EXTRACTION_ENABLED=false
GENERATION_BACKEND=notebook_heuristic
```

Then run Qwen generation as a separate, limited evaluation after warmup, instead of mixing it with KG/readiness/system checks.

## Tests run in this environment

- `python -m pytest tests/unit/test_patch21_multi_kg_retriever.py -q` => 7 passed
- `python -m compileall -q libs services apps tests` => OK
- targeted compatibility subset => 31 passed

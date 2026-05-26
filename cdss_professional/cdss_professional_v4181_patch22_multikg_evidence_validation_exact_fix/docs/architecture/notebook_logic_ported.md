# Notebook logic ported into the fixed runtime project

This phase moves selected logic from the large notebook into reusable modules on
 top of the cleaned architecture.

## Ported notebook ideas

### Retrieval
- prescription-oriented vector query hints
- risk-token query enrichment for pregnancy / renal / hepatic / elderly / pediatric contexts
- source-bucket scoring from the stricter retrieval patches
- exact-term hit boosts
- patient-context boosts for safety-relevant evidence
- Tunisia local-formulary keyword routing and dose/form matching heuristics

### Draft generation
- therapy-strategy detection (`non_pharma`, `emergency`, `review`, `symptomatic`, `disease_directed`)
- suppression of medication drafting for emergency and non-pharma cases
- evidence-grounded medication candidate selection using local products + KG facts + vector mentions
- safer symptomatic first-line preference (for example paracetamol ahead of NSAIDs when risk factors are present)
- structured unresolved-question generation from missing data and risk context

### Tunisia localization
- DCI normalization and aliases
- ingredient-set comparison for combination products
- route/form bucketing
- dose-token extraction and overlap scoring
- indication bonus and VEIC tie-breakers

## Files updated
- `libs/utils/medical_text.py`
- `services/retrieval/query_builder.py`
- `services/retrieval/evidence_ranker.py`
- `services/retrieval/local_formulary_retriever.py`
- `services/generation/therapy_strategy.py`
- `services/generation/candidate_selector.py`
- `services/generation/llm_router.py`
- `services/generation/prescription_generator.py`
- `services/localization/amm_mapper.py`
- `services/localization/product_ranker.py`
- `services/localization/strength_resolver.py`
- `services/localization/tunisia_localizer.py`

## Remaining clinical-validation work
- real Neo4j queries from the notebook runtime
- real vector index scoring / BM25 / RRF fusion
- real Tunisia SQLite shortlist and regimen bundle adapters
- real model inference backends and notebook prompt stack parity
- full notebook audit trace parity and evaluation harness parity


## Current runtime clarification

The project no longer relies on notebook stubs as the default runtime. Runtime paths use the Tunisia KG/VS/AMM exports. Remaining work is validation and authoritative external-source integration, especially for safety knowledge and reimbursement/VEI.

# Remaining modules status

Completed scaffold layers:

- retrieval: fixture-backed and integration-ready
- generation: prompt, router, parser, rationale, service
- safety: deterministic fixture-backed rule modules
- localization: Tunisian product mapping scaffold
- evaluation: scenario loader, metrics, benchmark runner, report builder
- ingestion: fixture-backed ingestion pipeline with structured job reports

Priority extraction order from notebook:

1. retrieval (`_retrieve_vs_core`, `_retrieve_kg_core`, `_fuse_context_core`)
2. generation (`prescribe`, `_generate_prescription_core`, prompts)
3. safety (pregnancy, DDI, contraindication, dose authority)
4. localization (`_validate_tn_output_core`, AMM mapping, VEI mapping)

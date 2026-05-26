# Clinical deployment governance

This project can run in research mode without formal sign-off, but **clinical deployment mode** must remain blocked until all governance requirements are satisfied.

## Required approvals

The file `data/governance/deployment_approval_manifest.json` must confirm:

- `clinical_validation_signed`
- `safety_validation_signed`
- `benchmark_validation_signed`
- `data_governance_signed`

## Runtime asset minimums

The governance gate also checks that these runtime assets exist and meet minimum row counts:

- `data/runtime/tn_master_kg_edges.csv`
- `data/runtime/tn_master_vs_corpus.jsonl`
- `data/runtime/tn_master_amm_catalog.csv`

## Enabling clinical deployment mode

Set:

- `CLINICAL_DEPLOYMENT_MODE=true`

Only after the manifest approvals are set to true.

If any approval is missing or any runtime asset is missing/below threshold, the API container will raise an error and block pipeline initialization.

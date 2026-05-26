# Patch 23 — TN Med DB v1 Structured Enrichment Integration

## Purpose

This patch integrates the new `/kaggle/input/datasets/islemtrigui6/tn-med-db-v1` datasource as a structured enrichment layer for the CDSS runtime.

The datasource fills gaps that were not covered directly by the existing CDSS runtime SQL table:

- therapeutic class
- therapeutic subclass
- active-substance normalization
- structured indications
- price/reimbursement
- raw clinical evidence summaries
- candidate heuristic-rule summaries

## New components

### `libs/knowledge_connectors/tn_med_client.py`

Adds `TNMedEnrichmentClient`, a schema-tolerant SQLite connector for `TN_Med.db`.

Main methods:

- `health_check()`
- `search(query, limit, filters)`
- `retrieve_chunks(query, limit, filters)`
- `get_by_product_name(name)`
- `get_by_active_ingredient(dci)`
- `get_by_amm(amm)`

The client resolves the database from:

- `TN_MED_DB_PATH`
- `TN_MED_DATA_ROOT/database/TN_Med.db`
- `/kaggle/input/datasets/islemtrigui6/tn-med-db-v1/database/TN_Med.db`

### `services/retrieval/tn_med_enrichment_retriever.py`

Adds `TNMedEnrichmentRetriever`, returning `EvidenceChunk` objects for fusion.

Structured enrichment chunks are emitted for:

- therapeutic classification
- indications
- price/reimbursement

Support-only chunks are emitted for:

- raw clinical evidence summaries
- candidate heuristic rules

Candidate rules are deliberately marked as `support_only` and `accepted_for_runtime_retrieval=false` until curated.

## Runtime integration

### Configuration

New settings:

```text
TN_MED_ENABLED
TN_MED_DATA_ROOT
TN_MED_DB_PATH
TN_MED_REQUIRED_FOR_READINESS
TN_MED_TOP_K
```

`.env`, `.env.kaggle`, `.env.cdss_final_runtime`, `.env.clinical_eval`, and `.env.tunisia_runtime` enable TN Med enrichment by default for Kaggle-style runtime.

`.env.example` documents the same settings but keeps `TN_MED_ENABLED=false` for local development safety.

### Retrieval

`HybridRetriever` now optionally calls `TNMedEnrichmentRetriever` and appends TN Med chunks into the evidence stream before fusion.

Diagnostics added:

```text
tn_med_enrichment_ms
tn_med_final_count
tn_med_retrieve_call_shape
```

### API

New diagnostic endpoint:

```text
GET /v1/prescriptions/tn-med/search?query=DOLIPRANE&limit=5
```

Response includes:

- `available`
- structured `profiles`
- fusion-ready `chunks`

### Readiness

`/v1/system/readiness` now reports:

```json
"tn_med_ready": true,
"resource_checks": {
  "tn_med_db_v1": {
    "enabled": true,
    "required_for_readiness": false,
    "data_root": "...",
    "db_path": ".../TN_Med.db",
    "db_exists": true
  }
}
```

If `TN_MED_REQUIRED_FOR_READINESS=true`, readiness fails when the DB is absent.

## Source authority policy

TN Med DB v1 is integrated as structured enrichment, not as an unchecked final clinical authority.

Safe structured enrichment:

- therapeutic class/subclass
- substances
- structured indications
- price/reimbursement

Support-only until curated:

- raw clinical evidence summaries
- heuristic rules

## Tests

Added:

```text
tests/unit/test_tn_med_enrichment_integration.py
```

Validated:

- `TNMedEnrichmentClient` reads a realistic TN Med schema.
- classification/subclassification/indication/price/evidence/rules are returned.
- `TNMedEnrichmentRetriever` returns evidence chunks.
- `HybridRetriever` appends TN Med chunks and exposes diagnostics.

Targeted test run:

```text
pytest -q tests/unit/test_patch21_multi_kg_retriever.py \
          tests/unit/test_cdss_final_runtime_connectors.py \
          tests/unit/test_prescriptions_api.py \
          tests/unit/test_retrieval_service.py \
          tests/unit/test_tn_med_enrichment_integration.py
```

Result:

```text
16 passed, 1 skipped
```

## Final architecture after this patch

```text
CDSS Runtime SQL
  = local product/localization truth

TN Med DB v1
  = structured enrichment: class, subclass, indications, substances, price, raw evidence/rules summary

CDSS Vector Store
  = rich clinical evidence text

CDSS Local KG
  = structured local safety relations

Hetionet/PrimeKG
  = support-only biomedical explanation graph

Rules/Safety Engine
  = final clinical decision layer
```

# Patch21 MultiKG Retriever Implementation Report

## Objective

Implement real primary-plus-backup KG retrieval in the project runtime, not pseudo-code only.

## Implemented changes

### Retrieval contract
- `KnowledgeGraphFact` now exposes:
  - `kg_source`
  - `support_only`

### `services/retrieval/kg_retriever.py`
- Added `MultiKGRetriever`.
- Queries the primary Tunisian/CDSS KG first.
- Queries configured backup KG retrievers after the primary KG.
- Deduplicates facts by `(subject, predicate, object)`.
- Keeps primary facts over duplicate backup facts.
- Applies `KG_BACKUP_SCORE_MULTIPLIER` to backup scores.
- Tags primary facts with `kg_source="tn_primary_kg"` and `support_only=false`.
- Tags backup facts with `kg_source="backup_kg_1"`, `backup_kg_2`, etc. and `support_only=true`.

### `apps/api/container.py`
- Added robust Kuzu path resolution for Kaggle datasets that contain a nested `*.kuzu` folder.
- Added `get_backup_kg_clients()`.
- Added `get_kg_retriever()` returning `MultiKGRetriever`.
- Wired `RetrievalService` / `HybridRetriever` to use `MultiKGRetriever`.

### `libs/config/settings.py`
- Added:
  - `KG_BACKUP_KUZU_DB_PATH`
  - `HETIONET_PRIMEKG_KUZU_DB_PATH`
  - `KG_BACKUP_BACKEND`
  - `KG_BACKUP_ENABLED`
  - `KG_BACKUP_SCORE_MULTIPLIER`
- Enabled `populate_by_name=True` so tests and scripts can construct `AppSettings` with Python field names as well as env aliases.

### `apps/api/routers/prescriptions.py`
- `/v1/prescriptions/kg/search` now goes through `MultiKGRetriever` for both filtered and unfiltered searches.

### `services/retrieval/hybrid_retriever.py`
- Added retrieval diagnostics:
  - `kg_source_counts`
  - `kg_support_only_count`

### `apps/api/routers/system.py`
- `/v1/system/readiness` now reports:
  - top-level `backup_kuzu_db_exists`
  - `resource_checks.kg.backup_kuzu_db_exists`
  - resolved primary/backup Kuzu DB paths

### Runtime env files
- `.env.kaggle` and `.env.cdss_final_runtime` are ready for:
  - KG backup Hetionet/PrimeKG
  - FAISS vector fallback
  - preserving the primary vector store
- `.env.example` documents the new variables with conservative defaults.

## Activation variables

```env
KG_BACKUP_ENABLED=true
KG_BACKUP_BACKEND=kuzu
KG_BACKUP_KUZU_DB_PATH=/kaggle/input/datasets/islemtrigui6/hetionet-primekg-kuzu-database
KG_BACKUP_SCORE_MULTIPLIER=0.92

VECTOR_FALLBACK_BACKEND=faiss
VECTOR_FALLBACK_FAISS_INDEX_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/medical_knowledge.faiss
VECTOR_FALLBACK_FAISS_METADATA_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_metadata.pkl
VECTOR_PICKLE_TEXTS_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_texts.pkl
```

## Verification commands

```bash
python -m compileall -q libs services apps tests/unit/test_patch21_multi_kg_retriever.py
python -m pytest tests/unit/test_patch21_multi_kg_retriever.py -q
python -m pytest tests/unit/test_prescriptions_api.py tests/unit/test_retrieval_service.py tests/unit/test_patch15_planner_safety_and_overblocking.py tests/unit/test_patch21_professional_stabilization.py tests/unit/test_patch21_multi_kg_retriever.py -q
```

## Test result summary

- Collection: 205 unit tests.
- Targeted MultiKG tests: 5 passed.
- Compatibility subset: 21 passed.
- Unit suite was validated file-by-file in this sandbox because the all-in-one `pytest tests/unit -q` command exceeded the interactive command window.
- File-by-file result: 204 passed, 1 skipped, 0 failed.


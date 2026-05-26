# CDSS final runtime database integration patch

This patch updates the project so it can consume the generated runtime database package:

- `sqlite/tn_localization.sqlite`
- `faiss/tn_prescription_evidence.faiss`
- `faiss/tn_prescription_evidence_metadata.parquet`
- `faiss/tn_prescription_evidence_vector_store_stats.json`
- `kuzu/tn_kg_safety.kuzu`
- `reconciliation/formulaire_reconciliation.sqlite`

## Main changes

1. `VectorIndexClient`
   - Supports FAISS metadata stored as Parquet.
   - Reads vector-store stats JSON.
   - Applies the recorded query instruction before embedding queries.
   - Normalizes generated evidence metadata fields such as `active_ingredient_canonical`, `section_kind`, `local_product_name`, `route_inferred`, `form_normalized`, and `strength_normalized`.
   - Uses raw clipped cosine/IP score when the stats metric is `inner_product_cosine`.

2. `LocalFormularyClient`
   - Adds `sqlite_tn_localization` / `tn_localization_sqlite` backend.
   - Loads structured products from the generated `medicines` table.
   - Preserves route, strength, strict mono eligibility, evidence counts, and source metadata.

3. `Neo4jClient`
   - Adds a `kuzu` backend for the generated `tn_kg_safety.kuzu` database.
   - Queries Kuzu `Entity` / `KG_REL` records directly for KG safety enrichment.
   - Keeps Kuzu as enrichment, not hard safety authority.

4. Settings/container wiring
   - Adds env aliases for:
     - `LOCALIZATION_DB_PATH`
     - `EVIDENCE_FAISS_PATH`
     - `EVIDENCE_METADATA_PATH`
     - `EVIDENCE_VECTOR_STATS_PATH`
     - `KG_KUZU_DB_PATH`
     - `FORMULAIRE_RECONCILIATION_DB_PATH`
   - Wires `sqlite_tn_localization`, `faiss`, and `kuzu` backends into the existing DI container.

5. Runtime env template
   - Adds `.env.cdss_final_runtime` for the generated Kaggle dataset paths.

6. Tests
   - Adds `tests/unit/test_cdss_final_runtime_connectors.py`.
   - Validated with:
     - `pytest -q tests/unit/test_runtime_backends.py tests/unit/test_tunisia_runtime_assets.py tests/unit/test_cdss_final_runtime_connectors.py`
   - Result: `11 passed, 1 skipped`.

## Recommended runtime mode

Minimal integration smoke test:

```env
LOCAL_FORMULARY_BACKEND=sqlite_tn_localization
VECTOR_BACKEND=faiss
VECTOR_EMBEDDING_MODEL=intfloat/multilingual-e5-large-instruct
KG_BACKEND=kuzu
RERANK_ENABLED=false
```

Clinical retrieval mode, if memory/latency allow:

```env
RERANK_ENABLED=true
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
```

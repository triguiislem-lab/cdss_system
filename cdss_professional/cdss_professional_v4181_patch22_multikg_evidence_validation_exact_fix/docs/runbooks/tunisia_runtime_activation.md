# Tunisia runtime activation

This package now ships with the real Tunisia runtime exports under `data/runtime/`:

- `tn_master_kg_edges.csv`
- `tn_master_vs_corpus.jsonl`
- `tn_master_amm_catalog.csv`

Default backends are set to use these files:

- `KG_BACKEND=csv`
- `VECTOR_BACKEND=jsonl`
- `LOCAL_FORMULARY_BACKEND=csv`
- `AUDIT_BACKEND=file`

If you want to override paths, copy `.env.tunisia_runtime` to `.env` and edit the file.

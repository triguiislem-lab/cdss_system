# Patch: Real Kaggle Runtime As Primary Source

This archive has been modified so the FastAPI demo uses the real Kaggle runtime data by default.

## Primary runtime source

`/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases`

Primary backends:

- `LOCAL_FORMULARY_BACKEND=sqlite_tn_localization`
- `VECTOR_BACKEND=faiss`
- `KG_BACKEND=kuzu`

## Fallback/support sources

- KG fallback: `/kaggle/input/datasets/islemtrigui6/hetionet-primekg-kuzu-database`
- Vector fallback: `/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss`

## Important behavior

- `project/data/runtime` is no longer the primary KG/vector/formulary source.
- `.env`, `.env.kaggle`, and `.env.cdss_final_runtime` now point to the full Kaggle runtime package.
- Several modules that previously read `data/runtime` directly now read environment-configured paths or Kaggle SQLite/KG/vector equivalents first.
- The project still keeps built-in minimum guardrails and demo files for local development only.

## Demo validation

After starting FastAPI, `/v1/system/readiness` must show:

```text
vector.backend    = faiss
kg.backend        = kuzu
formulary.backend = sqlite_tn_localization
```

If readiness shows `final_release_jsonl`, `csv`, `csv`, the process loaded an old environment and must be restarted.

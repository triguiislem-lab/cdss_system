# PATCH24 Runtime TN Med Search Fix

## Problem observed

The evaluation notebook showed that `/v1/prescriptions/tn-med/search` no longer crashed after runtime patching, but known TN Med products such as `ABBOTICINE` returned:

```json
{"available": false, "profiles": []}
```

This means the endpoint was alive, but `TNMedEnrichmentClient.is_available()` was false.

## Root cause

The Patch23 client trusted `TN_MED_DB_PATH` / `TN_MED_DATA_ROOT` too strongly. In `.env.kaggle` the path is hardcoded as:

```text
/kaggle/input/datasets/islemtrigui6/tn-med-db-v1/database/TN_Med.db
```

However, in real Kaggle runs the TN Med dataset can be mounted under a different slug/path, for example:

```text
/kaggle/input/tn-med-db-v1/database/TN_Med.db
/kaggle/input/datasets/islemtrigui6/data-tn/tn-med-db-v1/database/TN_Med.db
```

The old fallback only recursively searched the configured TN Med root and default root, not `/kaggle/input` broadly. Therefore, when the configured path was stale, the client remained unavailable although the real `TN_Med.db` was attached.

## Fixes applied

1. `libs/knowledge_connectors/tn_med_client.py`
   - Added robust Kaggle/offline path discovery.
   - Searches explicit path, environment path, environment root, default roots, and finally `/kaggle/input`.
   - Scores candidate `TN_Med.db` paths and prefers TN Med/data-tn/database locations.
   - Opens SQLite in read-only immutable mode when possible.

2. `apps/api/routers/prescriptions.py`
   - Made `/v1/prescriptions/tn-med/search` defensive.
   - If TN Med is unavailable, returns a clean empty response rather than crashing.
   - Sanitizes SQLite-derived profiles before response serialization.
   - Catches client/retriever exceptions and returns diagnostic profiles instead of HTTP 500.

## Expected result

After attaching TN Med DB V1 or data-tn containing TN_Med.db, the following should return `available=true` and non-empty profiles for known products:

```text
/v1/prescriptions/tn-med/search?query=ABBOTICINE&limit=5
/v1/prescriptions/tn-med/search?query=ABILIFY&limit=5
```

Synthetic unavailable products should return `available=true` for the datasource itself, but empty profiles:

```text
/v1/prescriptions/tn-med/search?query=NONDISPO-ABBOTICINE-XYZ99&limit=5
```

Important distinction:
- `available` means the TN Med datasource is mounted and readable.
- `profiles` indicates whether the query matched a medicine.

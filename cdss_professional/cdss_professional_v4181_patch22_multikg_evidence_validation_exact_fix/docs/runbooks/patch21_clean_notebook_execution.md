# Patch21 Clean Notebook Execution Rules

The evaluation notebook must run from the release zip only. It must not silently patch source files.

Required sequence:

1. Set `PROJECT_ZIP` to the Patch20/Patch21 release archive.
2. Delete and recreate `WORKDIR`.
3. Extract the zip fresh.
4. Run health checks and the required unit/business/safety/API subsets.
5. Export `patch20_clean_eval_metrics.json` and `patch20_clean_eval_summary.md`.

If a Kaggle compatibility overlay is unavoidable, it must set:

```python
EVALUATION_OVERLAY_APPLIED = True
OVERLAY_REASON = "Kaggle path compatibility only"
OVERLAY_FILES = [...]
```

Otherwise, reported results are considered to represent the clean release archive.

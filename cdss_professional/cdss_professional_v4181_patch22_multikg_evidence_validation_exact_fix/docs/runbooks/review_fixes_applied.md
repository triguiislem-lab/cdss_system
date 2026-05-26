# Review fixes applied

This pass applied the core architecture feedback from the external review:

- `AppSettings` now holds environment and infrastructure settings.
- `RuntimePipelineConfig` now holds per-run pipeline knobs.
- API DTOs were moved to `apps/api/schemas.py`.
- execution models were moved to `libs/contracts/execution.py`.
- dependency wiring now runs through `apps/api/container.py`.
- `blocked` and `status` are real serialized fields.
- localization is skipped by default when blocking safety findings exist.
- the audit layer now uses a replaceable repository boundary.
- thin facades `services/orchestration/service.py` and `services/audit/logger.py` were removed.
- cache/build junk is excluded from the packaged zip.

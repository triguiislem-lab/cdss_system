# Patch21 Professional Stabilization Report

Applied corrections:

1. **Business logic**
   - Added explicit `EvidencePolarity` (`positive`, `negated`, `unknown`).
   - Added `AllergyEvidence` extraction and positive-only contraindication mapping.
   - `no known allergy` / `aucune allergie` now stays negated and never becomes a forbidden ingredient.
   - Positive penicillin allergy blocks amoxicillin targets.
   - Unknown allergy status remains missing/review information rather than a false contraindication.
   - Added `BusinessDecision` as the canonical business decision contract while preserving `RouteDecision` compatibility.

2. **Feedback SQLite isolation and recovery**
   - `CDSS_FEEDBACK_DIR` isolates test feedback storage from project `data/feedback`.
   - Corrupt SQLite files are moved to `*.corrupt` with a repository diagnostic event.
   - A clean SQLite database/schema is recreated automatically.

3. **Test suite stability**
   - Added Patch21 non-regression tests for allergy polarity, SQLite recovery, monitoring, and clinician-feedback endpoints.
   - Added Makefile tier targets: `test-fast`, `test-safety`, `test-integration`, `test-release`.

4. **Clean notebook execution**
   - Added `notebooks/patch20_clean_evaluation.ipynb` that extracts the release zip into a fresh workdir and records whether any overlay was applied.
   - Added runbook `docs/runbooks/patch21_clean_notebook_execution.md`.

5. **Monitoring + human-in-the-loop endpoint tests**
   - Added `/v1/monitoring/performance`.
   - Added `/v1/feedback/clinician`.
   - Added `/v1/audit/traces/{trace_id}`.
   - Expanded overview metrics with dashboard aliases such as `requests_total`, `blocked_cases`, `human_review_cases`, `model_errors`, `doctor_correction_rate`, and `unsafe_generation_prevented_rate`.

Safety invariant: every generated prescription-like output is a draft and keeps `doctor_validation_required` / clinician-review semantics.

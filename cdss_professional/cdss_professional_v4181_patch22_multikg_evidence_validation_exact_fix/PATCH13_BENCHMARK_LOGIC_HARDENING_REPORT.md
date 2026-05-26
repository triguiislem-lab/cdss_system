# Patch 13 benchmark-driven logic hardening

This patch converts v3 benchmark failures into deterministic backend fixes.

## Main changes
- Runtime modes set to `enforce` for safety policy, medical-order extraction and post-generation validator in Kaggle/clinical envs.
- `/v1/prescriptions/analyze` now runs ClinicalUnderstanding + MedicalOrderExtraction + SafetyPolicyEngine + ExecutionPlanner, but still skips retrieval/generation.
- `PatientProfile.age_years` accepts fractional ages and derives `age_months`, preventing infant HTTP 422 for values like `0.17`.
- Added structured paracetamol/Doliprane overuse rule using already-taken medications plus repeated-dose/combination context.
- Added pediatric codeine-cough block.
- Added arabizi/franco-Arabic cues for fever, cough, already-taken and patient-requested medication language.
- Added Arabizi antibiotic-request policy and broader NSAID pregnancy/renal review policy.

## Intended benchmark impact
- `/analyze` should no longer mark safety-blocked cases as `prescription` simply because it skipped policy/planning.
- `/draft` should block Doliprane overuse, patient antibiotic requests, child codeine cough requests, and NSAID pregnancy/renal risks earlier.
- Infant cases using `age_years: 0.17` should validate.

All prescriptions remain drafts requiring doctor validation.

- Added `young_infant_fever_emergency` for fever in infants under 3 months.
- User-facing display_route now remains `review_blocked` when a true forbidden/policy block exists, even if missing audit fields are also present.

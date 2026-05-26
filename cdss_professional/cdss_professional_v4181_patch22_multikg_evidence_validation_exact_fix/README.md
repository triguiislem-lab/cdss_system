# Tunisia CDSS Runtime — Doctor-in-the-loop Clinical Evaluation Baseline

This project generates **draft** prescription/review packets for a qualified clinician. It never finalizes a prescription autonomously. Every output must be reviewed, edited, approved, or rejected by a doctor.

## Runtime policy

- `display_route=draft_prescription`: simple controlled draft candidate, doctor validation required.
- `display_route=review_draft_allowed`: higher-risk doctor-explicit draft may be shown for review, not final use.
- `display_route=review_blocked`: no medication draft; clinician review required.
- `display_route=missing_info`: critical patient data missing.
- `display_route=emergency`: outpatient draft suppressed, urgent escalation.
- `display_route=non_pharma`: medication draft suppressed.

## Key commands

```bash
make test
make verify
python tools/verify_data_integration.py
python tools/build_runtime_assets.py
python tools/package_release.py --root . --output ../cdss_release.zip
```

## Data authority

AMM/local catalog data is used for alias extraction, localization, and evidence support. It is **not** treated as treatment-decision authority. Clinical decisions remain governed by controlled indication/class/DCI maps, safety profiles, post-generation validation, and mandatory physician review.

## Feedback learning

Clinician feedback is stored as structured offline evaluation data only. Live automatic retraining is disabled.

## Demo fixtures

Demo fixture files are packaged separately as `demo_only.zip` and are not included in the main runtime release.


## Patch21 professional stabilization

Patch21 hardens the Patch20 release with explicit allergy evidence polarity, centralized `BusinessDecision` routing semantics, isolated/recoverable feedback SQLite storage, real monitoring and clinician-feedback endpoint contracts, and a clean zip-only evaluation notebook template. All generated medication outputs remain drafts requiring physician validation.

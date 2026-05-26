# Patch 5 Implementation Report

Focus: negated authorization verbs and plain-mention target policy.

## Changes

- Added explicit detection for negated authorization constructions such as:
  - `ne prescrit pas X`
  - `ne recommande pas X`
  - `ne donne pas X`
  - `ne conseille pas X`
  - English variants such as `do not prescribe X` and `not recommended X`.
- Added discontinuation/stop detection for:
  - `arrête X`, `stoppe X`, `suspend X`, `interrompt X`
  - `X à arrêter`, `X à stopper`.
- Changed explicit medication target policy:
  - `authorized` medication mentions can become prescription targets.
  - `requested_not_authorized` and `mentioned_not_authorized` no longer become prescription targets by themselves.
  - symptom/class planning can still independently propose a candidate when clinically supported.
- Updated case classification so plain medication mentions and patient-only medication requests do not trigger the explicit-medicine workflow.
- Added Patch 5 regression tests.

## Validation

- `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q` -> 106 passed, 1 skipped.
- `python -m compileall -q apps libs services tools tests` -> OK.
- `python tools/run_v4181_preplanning_smoke.py` -> OK.
- `python tools/run_staged_activation_smoke.py` -> OK.
- `python tools/run_professional_validation_suite.py` -> OK, pass_rate=1.0.

## Safety effect

The system now fails closed for plain medication mentions and patient-only requests, and blocks medicines explicitly negated through prescribing/recommendation/stop language.

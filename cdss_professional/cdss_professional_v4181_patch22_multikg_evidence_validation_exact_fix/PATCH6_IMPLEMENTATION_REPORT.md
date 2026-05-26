# Patch 6 Implementation Report

Patch 6 focuses on clinical language edge cases and target-policy hardening after Patch 5.

## Implemented changes

1. Expanded negation handling for clinician instructions:
   - `il ne faut pas donner/prescrire X`
   - `à ne pas donner/prescrire X`
   - `déconseille/deconseille X`
   - `non recommandé/non recommande X`
   - English contractions such as `doesn't prescribe`, `don't recommend`, `isn't recommended`
   - short `No X` patterns when immediately attached to the medicine

2. Continued protection for negative allergy statements:
   - `No allergy X`, `Aucune allergie X`, `Pas d allergie X` do not forbid X and do not create a prescription target.

3. Applied the Patch 5 plain-mention policy to therapeutic classes:
   - Authorized clinician class mention -> controlled DCI candidate allowed.
   - Patient-requested class mention -> review context only.
   - Plain class mention -> review/no target.
   - Symptom-supported mappings can still independently propose a candidate.

4. Preserved repeated same-DCI mentions with different strengths/spans:
   - Deduplication now keeps same medication when strength, route, or span differs.

5. Strengthened anticoagulant + NSAID request handling:
   - NSAID class/ingredient mention with anticoagulant context forbids common NSAID candidates pending review.

6. Expanded asthma row condition terms:
   - Added `asthmatique` and `asthmatic` to controlled asthma/wheezing mapping.

## Tests added

Patch 6 adds regression coverage for:

- `Il ne faut pas donner/prescrire Doliprane`
- `À ne pas donner/prescrire Doliprane`
- `déconseille/deconseille Doliprane`
- `Doliprane non recommandé`
- `Doctor doesn't prescribe Doliprane`
- `Doliprane isn't recommended`
- `No Doliprane`
- plain class mention: `Antalgique?`
- patient-requested class mention: `Patient demande un antalgique`
- authorized class still mapping to paracetamol
- symptom-supported class request still mapping through controlled symptom indication
- repeated same DCI with different strengths preserved
- `No allergy Doliprane` not forbidden and not a prescription target

## Validation

- `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q`: 114 passed, 1 skipped
- `python -m compileall -q apps libs services tools tests`: OK
- `python tools/run_v4181_preplanning_smoke.py`: OK
- `python tools/run_staged_activation_smoke.py`: OK
- `python tools/run_professional_validation_suite.py`: OK, pass_rate = 1.0

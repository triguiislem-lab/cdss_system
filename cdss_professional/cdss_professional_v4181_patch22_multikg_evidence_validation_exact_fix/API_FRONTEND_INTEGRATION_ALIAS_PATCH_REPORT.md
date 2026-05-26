# API Frontend Integration Alias Patch Report

## Objective

This patch makes FastAPI request parsing robust for real integration payloads, not only internal backend canonical payloads.

The API now accepts:

- snake_case backend fields;
- camelCase frontend fields;
- MedCity-style patient fields;
- French/English speaker labels;
- medication draft aliases such as `drug`, `dci`, `doseText`, `posology`, `voie`.

## Files changed

- `libs/contracts/patient.py`
- `libs/contracts/prescription.py`
- `apps/api/schemas.py`
- `tests/unit/test_api_endpoint_contracts.py`

## Implemented normalization

### ConsultationRequest

Accepted request aliases:

- `requestId` → `request_id`
- `traceId` → `request_id`
- `patientProfile` → `patient`
- `clinicalContext`, `visit`, `encounter` → `consultation`

### PatientProfile

Accepted aliases:

- `id`, `patientId` → `patient_id`
- `age`, `ageYears` → `age_years`
- `weightKg`, `weight`, `poids` → `weight_kg`
- `allergies`, `knownAllergies` → `known_allergies`
- `currentMedications`, `medications`, `treatments` → `current_medications`
- `chronicConditions`, `conditions`, `antecedents` → `chronic_conditions`
- `pregnancyStatus`, `grossesse` → `pregnancy_status`
- `renalImpairment`, `insuffisance_renale` → `renal_impairment`
- `hepaticImpairment`, `insuffisance_hepatique` → `hepatic_impairment`

Sex normalization:

- `F`, `femme`, `woman` → `female`
- `M`, `homme`, `man` → `male`

List normalization:

- accepts arrays, comma-separated strings, and arrays of objects with `name`, `label`, `text`, or `value`.

### TranscriptTurn

Accepted text aliases:

- `message`, `utterance`, `content`, `note`, `body` → `text`

Speaker normalization:

- `medecin`, `médecin`, `dr`, `physician`, `clinician` → `doctor`
- `user`, `malade` → `patient`

### ConsultationInput

Accepted notes aliases:

- `doctorNotes`, `clinicalNotes`, `clinical_notes`, `chiefComplaint`, `rawText`, `summary` → `doctor_notes`

Accepted transcript aliases:

- `conversation`, `dialogue`, `messages` → `transcript`

### MedicationDraft

Accepted aliases:

- `drug`, `dci`, `medication`, `activeIngredient`, `ingredient` → `active_ingredient`
- `reason`, `diagnosis`, `condition` → `indication`
- `doseText`, `dosage`, `posology`, `posologie` → `dose`
- `frequencyText`, `freq`, `schedule` → `frequency`
- `durationText`, `days` → `duration`
- `routeText`, `voie` → `route`
- `warnings`, `safetyNotes` → `safety_considerations`

### TherapeuticPlan

Accepted aliases:

- `problemSummary`, `summary`, `diagnosis` → `problem_summary`
- `nonDrugRecommendations`, `advice`, `recommendations` → `non_drug_recommendations`
- `triageRecommendation` → `triage_recommendation`

## Validation

Executed:

```bash
python -m compileall libs services apps tests
pytest -q tests/unit/test_api_endpoint_contracts.py tests/unit/test_prescriptions_api.py
pytest -q tests/unit/test_pipeline.py tests/unit/test_patch17_strict_clinical_contracts.py tests/unit/test_patch18_business_logic_core.py tests/unit/test_patch20_release_regression.py tests/unit/test_patch21_professional_stabilization.py tests/unit/test_patch22_multikg_evidence_validation.py tests/unit/test_safety_policy_engine.py
```

Results:

- API endpoint contract tests: passed
- Prescription API tests: passed
- Core business/safety/pipeline regression tests: passed
- Total targeted tests executed: 44 passed

## Notes

The project keeps real Kaggle runtime as primary source through `.env`:

- `KG_BACKEND=kuzu`
- `VECTOR_BACKEND=faiss`
- `LOCAL_FORMULARY_BACKEND=sqlite_tn_localization`

The alias patch does not change the clinical decision logic. It only improves payload parsing for integration.

# Hybrid extraction + controlled therapy planner implementation

Implemented an incremental architecture that makes extraction more structured and routes medication choice through controlled rules rather than free LLM generation.

## Main changes

### 1. Unicode/Arabic normalization bug fixed

Updated `libs/utils/medical_text.py`:

- `normalize_search_text()` now preserves Arabic characters (`\u0600-\u06FF`).
- `contains_any()` ignores normalized empty terms.

This prevents Arabic terms such as `سخانة` from normalizing to an empty string and falsely matching every input.

### 2. Structured extraction contract expanded

Updated `services/order_extraction/contracts.py`:

- Added `ClinicalMention`.
- Added `TherapeuticClassMention`.
- Expanded `MedicalOrder` with product/strength/route/source span fields.
- Expanded `MedicalOrderExtractionResult` with:
  - `therapeutic_class_mentions`
  - `symptom_mentions`
  - `risk_mentions`
  - `red_flag_mentions`
  - `requested_therapeutic_classes`
  - `authorized_therapeutic_classes`
  - `case_type`
  - `extraction_conflicts`
  - `missing_critical_information`

Supported `case_type` values:

- `explicit_medicine`
- `therapeutic_class_only`
- `symptom_only`
- `mixed`
- `emergency`
- `unclear`

### 3. Medical order extraction strengthened

Reworked `services/order_extraction/service.py`:

- Loads medication aliases from `data/runtime/tn_medication_aliases.csv`.
- Loads therapeutic class aliases from `data/runtime/tn_therapeutic_class_aliases.csv`.
- Extracts and classifies:
  - explicit medicine mentions
  - therapeutic class mentions
  - symptoms
  - risks
  - red flags
- Distinguishes authorization states:
  - `authorized`
  - `requested_not_authorized`
  - `already_taken`
  - `mentioned_not_authorized`
  - `historical`
  - `negated_or_avoid`
- Parses nearby strength and route when available.
- Merges accepted Level-1 Qwen extraction context conservatively.

### 4. Qwen Level-1 extraction extended

Updated `services/clinical_understanding/llm_extractor.py`:

- Qwen schema now supports:
  - `medication_mentions`
  - `therapeutic_class_mentions`
- Reconciler stores accepted structured mentions in `snapshot.extracted_context`.
- Qwen remains Level-1 only: it extracts explicit facts but does not select treatment or DCI.

### 5. Controlled `IndicationTherapyPlanner` added

Added `services/planning/indication_therapy_planner.py`.

The planner consumes structured extraction and controlled CSV mappings to support the three workflows:

1. Explicit medicine mentioned:
   - use DCI from extraction, then safety/retrieval/localization.
2. Therapeutic class only:
   - class -> controlled DCI candidates.
3. Symptoms only:
   - symptoms/condition -> indication -> strategy -> therapeutic class -> controlled DCI candidates.

The planner outputs:

- `clinical_problems`
- `strategy`
- `therapeutic_classes`
- `candidate_ingredients`
- `avoid_classes`
- `forbidden_ingredients`
- `required_missing_data`
- `target_indications`
- `evidence_queries`
- `route_recommendation`
- `confidence`

### 6. ExecutionPlanner integrated with controlled planner

Updated `services/planning/execution_planner.py`:

- Uses `IndicationTherapyPlanner` instead of relying only on hardcoded `infer_targets()`.
- Keeps `infer_targets()` as a backward-compatible legacy helper.
- Adds the planner output to `ExecutionPlan.policy_audit["indication_therapy_planner"]`.
- Uses planner-selected targets for retrieval, KG, formulary, localization, and generation constraints.

### 7. Runtime mapping data added

Added:

- `data/runtime/tn_medication_aliases.csv`
- `data/runtime/tn_therapeutic_class_aliases.csv`
- `data/runtime/tn_indication_therapy_map.csv`

These are intentionally small seed tables. They are designed to be expanded with Tunisian formulary and clinician validation data.

### 8. Pipeline audit enriched

Updated `services/orchestration/pipeline.py`:

- `medical_order_audit` now includes:
  - `case_type`
  - therapeutic class mentions
  - symptom mentions
  - red flag mentions
  - requested/authorized therapeutic classes

### 9. Tests added

Added `tests/unit/test_hybrid_extraction_and_indication_planner.py` covering:

- Arabic normalization / no empty-string symptom false positives.
- Class-only `antalgique -> paracetamol` planning.
- Antibiotic class request in viral URI routed to review without free DCI choice.
- Chest-pain red flags routed to emergency before candidate selection.

## Validation

Full test suite result:

```text
82 passed, 1 skipped
```

## Important activation note

The project still preserves staged defaults in `RuntimePipelineConfig`:

```python
medical_order_extraction_mode = "off"
safety_policy_mode = "audit"
post_generation_validator_mode = "off"
```

So the new extraction layer is available and tested, but full pipeline use still depends on runtime configuration. For stronger clinical testing, run with medical order extraction enabled and safety/post-generation validation progressively moved from `audit` to `enforce` after false-positive review.

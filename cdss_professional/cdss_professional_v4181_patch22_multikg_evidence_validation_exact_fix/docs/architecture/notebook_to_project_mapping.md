# Notebook to Project Mapping

## Large operational notebook
Use as the source of **capabilities**:

- `HybridRetriever` -> `services/retrieval/hybrid_retriever.py`
- `Neo4jRetriever` -> `services/retrieval/kg_retriever.py`
- `_retrieve_vs_core` -> `services/retrieval/vector_retriever.py`
- `_retrieve_kg_core` -> `services/retrieval/kg_retriever.py`
- `_fuse_context_core` -> `services/retrieval/evidence_fuser.py`
- `prescribe` -> `services/orchestration/pipeline.py`
- `_generate_prescription_core` -> `services/generation/prescription_generator.py`
- `SafetyLayer` -> `services/safety/service.py`
- `_validate_tn_output_core` -> `services/localization/tunisia_localizer.py`
- `PrescriptionAuditLogger` -> `services/audit/service.py`

## Refactored notebook
Use as the source of **architecture shape**:

- `RuntimePipelineConfig` -> `libs/config/runtime.py`
- `PatientSnapshot` -> `libs/contracts/patient.py`
- `MedicationDraft` -> `libs/contracts/prescription.py`
- `SafetyFinding` -> `libs/contracts/safety.py`
- `PipelineExecutionRecord` -> `libs/contracts/execution.py`
- `DeterministicPrescriptionPipeline` -> `services/orchestration/pipeline.py`
- `TunisiaLocalizer` -> `services/localization/tunisia_localizer.py`
- `AuditLogger` -> `services/audit/service.py`

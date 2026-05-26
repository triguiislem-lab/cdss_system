"""Registry of notebook functions/classes that should be migrated into project modules.

Use this as a checklist while porting notebook code into the repo.
"""

NOTEBOOK_SYMBOL_TARGETS = {
    "HybridRetriever": "services/retrieval/hybrid_retriever.py",
    "Neo4jRetriever": "services/retrieval/kg_retriever.py",
    "_retrieve_vs_core": "services/retrieval/vector_retriever.py",
    "_retrieve_kg_core": "services/retrieval/kg_retriever.py",
    "_fuse_context_core": "services/retrieval/evidence_fuser.py",
    "prescribe": "services/orchestration/pipeline.py + services/generation/prescription_generator.py",
    "_generate_prescription_core": "services/generation/prescription_generator.py",
    "SafetyLayer": "services/safety/service.py",
    "_validate_tn_output_core": "services/localization/tunisia_localizer.py",
    "PrescriptionAuditLogger": "services/audit/service.py",
}

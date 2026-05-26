from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from libs.config.runtime import RuntimePipelineConfig


class AppSettings(BaseSettings):
    """Environment and infrastructure settings."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True)

    app_name: str = "Clinical Prescription System"
    app_env: str = "kaggle"
    api_prefix: str = "/v1"
    log_level: str = "INFO"

    kg_backend: str = "kuzu"
    vector_backend: str = "faiss"
    vector_fallback_backend: str = "faiss"
    local_formulary_backend: str = "sqlite_tn_localization"
    llm_backend: str = "openai_compatible"
    localization_market: str = "TN"
    audit_backend: str = "file"
    audit_dir: str = "data/audit"
    feedback_dir: str = "data/feedback"
    feedback_backend: str = "sqlite"  # sqlite | jsonl
    enable_debug_patient_history: bool = False
    generation_temperature: float = 0.0
    generation_max_output_tokens: int = 800
    generation_backend: str = "openai_compatible"
    generation_model: str = "Qwen3-32B"
    generation_base_url: str = "http://127.0.0.1:8000/v1"
    generation_api_key: str = ""
    generation_system_prompt: str = ""
    generation_timeout_seconds: float = 45.0
    generation_transformers_device_map: str = "auto"
    generation_transformers_dtype: str = "auto"
    generation_trust_remote_code: bool = True
    llama_cpp_model_path: str = ""
    llama_cpp_n_gpu_layers: int = 0

    # Optional Level-1 Qwen-assisted extraction. Keep disabled by default;
    # when enabled, the selective policy only calls Qwen for complex/uncertain
    # extraction cases.
    clinical_llm_extraction_enabled: bool = False
    clinical_llm_extraction_mode: str = "shadow"  # shadow first, then assist after validation
    clinical_llm_extraction_policy: str = "selective"  # selective | always | never
    clinical_llm_extraction_backend: str = ""
    clinical_llm_extraction_model: str = ""
    clinical_llm_extraction_temperature: float = 0.0
    clinical_llm_extraction_max_output_tokens: int = 700
    clinical_llm_extraction_confidence_threshold: float = 0.65

    # MEDIQA-OE style Qwen medical-order/event extraction. This uses Qwen for
    # structured understanding, while safety/planning stays deterministic.
    medical_order_llm_extraction_enabled: bool = False
    medical_order_llm_extraction_mode: str = "assist"  # assist | shadow | off
    medical_order_llm_extraction_policy: str = "selective"  # selective | always | never
    medical_order_llm_extraction_backend: str = ""
    medical_order_llm_extraction_model: str = ""
    medical_order_llm_extraction_temperature: float = 0.0
    medical_order_llm_extraction_max_output_tokens: int = 1800
    medical_order_llm_extraction_confidence_threshold: float = 0.60
    
    # Model configurations
    vector_embedding_model: str = "BAAI/bge-m3"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    reranker_fallback_model: str = "cross-encoder/ms-marco-MiniLM-L6-v2"
    translation_model: str = "facebook/nllb-200-distilled-1.3B"
    deduplication_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    llm_model: str = "Qwen3-32B"
    
    require_clinician_review: bool = True
    localize_blocked_plans: bool = False
    clinical_deployment_mode: bool = False
    deployment_manifest_path: str = "data/governance/deployment_approval_manifest.json"

    # Production hardening switches. Defaults are fail-closed; demo fixtures are
    # only used when the corresponding backend is explicitly set to "stub" or
    # ALLOW_STUB_FALLBACKS=true.
    allow_stub_fallbacks: bool = False
    fail_closed_evidence_filters: bool = True
    kg_curated_fallback_enabled: bool = True
    deduplication_enabled: bool = False
    strict_runtime_readiness: bool = True
    allow_unsafe_validator_off: bool = False

    vector_fixture_path: str = "examples/demo_fixtures/vector_chunks_stub.json"
    vector_corpus_path: str = Field(default="/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases/faiss/tn_prescription_evidence_metadata.jsonl", validation_alias=AliasChoices("VECTOR_CORPUS_PATH", "EVIDENCE_METADATA_JSONL_PATH"))
    vector_faiss_index_path: str = Field(default="", validation_alias=AliasChoices("VECTOR_FAISS_INDEX_PATH", "EVIDENCE_FAISS_PATH"))
    vector_faiss_metadata_path: str = Field(default="", validation_alias=AliasChoices("VECTOR_FAISS_METADATA_PATH", "EVIDENCE_METADATA_PATH"))
    vector_faiss_stats_path: str = Field(default="", validation_alias=AliasChoices("VECTOR_FAISS_STATS_PATH", "EVIDENCE_VECTOR_STATS_PATH"))
    vector_query_instruction: str = Field(default="", validation_alias=AliasChoices("VECTOR_QUERY_INSTRUCTION", "EVIDENCE_QUERY_INSTRUCTION"))
    vector_fallback_faiss_index_path: str = ""
    vector_fallback_faiss_metadata_path: str = ""
    vector_fallback_faiss_stats_path: str = Field(default="", validation_alias=AliasChoices("VECTOR_FALLBACK_FAISS_STATS_PATH", "VECTOR_FALLBACK_STATS_PATH"))
    vector_pickle_metadata_path: str = ""
    vector_pickle_texts_path: str = ""

    localization_db_path: str = Field(default="", validation_alias=AliasChoices("LOCALIZATION_DB_PATH", "TN_LOCALIZATION_SQLITE_PATH"))
    formulaire_reconciliation_db_path: str = Field(default="", validation_alias=AliasChoices("FORMULAIRE_RECONCILIATION_DB_PATH", "FORMULAIRE_SQLITE_PATH"))

    # TN Med DB v1 structured enrichment layer. Disabled by default for local
    # tests, enabled in Kaggle runtime via .env.kaggle. This datasource fills
    # therapeutic class/subclass, substances, indications, price/reimbursement,
    # raw evidence summaries and candidate heuristic-rule summaries.
    tn_med_enabled: bool = Field(default=False, validation_alias=AliasChoices("TN_MED_ENABLED", "TN_MED_DB_ENABLED"))
    tn_med_data_root: str = Field(default="/kaggle/input/datasets/islemtrigui6/tn-med-db-v1", validation_alias=AliasChoices("TN_MED_DATA_ROOT", "TN_MED_ROOT"))
    tn_med_db_path: str = Field(default="", validation_alias=AliasChoices("TN_MED_DB_PATH", "TN_MED_SQLITE_PATH"))
    tn_med_required_for_readiness: bool = Field(default=False, validation_alias=AliasChoices("TN_MED_REQUIRED_FOR_READINESS", "TN_MED_READINESS_REQUIRED"))
    tn_med_top_k: int = Field(default=4, validation_alias=AliasChoices("TN_MED_TOP_K", "TN_MED_ENRICHMENT_TOP_K"))

    cdss_runtime_data_root: str = Field(default="/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases", validation_alias=AliasChoices("CDSS_RUNTIME_DATA_ROOT", "CDSS_RUNTIME_SOURCE"))
    dci_synonyms_path: str = Field(default="", validation_alias=AliasChoices("DCI_SYNONYMS_PATH", "TN_DCI_SYNONYMS_PATH"))
    medication_aliases_path: str = Field(default="", validation_alias=AliasChoices("MEDICATION_ALIASES_PATH", "TN_MEDICATION_ALIASES_PATH"))
    therapeutic_class_aliases_path: str = Field(default="", validation_alias=AliasChoices("THERAPEUTIC_CLASS_ALIASES_PATH", "TN_THERAPEUTIC_CLASS_ALIASES_PATH"))
    indication_therapy_map_path: str = Field(default="", validation_alias=AliasChoices("INDICATION_THERAPY_MAP_PATH", "TN_INDICATION_THERAPY_MAP_PATH"))
    class_to_dci_map_path: str = Field(default="", validation_alias=AliasChoices("CLASS_TO_DCI_MAP_PATH", "TN_CLASS_TO_DCI_MAP_PATH"))
    dci_safety_profiles_path: str = Field(default="", validation_alias=AliasChoices("DCI_SAFETY_PROFILES_PATH", "TN_DCI_SAFETY_PROFILES_PATH"))
    dci_dosing_rules_path: str = Field(default="", validation_alias=AliasChoices("DCI_DOSING_RULES_PATH", "TN_DCI_DOSING_RULES_PATH"))

    kg_fixture_path: str = "examples/demo_fixtures/kg_facts_stub.json"
    kg_json_path: str = ""
    kg_catalog_path: str = Field(default="/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases/kuzu_build_csv/kuzu_kg_relations.csv", validation_alias=AliasChoices("KG_CATALOG_PATH", "KG_RELATIONS_CSV_PATH"))
    kg_kuzu_db_path: str = Field(default="", validation_alias=AliasChoices("KG_KUZU_DB_PATH", "KUZU_DB_PATH"))
    kg_backup_kuzu_db_path: str = Field(default="", validation_alias=AliasChoices("KG_BACKUP_KUZU_DB_PATH", "HETIONET_PRIMEKG_KUZU_DB_PATH"))
    hetionet_primekg_kuzu_db_path: str = Field(default="", validation_alias=AliasChoices("HETIONET_PRIMEKG_KUZU_DB_PATH", "KG_BACKUP_KUZU_DB_PATH"))
    kg_backup_backend: str = ""
    kg_backup_enabled: bool = False
    kg_backup_score_multiplier: float = 0.92
    kg_backup_min_support_facts: int = 3
    kg_backup_reserved_limit: int = 8
    kg_source_mode: str = "primary_plus_backups"
    neo4j_uri: str = ""
    neo4j_user: str = ""
    neo4j_password: str = ""
    neo4j_database: str = "neo4j"

    local_formulary_fixture_path: str = "examples/demo_fixtures/local_formulary_stub.json"
    local_formulary_catalog_path: str = Field(default="", validation_alias=AliasChoices("LOCAL_FORMULARY_CATALOG_PATH", "AMM_CATALOG_PATH"))

    safety_rules_fixture_path: str = "examples/demo_fixtures/safety_rules_stub.json"
    vei_fixture_path: str = "examples/demo_fixtures/vei_stub.json"
    benchmark_scenarios_dir: str = "examples/scenarios"

    # V4.18-V4.23 staged activation flags.  Keep most components off/passive
    # by default so the source can contain the full architecture without a
    # big-bang runtime behavior change.
    safety_policy_mode: str = "enforce"
    clinical_action_enabled: bool = True
    medical_order_extraction_mode: str = "enforce"
    post_generation_validator_mode: str = "enforce"
    multilingual_retrieval_enabled: bool = False
    multilingual_translation_enabled: bool = False
    multilingual_reranker_enabled: bool = False
    professional_validation_enabled: bool = True
    multilingual_nllb_model_path: str = ""
    multilingual_e5_model_path: str = ""
    multilingual_minilm_reranker_path: str = ""
    multilingual_alias_model_path: str = ""
    allow_online_model_download: bool = False

    @model_validator(mode="after")
    def enforce_clinical_safety_modes(self):
        clinical_envs = {"staging", "prod", "production", "clinical", "clinical_eval"}
        env = (self.app_env or "").lower()
        clinical_like = self.clinical_deployment_mode or env in clinical_envs
        if clinical_like and not self.allow_unsafe_validator_off:
            if (self.post_generation_validator_mode or "").lower() != "enforce":
                raise ValueError("POST_GENERATION_VALIDATOR_MODE must be enforce in clinical/staging/prod runtime.")
            if (self.safety_policy_mode or "").lower() != "enforce":
                raise ValueError("SAFETY_POLICY_MODE must be enforce in clinical/staging/prod runtime.")
            if (self.medical_order_extraction_mode or "").lower() != "enforce":
                raise ValueError("MEDICAL_ORDER_EXTRACTION_MODE must be enforce in clinical/staging/prod runtime.")
        return self

    def to_runtime_config(self) -> RuntimePipelineConfig:
        return RuntimePipelineConfig(
            market=self.localization_market,
            generation_backend=self.generation_backend or self.llm_backend,
            generation_temperature=self.generation_temperature,
            generation_max_output_tokens=self.generation_max_output_tokens,
            require_clinician_review=self.require_clinician_review,
            localize_blocked_plans=self.localize_blocked_plans,
            safety_policy_mode=self.safety_policy_mode,
            clinical_action_enabled=self.clinical_action_enabled,
            medical_order_extraction_mode=self.medical_order_extraction_mode,
            post_generation_validator_mode=self.post_generation_validator_mode,
            multilingual_retrieval_enabled=self.multilingual_retrieval_enabled,
            multilingual_translation_enabled=self.multilingual_translation_enabled,
            multilingual_reranker_enabled=self.multilingual_reranker_enabled,
            professional_validation_enabled=self.professional_validation_enabled,
        )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()

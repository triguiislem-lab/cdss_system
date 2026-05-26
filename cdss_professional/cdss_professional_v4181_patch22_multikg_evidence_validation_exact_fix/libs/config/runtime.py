from pydantic import BaseModel, Field


class RuntimePipelineConfig(BaseModel):
    """Per-run operational knobs for the drafting pipeline."""

    top_k_vector_results: int = Field(default=5, ge=1)
    top_k_graph_facts: int = Field(default=5, ge=1)
    max_local_product_candidates: int = Field(default=5, ge=1)
    require_clinician_review: bool = True
    locale: str = "fr-TN"
    market: str = "TN"
    generation_backend: str = "notebook_heuristic"
    generation_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    generation_max_output_tokens: int = Field(default=400, ge=32)
    localize_blocked_plans: bool = False

    # Staged activation flags. Defaults preserve existing behavior while
    # allowing components to be enabled one at a time in the notebook/API.
    safety_policy_mode: str = "audit"  # off | audit | enforce
    clinical_action_enabled: bool = False
    medical_order_extraction_mode: str = "off"  # off | audit | enforce
    post_generation_validator_mode: str = "off"  # off | audit | enforce
    multilingual_retrieval_enabled: bool = False
    multilingual_translation_enabled: bool = False
    multilingual_reranker_enabled: bool = False
    professional_validation_enabled: bool = True
    @classmethod
    def dev_safe(cls) -> "RuntimePipelineConfig":
        return cls(
            safety_policy_mode="audit",
            clinical_action_enabled=True,
            medical_order_extraction_mode="audit",
            post_generation_validator_mode="audit",
            professional_validation_enabled=True,
        )

    @classmethod
    def production_locked(cls) -> "RuntimePipelineConfig":
        return cls(
            safety_policy_mode="enforce",
            clinical_action_enabled=True,
            medical_order_extraction_mode="enforce",
            post_generation_validator_mode="enforce",
            professional_validation_enabled=True,
        )

    @classmethod
    def clinical_safe_test(cls) -> "RuntimePipelineConfig":
        """Safer explicit preset for controlled clinical validation runs.

        Defaults remain conservative/backward-compatible, but direct pipeline
        callers can opt into a professional test profile without relying on
        environment variables.
        """
        return cls(
            safety_policy_mode="enforce",
            clinical_action_enabled=True,
            medical_order_extraction_mode="enforce",
            post_generation_validator_mode="enforce",
            professional_validation_enabled=True,
        )


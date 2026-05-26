from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

EvidenceChannel = Literal["local_formulary", "kg", "vector_prescription", "vector_fallback", "formulaire_tunisien"]


class EvidenceChunk(BaseModel):
    source: str
    title: str
    content: str
    score: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeGraphFact(BaseModel):
    subject: str
    predicate: str
    object: str
    score: float = 0.0
    provenance: str | None = None
    kg_source: str | None = None
    support_only: bool = False


class LocalProductEvidence(BaseModel):
    product_name: str
    active_ingredient: str
    strength: str
    dosage_form: str
    market: str = "TN"
    score: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalQuery(BaseModel):
    source: Literal["vector", "kg", "local_formulary"]
    text: str
    limit: int = Field(default=5, ge=1)
    rationale: str | None = None
    filters: dict[str, str] = Field(default_factory=dict)


class RetrievalPlan(BaseModel):
    primary_terms: list[str] = Field(default_factory=list)
    patient_context_tokens: list[str] = Field(default_factory=list)
    queries: list[RetrievalQuery] = Field(default_factory=list)
    expected_active_ingredient: str | None = None
    expected_active_ingredients: list[str] = Field(default_factory=list)


class EvidenceHit(BaseModel):
    channel: EvidenceChannel
    source_system: str
    source_name: str | None = None
    source_priority: int | None = None
    quality_tier: str | None = None
    evidence_rank: int | None = None
    accepted_for_clinical_use: bool | None = None
    accepted_for_runtime_retrieval: bool | None = None
    clinically_authoritative: bool | None = None
    requires_rcp_verification: bool | None = None
    section_kind: str | None = None
    active_ingredient: str | None = None
    product_name: str | None = None
    route: str | None = None
    form: str | None = None
    strength: str | None = None
    semantic_score: float | None = None
    final_score: float | None = None
    # V4.3: short content excerpt used by Qwen prompt and audit.
    # This keeps the selected-evidence prompt grounded without reverting to a flat raw corpus.
    content_excerpt: str | None = None
    why_selected: str = ""
    why_rejected: str | None = None
    fallback_used: bool = False
    page: int | None = None
    content_hash: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceQualitySummary(BaseModel):
    local_product_candidates: int = 0
    localized_product_verified: bool = False
    local_evidence_count: int = 0
    fallback_evidence_count: int = 0
    support_only_count: int = 0
    accepted_for_clinical_use_count: int = 0
    accepted_for_runtime_retrieval_count: int = 0
    clinically_authoritative_count: int = 0
    requires_rcp_verification_count: int = 0
    top_source_system: str | None = None
    kg_safety_facts_count: int = 0
    kg_treatment_facts_count: int = 0
    kg_contraindication_facts_count: int = 0
    kg_interaction_facts_count: int = 0
    kg_dose_adjustment_facts_count: int = 0
    broad_vector_fallback_used: bool = False
    evidence_confidence: Literal["strong", "moderate", "weak", "fallback_only", "not_applicable"] = "weak"
    notes: list[str] = Field(default_factory=list)


class EvidenceBundle(BaseModel):
    vector_chunks: list[EvidenceChunk] = Field(default_factory=list)
    graph_facts: list[KnowledgeGraphFact] = Field(default_factory=list)
    local_products: list[LocalProductEvidence] = Field(default_factory=list)
    retrieval_plan: RetrievalPlan | None = None
    merged_summary: str = ""
    retrieval_diagnostics: dict[str, Any] = Field(default_factory=dict)
    evidence_hits: list[EvidenceHit] = Field(default_factory=list)
    rejected_evidence_hits: list[EvidenceHit] = Field(default_factory=list)
    evidence_quality_summary: EvidenceQualitySummary = Field(default_factory=EvidenceQualitySummary)

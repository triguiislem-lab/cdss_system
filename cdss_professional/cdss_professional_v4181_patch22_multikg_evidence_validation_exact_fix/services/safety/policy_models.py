from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field

class PolicyTrigger(BaseModel):
    structured_conditions: dict[str, Any] = Field(default_factory=dict)
    text_terms_any: list[str] = Field(default_factory=list)
    text_terms_all: list[str] = Field(default_factory=list)
    text_terms_group_all: list[list[str]] = Field(default_factory=list)
    negation_terms: list[str] = Field(default_factory=list)
    required_positive_evidence: bool = False

class PolicyAction(BaseModel):
    route_override: Literal["prescription", "review", "emergency", "non_pharma", "blocked"] | None = None
    allowed_to_generate: bool = True
    localization_required: bool = False
    forbidden_ingredients: list[str] = Field(default_factory=list)
    required_missing_data: list[str] = Field(default_factory=list)

class SafetyPolicyRule(BaseModel):
    rule_id: str
    version: str = "1.0.0"
    status: Literal["active", "inactive", "draft"] = "active"
    priority: int = 0
    category: str
    trigger: PolicyTrigger = Field(default_factory=PolicyTrigger)
    action: PolicyAction = Field(default_factory=PolicyAction)
    severity: str = "medium"
    safety_explanation: str
    source_refs: list[str] = Field(default_factory=list)
    audit_tags: list[str] = Field(default_factory=list)
    clinical_consequence: str | None = None
    mechanism: str | None = None
    management: str | None = None
    positive_test_examples: list[str] = Field(default_factory=list)
    negative_test_examples: list[str] = Field(default_factory=list)

class PolicyHit(BaseModel):
    rule_id: str
    version: str
    category: str
    priority: int
    severity: str
    route_override: str | None = None
    allowed_to_generate: bool
    forbidden_ingredients: list[str] = Field(default_factory=list)
    required_missing_data: list[str] = Field(default_factory=list)
    safety_explanation: str
    source_refs: list[str] = Field(default_factory=list)
    audit_tags: list[str] = Field(default_factory=list)
    matched_terms: list[str] = Field(default_factory=list)

class PolicyDecision(BaseModel):
    has_blocking_policy: bool = False
    route_override: str | None = None
    allowed_to_generate: bool = True
    localization_required: bool = True
    reason_code: str | None = None
    severity: str | None = None
    forbidden_ingredients: list[str] = Field(default_factory=list)
    required_missing_data: list[str] = Field(default_factory=list)
    safety_explanation: str | None = None
    policy_hits: list[PolicyHit] = Field(default_factory=list)
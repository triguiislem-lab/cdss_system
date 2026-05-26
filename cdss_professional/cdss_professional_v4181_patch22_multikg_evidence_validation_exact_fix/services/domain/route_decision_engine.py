from __future__ import annotations

from services.domain.clinical_case_classifier import ClinicalCaseClassifier
from services.domain.contracts import BusinessInputs, BusinessDecision, RouteDecision
from services.domain.allergy_evidence import compute_forbidden_ingredients, extract_allergy_evidence
from services.domain.generation_permission_policy import GenerationPermissionPolicy
from services.domain.medication_authorization_policy import MedicationAuthorizationPolicy
from services.domain.missing_information_policy import MissingInformationPolicy, LOW_RISK_PROTOCOL_TARGETS
from services.domain.utils import canonical_list, unique
from services.domain.business_rule_registry import BusinessRuleRegistry


class RouteDecisionEngine:
    """Central business source of truth for route and generation permission.

    Priority order:
    1. Emergency and non-pharma classification
    2. Blocking safety policy
    3. Medication authorization (patient request vs doctor authorization)
    4. Blocking missing clinical information
    5. Vulnerable context -> review_draft_allowed
    6. Low-risk protocol -> draft_prescription
    7. Conservative review fallback
    """

    def __init__(self):
        self.classifier = ClinicalCaseClassifier()
        self.authorization_policy = MedicationAuthorizationPolicy()
        self.missing_policy = MissingInformationPolicy()
        self.generation_policy = GenerationPermissionPolicy()
        self.rule_registry = BusinessRuleRegistry()

    def decide(self, *, snapshot, medical_orders=None, policy_decision=None, inputs: BusinessInputs | None = None) -> BusinessDecision:
        inputs = inputs or BusinessInputs()
        targets = canonical_list(inputs.candidate_targets)
        candidate_route = inputs.candidate_route if inputs.candidate_route in {"prescription", "review", "emergency", "non_pharma", "blocked"} else "review"
        classification = self.classifier.classify(snapshot, medical_orders=medical_orders)
        auth = self.authorization_policy.assess(medical_orders)
        policy_blocking = bool(policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False))
        policy_route = getattr(policy_decision, "route_override", None) if policy_decision is not None else None
        policy_forbidden = list(getattr(policy_decision, "forbidden_ingredients", []) or []) if policy_decision is not None else []
        policy_missing = list(getattr(policy_decision, "required_missing_data", []) or []) if policy_decision is not None else []
        all_missing = unique([*inputs.candidate_missing, *policy_missing])
        missing = self.missing_policy.evaluate(snapshot, targets, all_missing, inputs.required_safety_screens)
        allergy_evidence = extract_allergy_evidence(snapshot, medical_orders=medical_orders)
        allergy_forbidden = canonical_list(compute_forbidden_ingredients(allergy_evidence))
        forbidden = unique([*canonical_list(inputs.candidate_forbidden), *canonical_list(policy_forbidden), *auth.forbidden_by_extraction, *allergy_forbidden])
        reasons: list[str] = []
        rule_ids: list[str] = []

        route = candidate_route
        review_draft_allowed = bool(inputs.review_draft_allowed)

        if classification.emergency:
            route = "emergency"
            review_draft_allowed = False
            reasons.extend(classification.emergency_reasons)
            rule_ids.append("DOMAIN_EMERGENCY_PRECEDENCE")
        elif policy_blocking:
            route = policy_route if policy_route in {"review", "emergency", "non_pharma", "blocked"} else "review"
            review_draft_allowed = False
            reasons.append(getattr(policy_decision, "reason_code", None) or "blocking_policy")
            rule_ids.append("DOMAIN_BLOCKING_POLICY_PRECEDENCE")
        elif classification.non_pharma or (auth.has_only_non_actionable_mentions and not targets and (not auth.forbidden_by_extraction or candidate_route == "non_pharma")):
            route = "non_pharma"
            review_draft_allowed = False
            reasons.extend(classification.non_pharma_reasons or ["only_non_actionable_medication_mentions"])
            rule_ids.append("DOMAIN_NON_PHARMA_OR_NEGATED_ONLY")
        elif auth.has_only_non_actionable_mentions and not targets and auth.forbidden_by_extraction:
            route = "review"
            review_draft_allowed = False
            forbidden = unique([*forbidden, *auth.forbidden_by_extraction])
            reasons.append("non_actionable_forbidden_medication_mention_requires_review_audit")
            rule_ids.append("DOMAIN_NON_ACTIONABLE_FORBIDDEN_REVIEW")
        elif targets and set(targets) & set(auth.patient_requested_not_authorized):
            route = "review"
            review_draft_allowed = False
            forbidden = unique([*forbidden, *list(set(targets) & set(auth.patient_requested_not_authorized))])
            reasons.append("patient_requested_medication_without_doctor_authorization")
            rule_ids.append("DOMAIN_PATIENT_REQUEST_NOT_AUTHORIZED")
        elif targets and set(targets) & set(forbidden):
            route = "review"
            review_draft_allowed = False
            reasons.append("target_contraindicated_or_forbidden")
            rule_ids.append("DOMAIN_TRUE_CONTRAINDICATION_BLOCKS_GENERATION")
        elif review_draft_allowed:
            route = "review"
            rule_ids.append("DOMAIN_REVIEW_DRAFT_ALLOWED")
        elif missing.blocking:
            route = "review"
            review_draft_allowed = False
            reasons.append("blocking_missing_information")
            rule_ids.append("DOMAIN_BLOCKING_MISSING_INFO")
        elif candidate_route == "review" and forbidden:
            # A high-risk contextual block (for example a requested NSAID with
            # anticoagulant therapy) must stay in review even when an independent
            # low-risk symptomatic candidate exists. This prevents central
            # low-risk logic from laundering a risky patient request into a
            # direct draft.
            route = "review"
            review_draft_allowed = False
            reasons.append("forbidden_or_high_risk_context_requires_review")
            rule_ids.append("DOMAIN_FORBIDDEN_CONTEXT_REVIEW_PRECEDENCE")
        elif classification.vulnerable_context and targets and set(targets).issubset(LOW_RISK_PROTOCOL_TARGETS):
            route = "review"
            high_caution_vulnerabilities = {"pregnancy", "pregnancy_uncertain", "renal_impairment", "hepatic_impairment", "allergy_risk"}
            if set(classification.vulnerable_reasons) & high_caution_vulnerabilities:
                review_draft_allowed = False
                reasons.extend(classification.vulnerable_reasons)
                reasons.append("vulnerable_context_blocks_generation_until_clinician_review")
                rule_ids.append("DOMAIN_VULNERABLE_CONTEXT_BLOCKS_GENERATION")
            else:
                review_draft_allowed = True
                reasons.extend(classification.vulnerable_reasons)
                rule_ids.append("DOMAIN_VULNERABLE_LOW_RISK_REVIEW_DRAFT")
        elif targets and set(targets).issubset(LOW_RISK_PROTOCOL_TARGETS):
            route = "prescription"
            rule_ids.append("DOMAIN_LOW_RISK_PROTOCOL_DRAFT")
        elif not targets:
            route = "review"
            reasons.append("no_target_ingredient")
            rule_ids.append("DOMAIN_NO_TARGET_REVIEW")
        else:
            route = "review"
            reasons.append("target_not_low_risk_or_missing_business_rule")
            rule_ids.append("DOMAIN_CONSERVATIVE_REVIEW")

        patient_data_items = unique([
            item for item in [*missing.blocking, *missing.informative]
            if item not in set(inputs.required_safety_screens)
            and item not in {"hepatic_impairment", "renal_impairment", "overdose_risk", "duplicate_paracetamol", "interaction", "dose"}
        ])

        allowed, block_reason = self.generation_policy.decide(
            route=route,
            targets=targets,
            authorization=auth,
            missing=missing,
            policy_blocking=policy_blocking,
            emergency=route == "emergency",
            non_pharma=route == "non_pharma",
            review_draft_allowed=review_draft_allowed,
            snapshot=snapshot,
        )
        if block_reason:
            reasons.append(block_reason)

        if route == "emergency":
            display = "emergency"
            allowed = False
        elif route == "non_pharma":
            display = "non_pharma"
            allowed = False
        elif route == "review" and review_draft_allowed and allowed:
            display = "review_draft_allowed"
        elif route == "review" and missing.blocking and not forbidden and not policy_blocking:
            display = "missing_info"
        elif route == "review":
            display = "review_blocked"
            allowed = False
        elif route == "prescription" and allowed:
            display = "draft_prescription"
        else:
            display = "review_blocked"
            route = "review"
            allowed = False

        return BusinessDecision(
            route=route,
            display_route=display,
            allowed_to_generate=allowed,
            clinician_review_required=True,
            generation_block_reason=block_reason,
            block_reasons=unique(reasons),
            required_patient_data=patient_data_items,
            required_safety_screens=unique(inputs.required_safety_screens),
            forbidden_ingredients=forbidden,
            allergy_evidence=allergy_evidence,
            allergy_forbidden_ingredients=allergy_forbidden,
            target_ingredients=targets if allowed or display == "review_draft_allowed" else [],
            review_draft_allowed=bool(display == "review_draft_allowed"),
            missing_information=missing,
            business_rule_ids=unique(rule_ids),
            audit={
                "classification": classification.model_dump(mode="json"),
                "authorization": auth.model_dump(mode="json"),
                "candidate_route": candidate_route,
                "candidate_targets": targets,
                "policy_blocking": policy_blocking,
                "policy_route_override": policy_route,
                "business_rule_explanations": self.rule_registry.explain_many(unique(rule_ids)),
                "allergy_evidence": [ev.model_dump(mode="json") for ev in allergy_evidence],
                "allergy_forbidden_ingredients": allergy_forbidden,
            },
        )

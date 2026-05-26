from __future__ import annotations

from services.domain.contracts import MedicationAuthorizationAssessment, BusinessMissingInformation
from services.domain.missing_information_policy import LOW_RISK_PROTOCOL_TARGETS
from services.domain.utils import canonical_list, patient_context


class GenerationPermissionPolicy:
    """Determines whether automatic draft generation is allowed.

    This is intentionally conservative: if a case is not clearly low-risk or
    explicitly review-draft-allowed, generation is blocked and routed to review.
    """

    def decide(
        self,
        *,
        route: str,
        targets: list[str],
        authorization: MedicationAuthorizationAssessment,
        missing: BusinessMissingInformation,
        policy_blocking: bool,
        emergency: bool,
        non_pharma: bool,
        review_draft_allowed: bool,
        snapshot=None,
    ) -> tuple[bool, str | None]:
        targets_c = canonical_list(targets)
        target_set = set(targets_c)
        if emergency:
            return False, "emergency_route_blocks_generation"
        if non_pharma:
            return False, "non_pharma_route_blocks_generation"
        if policy_blocking and not review_draft_allowed:
            return False, "blocking_policy_blocks_generation"
        if target_set & set(authorization.patient_requested_not_authorized):
            return False, "patient_requested_medication_without_doctor_authorization"
        if target_set & set(authorization.forbidden_by_extraction):
            return False, "target_forbidden_by_extraction"
        if not targets_c:
            return False, "no_target_ingredient"
        if review_draft_allowed:
            # A review draft is a clinician-visible draft, never a final
            # prescription.  It is allowed only after an upstream business rule
            # has positively confirmed the required screens (for example, a
            # doctor-authorized NSAID with explicit negative risk screens).
            # Raw missing-information heuristics may still list generic items,
            # so this explicit allow path must be evaluated before the generic
            # missing-info block while still fail-closing on high-caution
            # patient context.
            ctx = patient_context(snapshot) if snapshot is not None else {}
            if ctx.get("pregnant") or ctx.get("pregnancy_uncertain") or ctx.get("renal_impairment") or ctx.get("hepatic_impairment") or ctx.get("allergy_risk"):
                return False, "high_caution_vulnerable_context_blocks_review_draft_generation"
            return True, None
        if missing.blocking:
            return False, "blocking_missing_information"
        if route == "prescription" and target_set.issubset(LOW_RISK_PROTOCOL_TARGETS):
            # Vulnerable contexts should be handled as review_draft_allowed by
            # RouteDecisionEngine before this branch.
            return True, None
        return False, "non_low_risk_or_unapproved_generation"

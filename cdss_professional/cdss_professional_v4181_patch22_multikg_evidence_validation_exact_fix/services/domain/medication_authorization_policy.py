from __future__ import annotations

from services.domain.contracts import MedicationAuthorizationAssessment
from services.domain.utils import as_list, canonical_list, canonical_from_mention, medication_mentions, mention_value, unique

NON_ACTIONABLE_STATUSES = {"not_currently_taking", "historical", "negated_or_avoid"}
MENTIONED_ONLY_STATUSES = {"mentioned_not_authorized"}
PATIENT_REQUEST_STATUSES = {"requested_not_authorized"}
AUTHORIZED_STATUSES = {"authorized"}
ALREADY_TAKEN_STATUSES = {"already_taken"}


class MedicationAuthorizationPolicy:
    """Business policy for actionability of medication mentions.

    Qwen/MEDIQA-OE and local extractors may mention medicines for many reasons.
    This policy is the single business source for deciding whether a mention can
    become a target, must be blocked, or is only audit context.
    """

    def assess(self, medical_orders) -> MedicationAuthorizationAssessment:
        requested: list[str] = []
        authorized: list[str] = []
        already_taken: list[str] = []
        non_actionable: list[str] = []
        forbidden: list[str] = []

        if medical_orders is not None:
            requested.extend(as_list(medical_orders.get("requested_medications", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "requested_medications", [])))
            authorized.extend(as_list(medical_orders.get("authorized_medications", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "authorized_medications", [])))
            already_taken.extend(as_list(medical_orders.get("already_taken_medications", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "already_taken_medications", [])))
            forbidden.extend(as_list(medical_orders.get("forbidden_ingredients", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "forbidden_ingredients", [])))

        for mention in medication_mentions(medical_orders):
            status = str(mention_value(mention, "authorization_status", "") or "")
            med = canonical_from_mention(mention)
            if not med:
                continue
            if status in PATIENT_REQUEST_STATUSES:
                requested.append(med)
            elif status in AUTHORIZED_STATUSES:
                authorized.append(med)
            elif status in ALREADY_TAKEN_STATUSES:
                already_taken.append(med)
            elif status in NON_ACTIONABLE_STATUSES:
                non_actionable.append(med)
                if status == "negated_or_avoid":
                    forbidden.append(med)
            elif status in MENTIONED_ONLY_STATUSES:
                # Plain mentions are ambiguous review context. They are not
                # actionable targets and not contraindications.
                pass

        requested_c = [x for x in canonical_list(requested) if x not in set(canonical_list(forbidden))]
        authorized_c = [x for x in canonical_list(authorized) if x not in set(canonical_list(forbidden))]
        already_c = canonical_list(already_taken)
        non_actionable_c = canonical_list(non_actionable)
        forbidden_c = canonical_list(forbidden)
        has_any_actionable = bool(requested_c or authorized_c or already_c)
        has_only_non_actionable = bool(non_actionable_c) and not has_any_actionable
        return MedicationAuthorizationAssessment(
            patient_requested_not_authorized=requested_c,
            doctor_authorized=authorized_c,
            already_taken=already_c,
            negated_or_historical=non_actionable_c,
            forbidden_by_extraction=forbidden_c,
            has_only_non_actionable_mentions=has_only_non_actionable,
        )

    def target_allowed_by_authorization(self, targets: list[str], assessment: MedicationAuthorizationAssessment) -> bool:
        target_set = set(canonical_list(targets))
        if not target_set:
            return False
        if target_set & set(assessment.patient_requested_not_authorized):
            return False
        if target_set & set(assessment.forbidden_by_extraction):
            return False
        # Symptom-protocol targets may be generated even without an explicit
        # doctor mention only if they are later approved by generation policy.
        return True

from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class PregnancyRules:
    """Runtime-augmented pregnancy safety checks."""

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        if not snapshot.patient.pregnant:
            return []
        rules = load_rules().get('pregnancy', {})
        blocked = {normalize_token(x) for x in rules.get('blocked', [])}
        caution = {normalize_token(x) for x in rules.get('caution', [])}
        findings: list[SafetyFinding] = [
            SafetyFinding(
                severity='warning',
                category='pregnancy',
                message='Pregnancy reported: review all proposed medications against pregnancy-safe local guidance.',
                blocked=False,
                rule_id='pregnancy.review_all',
                evidence_source=safety_source_label(),
                recommended_action='Confirm gestational age and preferred pregnancy-safe local product before final approval.',
            )
        ]
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            if med_name in blocked:
                findings.append(
                    SafetyFinding(
                        severity='critical',
                        category='pregnancy',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} is blocked in the runtime pregnancy guardrail set.",
                        blocked=True,
                        rule_id=f"pregnancy.blocked.{med_name}",
                        evidence_source=safety_source_label(),
                        recommended_action='Choose a pregnancy-compatible alternative and document clinician rationale.',
                    )
                )
            elif med_name in caution:
                findings.append(
                    SafetyFinding(
                        severity='warning',
                        category='pregnancy',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} requires pregnancy-specific clinician review.",
                        blocked=False,
                        rule_id=f"pregnancy.caution.{med_name}",
                        evidence_source=safety_source_label(),
                        recommended_action='Review trimester, indication, and safer alternatives before approval.',
                    )
                )
        return findings

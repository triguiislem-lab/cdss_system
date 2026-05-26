from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class RenalRules:
    """Runtime-augmented renal safety checks."""

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        if not snapshot.patient.renal_impairment:
            return []
        rules = load_rules().get('renal', {})
        blocked = {normalize_token(x) for x in rules.get('blocked', [])}
        caution = {normalize_token(x) for x in rules.get('caution', [])}
        findings: list[SafetyFinding] = [
            SafetyFinding(
                severity='warning',
                category='renal',
                message='Renal impairment present: review dose adjustment and nephrotoxic risk.',
                blocked=False,
                rule_id='renal.review_all',
                evidence_source=safety_source_label(),
                recommended_action='Add renal function values and confirm dose authority before finalizing.',
            )
        ]
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            if med_name in blocked:
                findings.append(
                    SafetyFinding(
                        severity='critical',
                        category='renal',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} is flagged for renal impairment review in the runtime guardrail set.",
                        blocked=True,
                        rule_id=f"renal.blocked.{med_name}",
                        evidence_source=safety_source_label(),
                        recommended_action='Avoid or replace with a renal-safer option unless specialist review supports use.',
                    )
                )
            elif med_name in caution:
                findings.append(
                    SafetyFinding(
                        severity='warning',
                        category='renal',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} may require renal dose adjustment or monitoring.",
                        blocked=False,
                        rule_id=f"renal.caution.{med_name}",
                        evidence_source=safety_source_label(),
                        recommended_action='Check eGFR/creatinine and adjust dose against local guidance.',
                    )
                )
        return findings

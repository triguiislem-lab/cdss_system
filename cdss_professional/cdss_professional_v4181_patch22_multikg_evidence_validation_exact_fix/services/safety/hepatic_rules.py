from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class HepaticRules:
    """Runtime-augmented hepatic safety checks."""

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        if not snapshot.patient.hepatic_impairment:
            return []
        rules = load_rules().get('hepatic', {})
        caution = {normalize_token(x) for x in rules.get('caution', [])}
        findings: list[SafetyFinding] = [
            SafetyFinding(
                severity='warning',
                category='hepatic',
                message='Hepatic impairment present: review total daily dose and liver-safe alternatives carefully.',
                blocked=False,
                rule_id='hepatic.review_all',
                evidence_source=safety_source_label(),
                recommended_action='Confirm liver disease severity and use the lowest-risk supported regimen.',
            )
        ]
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            if med_name in caution:
                findings.append(
                    SafetyFinding(
                        severity='warning',
                        category='hepatic_precaution',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} requires clinician review in hepatic impairment.",
                        blocked=False,
                        rule_id=f"hepatic.caution.{med_name}",
                        evidence_source=safety_source_label(),
                        recommended_action='Validate daily dose ceiling and consider a lower-risk alternative.',
                    )
                )
        return findings

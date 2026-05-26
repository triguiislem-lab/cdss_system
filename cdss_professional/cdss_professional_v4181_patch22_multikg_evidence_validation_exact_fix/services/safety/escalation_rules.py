from libs.contracts.patient import PatientSnapshot
from libs.contracts.safety import SafetyFinding


class EscalationRules:
    """Signals when the case should be escalated rather than automatically drafted."""

    def evaluate(self, snapshot: PatientSnapshot) -> list[SafetyFinding]:
        findings: list[SafetyFinding] = []
        if snapshot.risk_flags.escalation_needed:
            findings.append(
                SafetyFinding(
                    severity='critical',
                    category='escalation',
                    message='Case marked for escalation before draft approval.',
                    blocked=True,
                    rule_id='escalation.flagged',
                    recommended_action='Escalate to urgent clinician review or referral workflow before signing any prescription.',
                )
            )
        return findings

from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding, SafetyReport

from services.safety.allergy_rules import AllergyRules
from services.safety.contraindication_rules import ContraindicationRules
from services.safety.ddi_engine import DDIEngine
from services.safety.dose_guardrails import DoseGuardrails
from services.safety.escalation_rules import EscalationRules
from services.safety.hepatic_rules import HepaticRules
from services.safety.pregnancy_rules import PregnancyRules
from services.safety.renal_rules import RenalRules


class SafetyService:
    """Runs deterministic safety checks after generation."""

    def __init__(self) -> None:
        self.allergy_rules = AllergyRules()
        self.ddi_engine = DDIEngine()
        self.contra_rules = ContraindicationRules()
        self.pregnancy_rules = PregnancyRules()
        self.renal_rules = RenalRules()
        self.hepatic_rules = HepaticRules()
        self.dose_guardrails = DoseGuardrails()
        self.escalation_rules = EscalationRules()

    def validate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> SafetyReport:
        findings: list[SafetyFinding] = []
        findings.extend(self.allergy_rules.evaluate(snapshot, plan))
        findings.extend(self.ddi_engine.evaluate(snapshot, plan))
        findings.extend(self.contra_rules.evaluate(snapshot, plan))
        findings.extend(self.pregnancy_rules.evaluate(snapshot, plan))
        findings.extend(self.renal_rules.evaluate(snapshot, plan))
        findings.extend(self.hepatic_rules.evaluate(snapshot, plan))
        findings.extend(self.dose_guardrails.evaluate(plan))
        findings.extend(self.escalation_rules.evaluate(snapshot))
        deduped = self._dedupe(findings)
        ordered = sorted(deduped, key=lambda item: (item.severity != 'critical', item.category, item.message))
        return SafetyReport(findings=ordered)

    @staticmethod
    def _dedupe(findings: list[SafetyFinding]) -> list[SafetyFinding]:
        seen: set[tuple[str, str, str]] = set()
        deduped: list[SafetyFinding] = []
        for finding in findings:
            key = (finding.category, finding.medication or '', finding.message)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(finding)
        return deduped

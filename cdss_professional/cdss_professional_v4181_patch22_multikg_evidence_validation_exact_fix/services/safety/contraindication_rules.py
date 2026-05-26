from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class ContraindicationRules:
    """Runtime-augmented contraindication checks using extracted chronic conditions."""

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        condition_rules = load_rules().get('contraindications', {})
        conditions = [normalize_token(x) for x in snapshot.patient.chronic_conditions]
        findings: list[SafetyFinding] = []
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            for condition, blocked_meds in condition_rules.items():
                normalized_condition = normalize_token(condition)
                if any(normalized_condition in current for current in conditions) and med_name in [normalize_token(x) for x in blocked_meds]:
                    findings.append(
                        SafetyFinding(
                        severity='critical',
                        category='contraindication',
                        medication=med.active_ingredient,
                        message=f"{med.active_ingredient} is flagged in the runtime guardrail set for patients with {condition}.",
                        blocked=True,
                            rule_id=f"contra.{normalized_condition}.{med_name}",
                            evidence_source=safety_source_label(),
                            recommended_action='Reassess the indication and switch to a safer alternative before clinician approval.',
                        )
                    )
        return findings

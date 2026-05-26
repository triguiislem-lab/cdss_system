from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import infer_daily_frequency, load_rules, normalize_token, parse_first_number, safety_source_label


class DoseGuardrails:
    """Lightweight dose-format guardrails with simple daily-dose estimation."""

    def evaluate(self, plan: TherapeuticPlan) -> list[SafetyFinding]:
        findings: list[SafetyFinding] = []
        hepatic_limits = load_rules().get('hepatic', {}).get('max_daily_dose_mg', {})
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            if not med.dose or not med.frequency or not med.duration:
                findings.append(
                    SafetyFinding(
                        severity='critical',
                        category='dose_completeness',
                        medication=med.active_ingredient,
                        message=f"Incomplete dosing instructions for {med.active_ingredient}.",
                        blocked=True,
                        rule_id='dose.completeness',
                        recommended_action='Require a complete dose, frequency, and duration before clinician approval.',
                    )
                )
                continue
            dose_value = parse_first_number(med.dose)
            daily_frequency = infer_daily_frequency(med.frequency)
            if dose_value is None:
                findings.append(
                    SafetyFinding(
                        severity='warning',
                        category='dose_parse',
                        medication=med.active_ingredient,
                        message=f"Could not estimate numeric dose from '{med.dose}'.",
                        blocked=False,
                        rule_id='dose.parse',
                        recommended_action='Keep structured numeric dose fields in the production schema to avoid ambiguity.',
                    )
                )
                continue
            if daily_frequency is not None:
                daily_dose = dose_value * daily_frequency
                limit = hepatic_limits.get(med_name)
                if limit and daily_dose > float(limit):
                    findings.append(
                        SafetyFinding(
                            severity='critical',
                            category='dose_max_daily',
                            medication=med.active_ingredient,
                            message=f"Estimated daily dose for {med.active_ingredient} is {daily_dose:.0f} mg, above the conservative limit of {limit} mg/day.",
                            blocked=True,
                            rule_id=f"dose.max_daily.{med_name}",
                            evidence_source=safety_source_label(),
                            recommended_action='Lower the dose or frequency and verify against official local dose authority.',
                        )
                    )
        return findings

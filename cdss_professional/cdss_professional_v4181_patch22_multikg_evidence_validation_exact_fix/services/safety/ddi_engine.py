from itertools import combinations

from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class DDIEngine:
    """Runtime-augmented deterministic DDI guardrail engine.

    Replace with a real DDInter / local interaction source while keeping the same return contract.
    """

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        rules = load_rules().get('ddi_pairs', [])
        findings: list[SafetyFinding] = []
        current = [normalize_token(m) for m in snapshot.patient.current_medications]
        proposed = [normalize_token(m.active_ingredient) for m in plan.medications]
        all_meds = set(current + proposed)
        for rule in rules:
            a = normalize_token(rule['med_a'])
            b = normalize_token(rule['med_b'])
            if a in all_meds and b in all_meds:
                findings.append(
                    SafetyFinding(
                        severity=rule['severity'],
                        category='drug_interaction',
                        message=rule['message'],
                        blocked=bool(rule['blocked']),
                        medication=f"{rule['med_a']} + {rule['med_b']}",
                        rule_id=f"ddi.{a}.{b}",
                        evidence_source=safety_source_label(),
                        recommended_action='Use a safer alternative or provide an explicit clinician override with monitoring.',
                    )
                )
        for med_a, med_b in combinations(proposed, 2):
            if med_a == med_b:
                findings.append(
                    SafetyFinding(
                        severity='warning',
                        category='duplicate_therapy',
                        message=f"Duplicate therapy signal: both drafted medications resolve to '{med_a}'.",
                        blocked=False,
                        medication=med_a,
                        rule_id='ddi.duplicate_therapy',
                        recommended_action='Review whether both entries are intentional or duplicated by the generator.',
                    )
                )
        return findings

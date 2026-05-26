from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan
from libs.contracts.safety import SafetyFinding
from services.safety.utils import load_rules, normalize_token, safety_source_label


class AllergyRules:
    """Checks proposed medications against declared allergies and simple allergy classes."""

    def evaluate(self, snapshot: PatientSnapshot, plan: TherapeuticPlan) -> list[SafetyFinding]:
        declared = [normalize_token(item) for item in snapshot.patient.known_allergies]
        allergy_classes = load_rules().get('allergy_classes', {})
        findings: list[SafetyFinding] = []
        for med in plan.medications:
            med_name = normalize_token(med.active_ingredient)
            matched_allergy = next((item for item in declared if med_name in item or item in med_name), None)
            if matched_allergy is None:
                for allergy_name, class_members in allergy_classes.items():
                    if allergy_name in declared and med_name in [normalize_token(x) for x in class_members]:
                        matched_allergy = allergy_name
                        break
            if matched_allergy:
                findings.append(
                    SafetyFinding(
                        severity='critical',
                        category='allergy',
                        medication=med.active_ingredient,
                        message=f"Proposed medication '{med.active_ingredient}' conflicts with reported allergy history ({matched_allergy}).",
                        blocked=True,
                        rule_id='allergy.exact_or_class_match',
                        evidence_source=safety_source_label(),
                        recommended_action='Choose a non-cross-reactive alternative and verify allergy details with the clinician.',
                    )
                )
        return findings

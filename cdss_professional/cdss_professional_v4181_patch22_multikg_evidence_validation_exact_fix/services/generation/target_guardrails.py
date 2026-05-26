from __future__ import annotations
from typing import Any
from libs.contracts.patient import PatientSnapshot
from services.normalization.dci_normalizer import canonicalize_dci, canonicalize_dci_list
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan

DEFAULT_TARGET_MEDICATIONS = {
    'paracetamol': MedicationDraft(active_ingredient='paracetamol', indication='symptomatic fever or pain relief', dose='500 mg', frequency='every 8 hours if needed', duration='3 days', route='oral', rationale='ExecutionPlan target guardrail selected paracetamol for simple fever/headache symptomatic relief.', safety_considerations=['Respect maximum daily dose and avoid/adjust in significant hepatic impairment.']),
    'salbutamol': MedicationDraft(active_ingredient='salbutamol', indication='acute wheezing rescue bronchodilator', dose='100 micrograms per actuation', frequency='1 to 2 inhalations as needed; clinician to confirm severity and technique', duration='short-term rescue use; reassess if persistent symptoms', route='inhalation', rationale='ExecutionPlan asthma/wheezing guardrail requires short-acting rescue bronchodilator target.', safety_considerations=['Assess severity, oxygenation and need for urgent care; check inhaler technique.']),
    'cetirizine': MedicationDraft(active_ingredient='cetirizine', indication='allergic rhinitis or urticaria symptom relief', dose='10 mg', frequency='once daily', duration='3 to 5 days; clinician to confirm', route='oral', rationale='Controlled antihistamine candidate for simple allergy/rhinitis/urticaria context.', safety_considerations=['Review sedation, renal impairment, pregnancy and breastfeeding status.']),
    'omeprazole': MedicationDraft(active_ingredient='omeprazole', indication='reflux/dyspepsia symptom relief after alarm signs excluded', dose='20 mg', frequency='once daily before meal', duration='short course; clinician to confirm', route='oral', rationale='Controlled PPI candidate for simple reflux/dyspepsia without alarm signs.', safety_considerations=['Review alarm GI symptoms, drug interactions, pregnancy and intended duration.']),
    'oral_rehydration_salts': MedicationDraft(active_ingredient='oral_rehydration_salts', indication='dehydration prevention/supportive oral rehydration', dose='standard sachet diluted as directed', frequency='after each loose stool or as clinically indicated', duration='until hydration restored; clinician to confirm', route='oral', rationale='Supportive oral rehydration recommendation for diarrhea/dehydration prevention.', safety_considerations=['Assess dehydration red flags, age, blood in stool and persistent fever.']),
    # Patch 12 review-draft fallbacks. These are only inserted when ExecutionPlan
    # already approved review_draft_allowed; they remain mandatory doctor-review
    # drafts, never final prescriptions.
    'ibuprofen': MedicationDraft(active_ingredient='ibuprofen', indication='clinician-authorized NSAID analgesic/anti-inflammatory use', dose='200 mg', frequency='every 8 hours if needed', duration='3 days', route='oral', rationale='Review-draft fallback for explicitly prescribed NSAID after negative pregnancy/renal/ulcer/anticoagulant screens.', safety_considerations=['Mandatory doctor validation; recheck pregnancy, renal function, ulcer/bleeding risk, anticoagulant/antiplatelet use and maximum daily dose.']),
    'amoxicillin': MedicationDraft(active_ingredient='amoxicillin', indication='clinician-documented bacterial infection', dose='500 mg', frequency='every 8 hours', duration='7 days; clinician to confirm indication/duration', route='oral', rationale='Review-draft fallback for explicitly prescribed amoxicillin with documented bacterial context and allergy screen.', safety_considerations=['Mandatory doctor validation; verify beta-lactam allergy, infection criteria, renal adjustment, local guideline and duration.']),
}

class TargetGuardrailService:
    def enforce(self, snapshot: PatientSnapshot, plan: TherapeuticPlan, execution_plan: Any | None) -> TherapeuticPlan:
        if execution_plan is None or (getattr(execution_plan, 'route', None) != 'prescription' and getattr(execution_plan, 'sub_route', None) != 'review_draft_allowed'):
            return plan
        targets = canonicalize_dci_list(getattr(execution_plan, 'target_ingredients', []) or [])
        forbidden = canonicalize_dci_list(getattr(execution_plan, 'forbidden_ingredients', []) or [])
        if not targets:
            return plan
        notes = list(plan.generation_notes or [])
        kept = []
        removed = []
        for med in plan.medications:
            ingredient = canonicalize_dci(str(med.active_ingredient or ''))
            if ingredient in forbidden:
                removed.append(med.active_ingredient)
                continue
            if ingredient in targets:
                kept.append(med.model_copy(update={'active_ingredient': ingredient}))
            else:
                removed.append(med.active_ingredient)
        if removed:
            notes.append('TargetGuardrail removed non-target/forbidden medication(s): ' + ', '.join(str(x) for x in removed))
        if not kept:
            target = targets[0]
            fallback = DEFAULT_TARGET_MEDICATIONS.get(target)
            if fallback is not None:
                dose = getattr(execution_plan, 'target_dose', None) or getattr(execution_plan, 'target_strength', None) or fallback.dose
                route = getattr(execution_plan, 'target_route', None) or fallback.route
                fallback = fallback.model_copy(update={'active_ingredient': target, 'dose': dose, 'route': route})
                kept = [fallback]
                notes.append(f'TargetGuardrail inserted evidence-target fallback medication: {target}.')
            else:
                notes.append(f'TargetGuardrail found no default draft for target={target}; case should remain clinician review.')
        return plan.model_copy(update={'medications': kept, 'generation_notes': list(dict.fromkeys(notes))})

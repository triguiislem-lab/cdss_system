from libs.contracts.evidence import LocalProductEvidence
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from services.clinical_understanding.router import ProductionRouter
from services.generation.prescription_generator import _filter_clinical_output
from services.localization.amm_mapper import AMMMapper
from services.llm.policy import should_run_level1_llm


def _product(name, ingredient, strength="500 mg", form="Comprimé"):
    return LocalProductEvidence(
        product_name=name,
        active_ingredient=ingredient,
        strength=strength,
        dosage_form=form,
        market="TN",
        score=0.0,
        metadata={},
    )


def test_paracetamol_rejects_combination_cold_products():
    med = MedicationDraft(
        active_ingredient="paracetamol",
        indication="fever",
        dose="500 mg",
        frequency="every 8 hours",
        duration="3 days",
        route="oral",
        rationale="symptomatic treatment",
    )
    products = [
        _product("ACTIFED RHUME ET FIEVRE", "PARACETAMOL + PSEUDOEPHEDRINE + CHLORPHENAMINE"),
        _product("ADOL", "PARACETAMOL"),
    ]
    candidates = AMMMapper().map_to_candidates(med, products)
    assert candidates
    assert candidates[0].product_name == "ADOL"
    assert all("ACTIFED" not in c.product_name for c in candidates)


def test_wrong_active_ingredient_is_not_localized():
    med = MedicationDraft(
        active_ingredient="paracetamol",
        indication="headache",
        dose="500 mg",
        frequency="every 8 hours",
        duration="3 days",
        route="oral",
        rationale="analgesic",
    )
    candidates = AMMMapper().map_to_candidates(med, [_product("ABBOTICINE", "AZITHROMYCINE")])
    assert candidates == []


def test_salbutamol_prefers_inhaled_products():
    med = MedicationDraft(
        active_ingredient="salbutamol",
        indication="asthma wheezing",
        dose="100 mcg",
        frequency="as needed",
        duration="5 days",
        route="inhaled",
        rationale="bronchodilator",
    )
    products = [
        _product("DRILL TOUX SECHE", "DEXTROMETHORPHANE", "15 mg", "Sirop"),
        _product("VENTOLINE", "SALBUTAMOL", "100 mcg/dose", "Aerosol pour inhalation"),
    ]
    candidates = AMMMapper().map_to_candidates(med, products)
    assert candidates
    assert candidates[0].product_name == "VENTOLINE"


def test_asthma_plan_removes_dextromethorphan_when_salbutamol_present():
    salb = MedicationDraft(active_ingredient="salbutamol", indication="asthma", dose="100 mcg", frequency="as needed", duration="5 days", route="inhaled", rationale="bronchodilator")
    cough = MedicationDraft(active_ingredient="dextromethorphane", indication="cough", dose="15 mg", frequency="3 times daily", duration="3 days", route="oral", rationale="cough suppressant")
    plan = TherapeuticPlan(problem_summary="asthma wheezing", triage_recommendation="outpatient_follow_up", medications=[salb, cough])
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=20, sex="female", weight_kg=60),
        consultation=ConsultationInput(language="fr", doctor_notes="asthme avec wheezing"),
        normalized_symptoms=["wheezing"],
        suspected_conditions=["asthma"],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text="asthme wheezing bronchodilatateur",
        route_recommendation="prescription",
    )
    out = _filter_clinical_output(plan, snapshot)
    assert [m.active_ingredient for m in out.medications] == ["salbutamol"]


def test_dental_pain_with_swelling_routes_review():
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p", age_years=30, sex="male", weight_kg=70),
        consultation=ConsultationInput(language="fr", doctor_notes="douleur dentaire avec gonflement"),
        normalized_symptoms=["dental pain"],
        suspected_conditions=[],
        missing_critical_information=[],
        risk_flags=RiskFlags(),
        normalized_runtime_text="douleur dentaire avec gonflement local",
        route_recommendation="prescription",
    )
    decision = ProductionRouter().explain(snapshot)
    assert decision["route"] == "review"
    assert "dental_swelling_or_abscess_review" in decision["review_triggers"]


def test_level1_policy_skips_simple_negated_pregnancy_fever():
    parsed = {
        "symptoms": ["fever"],
        "missing_critical_information": [],
        "pregnancy_mentioned": True,
        "pregnancy_negated": True,
        "renal_mentioned": False,
        "hepatic_mentioned": False,
        "extracted_context": {},
    }
    run, reason = should_run_level1_llm(parsed, "Fievre depuis 2 jours. Non enceinte. Pas d'allergie connue.")
    assert run is False
    assert reason == "static_extraction_confident"

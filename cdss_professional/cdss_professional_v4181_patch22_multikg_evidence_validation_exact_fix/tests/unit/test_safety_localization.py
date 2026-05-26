from libs.contracts.evidence import EvidenceBundle, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.localization.vei_mapper import VEIMapper
from services.localization.service import LocalizationService
from services.safety.service import SafetyService
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever


def test_safety_service_flags_interaction_and_renal_risk() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(
            patient_id='p-risk',
            age_years=70,
            sex='male',
            renal_impairment=True,
            current_medications=['warfarin'],
            chronic_conditions=['anticoagulation'],
        ),
        consultation=ConsultationInput(language='fr'),
        normalized_symptoms=['pain'],
        suspected_conditions=['musculoskeletal pain'],
        risk_flags=RiskFlags(),
    )
    plan = TherapeuticPlan(
        problem_summary='pain',
        medications=[
            MedicationDraft(
                active_ingredient='ibuprofen',
                indication='pain',
                dose='400 mg',
                frequency='every 8 hours',
                duration='3 days',
            )
        ],
    )
    report = SafetyService().validate(snapshot, plan)
    categories = {finding.category for finding in report.findings}
    assert 'drug_interaction' in categories
    assert 'renal' in categories
    assert report.has_blocking_issue is True


def test_localization_service_prefers_closest_strength() -> None:
    plan = TherapeuticPlan(
        problem_summary='viral syndrome',
        medications=[
            MedicationDraft(
                active_ingredient='paracetamol',
                indication='fever',
                dose='500 mg',
                frequency='every 8 hours',
                duration='3 days',
            )
        ],
    )
    evidence = EvidenceBundle(
        local_products=[
            LocalProductEvidence(
                product_name='Paracetamol SAID 1 g',
                active_ingredient='paracetamol',
                strength='1000 mg',
                dosage_form='tablet',
                score=0.9,
            ),
            LocalProductEvidence(
                product_name='Doliprane 500',
                active_ingredient='paracetamol',
                strength='500 mg',
                dosage_form='tablet',
                score=0.8,
            ),
        ]
    )
    localized = LocalizationService().localize(plan, evidence)
    assert localized
    assert localized[0].local_product_name == 'Doliprane 500'
    assert localized[0].match_confidence is not None


def test_localization_service_rejects_oral_to_injectable_match() -> None:
    plan = TherapeuticPlan(
        problem_summary='viral syndrome',
        medications=[
            MedicationDraft(
                active_ingredient='paracetamol',
                indication='fever',
                dose='500 mg',
                frequency='every 8 hours',
                duration='3 days',
                route='oral',
            )
        ],
    )
    evidence = EvidenceBundle(
        local_products=[
            LocalProductEvidence(
                product_name='Paracetamol Injectable',
                active_ingredient='paracetamol',
                strength='500 mg',
                dosage_form='Solution injectable',
                score=0.99,
            ),
            LocalProductEvidence(
                product_name='ADOL 500',
                active_ingredient='paracetamol',
                strength='500 mg',
                dosage_form='Comprime',
                score=0.7,
            ),
        ]
    )
    localized = LocalizationService().localize(plan, evidence)
    assert localized
    assert localized[0].local_product_name == 'ADOL 500'


def test_vei_mapper_does_not_invent_placeholder_reimbursement_note() -> None:
    note = VEIMapper().get_note("Nonexistent Product Without Runtime Reimbursement Row")
    assert note is None


class _EmptyFormularyClient:
    def load_products(self):
        return []


def test_local_formulary_retriever_returns_no_fake_product_when_catalog_empty() -> None:
    retriever = LocalFormularyRetriever(client=_EmptyFormularyClient())
    products = retriever.retrieve("paracetamol 500 mg oral Tunisia mono ingredient local formulary", limit=5)
    assert products == []

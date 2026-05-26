from libs.contracts.evidence import EvidenceChunk, EvidenceBundle, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from services.generation.service import GenerationService
from services.localization.service import LocalizationService
from services.retrieval.evidence_ranker import EvidenceRanker
from services.retrieval.query_builder import RetrievalQueryBuilder
from services.clinical_understanding.service import ClinicalUnderstandingService


def test_query_builder_adds_prescription_hint_and_risk_tokens() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(
            patient_id="p1",
            age_years=30,
            sex="female",
            pregnant=True,
            known_allergies=["ibuprofen"],
            chronic_conditions=["asthma"],
        ),
        consultation=ConsultationInput(language="fr", doctor_notes="fever and sore throat"),
        normalized_symptoms=["fever", "sore throat"],
        suspected_conditions=["viral upper respiratory infection"],
        risk_flags=RiskFlags(),
    )
    plan = RetrievalQueryBuilder().build(snapshot, top_k_vector_results=5, top_k_graph_facts=5, top_k_local_products=5)
    vector_query = next(item for item in plan.queries if item.source == "vector")
    assert "first line treatment" in vector_query.text
    assert "pregnancy" in plan.patient_context_tokens


def test_evidence_ranker_prefers_guideline_and_renal_match() -> None:
    items = [
        EvidenceChunk(source="exam_qa", title="QA", content="renal dosing mention", score=0.7, metadata={}),
        EvidenceChunk(source="guideline", title="Guideline", content="renal dosing guidance", score=0.7, metadata={}),
    ]
    ranked = EvidenceRanker().rank_chunks(items, query_terms=["renal impairment"])
    assert ranked[0].source == "guideline"
    assert ranked[0].metadata.get("source_bucket") == "guideline"


def test_localizer_uses_notebook_style_matching_for_route_and_indication() -> None:
    plan = TherapeuticPlan(
        problem_summary="asthma exacerbation",
        medications=[
            MedicationDraft(
                active_ingredient="salbutamol sulfate",
                indication="bronchospasm in asthma",
                dose="100 mcg/dose",
                frequency="as needed",
                duration="5 days",
                route="inhalation",
            )
        ],
    )
    evidence = EvidenceBundle(
        local_products=[
            LocalProductEvidence(
                product_name="Salbutamol Tab",
                active_ingredient="salbutamol",
                strength="4 mg",
                dosage_form="tablet",
                score=0.6,
                metadata={"indication": "wheezing", "veic": "Essentiel"},
            ),
            LocalProductEvidence(
                product_name="Ventolin Inhaler",
                active_ingredient="salbutamol sulfate",
                strength="100 mcg/dose",
                dosage_form="inhalation aerosol",
                score=0.4,
                metadata={"indication": "bronchospasm in asthma", "veic": "Vital"},
            ),
        ]
    )
    localized = LocalizationService().localize(plan, evidence)
    assert localized
    assert localized[0].local_product_name == "Ventolin Inhaler"
    assert any("Raw AMM match score=" in note for note in localized[0].localization_notes)


def test_generation_avoids_nsaids_when_risk_present() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-risk", age_years=28, sex="female", pregnant=True),
        consultation=ConsultationInput(language="fr"),
        normalized_symptoms=["fever", "pain"],
        suspected_conditions=["viral syndrome"],
        risk_flags=RiskFlags(pregnancy_risk=True),
    )
    evidence = EvidenceBundle(
        graph_facts=[],
        vector_chunks=[EvidenceChunk(source="guideline", title="NSAID caution in pregnancy", content="Ibuprofen should be avoided in pregnancy while paracetamol is commonly used for symptomatic relief.", score=0.8, metadata={})],
        local_products=[
            LocalProductEvidence(product_name="Doliprane TN 500 mg", active_ingredient="paracetamol", strength="500 mg", dosage_form="tablet", score=0.8, metadata={"indication": "fever pain"}),
            LocalProductEvidence(product_name="Brufen TN 400 mg", active_ingredient="ibuprofen", strength="400 mg", dosage_form="tablet", score=0.9, metadata={"indication": "pain inflammation"}),
        ],
    )
    plan = GenerationService().draft(snapshot, evidence)
    assert plan.medications
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert all(m.active_ingredient != "ibuprofen" for m in plan.medications)


def test_generation_suppresses_medication_for_emergency_like_case() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-emerg", age_years=55, sex="male"),
        consultation=ConsultationInput(language="fr", doctor_notes="acute chest pain and severe dyspnea"),
        normalized_symptoms=["chest pain"],
        suspected_conditions=[],
        risk_flags=RiskFlags(),
    )
    plan = GenerationService().draft(snapshot, EvidenceBundle())
    assert plan.triage_recommendation == "emergency_referral"
    assert plan.medications == []


def test_clinical_understanding_respects_negated_renal_and_hepatic_risk() -> None:
    snapshot = ClinicalUnderstandingService().build_snapshot(
        PatientProfile(patient_id="p-neg-risk", age_years=30, sex="female"),
        ConsultationInput(
            language="fr",
            doctor_notes="Fievre depuis 2 jours. Pas d'insuffisance renale. Sans maladie hepatique. Non enceinte. Pas d'allergie connue.",
        ),
    )

    assert snapshot.risk_flags.renal_risk is False
    assert snapshot.risk_flags.hepatic_risk is False
    assert "renal" not in snapshot.vulnerable_flags
    assert "hepatic" not in snapshot.vulnerable_flags

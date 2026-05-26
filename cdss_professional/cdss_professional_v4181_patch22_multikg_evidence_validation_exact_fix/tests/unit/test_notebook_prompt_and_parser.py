import pickle

from libs.contracts.evidence import EvidenceBundle, EvidenceChunk, LocalProductEvidence
from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot, RiskFlags, TranscriptTurn
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from services.generation.output_parser import OutputParser
from services.generation.prompt_builder import PromptBuilder


def test_prompt_builder_uses_strict_json_contract_sections() -> None:
    snapshot = PatientSnapshot(
        patient=PatientProfile(patient_id="p-prompt", age_years=29, sex="female", pregnant=True),
        consultation=ConsultationInput(
            language="fr",
            doctor_notes="fever and sore throat for 2 days",
            transcript=[TranscriptTurn(speaker="patient", text="I have fever and throat pain.")],
        ),
        normalized_symptoms=["fever", "sore throat"],
        suspected_conditions=["viral syndrome"],
        missing_critical_information=["allergy history"],
        risk_flags=RiskFlags(pregnancy_risk=True, notes=["pregnancy requires extra caution"]),
    )
    evidence = EvidenceBundle(
        vector_chunks=[
            EvidenceChunk(source="guideline", title="URTI guidance", content="Symptomatic care is preferred.", score=0.8)
        ],
        local_products=[
            LocalProductEvidence(
                product_name="Doliprane TN 500 mg",
                active_ingredient="paracetamol",
                strength="500 mg",
                dosage_form="tablet",
                score=0.7,
            )
        ],
    )

    prompt = PromptBuilder().build(snapshot, evidence)

    assert "## TASK" in prompt
    assert "Return one valid JSON object conforming exactly to PrescriptionDraftV1" in prompt
    assert "## EXECUTION PLAN AND ROUTE CONTRACT" in prompt
    assert "## PATIENT CONTEXT" in prompt
    assert "## CONSULTATION EXCERPTS" in prompt
    assert "## EVIDENCE" in prompt
    assert "[VS] URTI guidance" in prompt
    assert "pregnant: True" in prompt
    assert "Return the PrescriptionDraftV1 JSON now" in prompt


def test_output_parser_parses_notebook_markdown_table() -> None:
    raw = """
## DIAGNOSIS
Likely viral upper respiratory infection with fever

## PROPOSED PRESCRIPTION
| Drug (DCI) | Dose | Route | Frequency | Duration | AMM-TN Equivalent |
|---|---|---|---|---|---|
| paracetamol | 500 mg | oral | every 8 hours | 3 days | Doliprane TN 500 mg |

## SAFETY REVIEW
### Contraindications checked:
- Pregnancy risk reviewed; avoid NSAIDs.
### Drug interactions:
- No major interaction identified from current context.
### Patient-specific alerts:
- Pregnant patient requires clinician validation.

## CLINICAL EVIDENCE
- [VS] Supportive care guidance favored paracetamol over NSAIDs in this context.
- [LOCAL] Doliprane TN 500 mg is available locally.

## MONITORING REQUIRED
- Reassess if fever persists more than 3 days.

## DISCLAIMER
This CDSS proposal MUST be validated by the prescribing physician before administration.
""".strip()

    plan = OutputParser().parse(raw)

    assert plan.problem_summary.startswith("Likely viral upper respiratory infection")
    assert plan.medications
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].route == "oral"
    assert plan.medications[0].supporting_evidence
    assert plan.monitoring == ["Reassess if fever persists more than 3 days."]
    assert plan.triage_recommendation == "clinician_review"


def test_output_parser_merges_machine_readable_triage_after_markdown_table() -> None:
    raw = """
## DIAGNOSIS
Simple fever without red flags.

## PROPOSED PRESCRIPTION
| Drug (DCI) | Dose | Route | Frequency | Duration | AMM-TN Equivalent |
|---|---|---|---|---|---|
| paracetamol | 500 mg | oral | every 8 hours | 3 days | ADOL 500 mg |

## SAFETY REVIEW
- No red flags identified.

**problem_summary:** Simple fever
**triage:** outpatient_follow_up
**confidence:** 0.74
**medication:** paracetamol | fever | 500 mg | every 8 hours | 3 days | oral | complete machine-readable line
**monitoring:** Reassess if fever persists more than 3 days.
""".strip()

    plan = OutputParser().parse(raw)

    assert plan.medications
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.triage_recommendation == "outpatient_follow_up"



def test_output_parser_parses_qwen_json_style_medications() -> None:
    raw = """
```json
{
  "problem_summary": "Uncomplicated fever",
  "triage": "outpatient_follow_up",
  "confidence": 0.71,
  "medications": [
    {
      "dci": "paracetamol",
      "indication": "symptomatic relief",
      "dose": "500 mg",
      "frequency": "every 8 hours",
      "duration": "3 days",
      "route": "oral"
    }
  ],
  "monitoring": ["reassess if fever persists"]
}
```
""".strip()

    plan = OutputParser().parse(raw)

    assert plan.problem_summary == "Uncomplicated fever"
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].dose == "500 mg"
    assert plan.triage_recommendation == "outpatient_follow_up"


def test_output_parser_parses_french_qwen_json_style_medications() -> None:
    raw = """
{
  "resume": "Fievre simple",
  "triage": "outpatient_follow_up",
  "medicaments": [
    {
      "dci": "paracetamol",
      "indication": "traitement symptomatique",
      "posologie": "500mg",
      "frequence": "toutes les 8 heures",
      "duree": "pendant 3 jours",
      "voie": "orale"
    }
  ]
}
""".strip()

    plan = OutputParser().parse(raw)

    assert len(plan.medications) == 1
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].dose == "500 mg"
    assert plan.medications[0].frequency == "every 8 hours"
    assert plan.medications[0].duration == "3 days"
    assert plan.medications[0].route == "oral"


def test_output_parser_parses_raw_qwen_json_medication_list() -> None:
    raw = """
[
  {
    "active_ingredient": "salbutamol",
    "indication": "bronchospasm relief",
    "dose": "100 mcg",
    "frequency": "as needed",
    "duration": "5 days",
    "route": "inhalation"
  }
]
""".strip()

    plan = OutputParser().parse(raw)

    assert plan.medications[0].active_ingredient == "salbutamol"
    assert plan.medications[0].dose == "100 mcg"
    assert plan.medications[0].route == "inhalation"


def test_output_parser_parses_loose_qwen_medication_line() -> None:
    raw = "Diagnosis: bronchospasm\n- Salbutamol 100 mcg inhalation as needed for 5 days\nMonitoring: review worsening dyspnea"

    plan = OutputParser().parse(raw)

    assert plan.medications[0].active_ingredient == "salbutamol"
    assert plan.medications[0].route == "inhalation"


def test_output_parser_replaces_unspecified_duplicate_with_complete_fallback() -> None:
    raw = """
```json
{
  "problem_summary": "Uncomplicated fever",
  "medications": [
    {"active_ingredient": "paracetamol", "dose": "unspecified", "frequency": "unspecified", "duration": "unspecified", "route": "oral"}
  ]
}
```
note: llm_output_unparseable_or_empty=true; evidence-grounded notebook fallback appended for structured dosing.
medication: paracetamol | symptomatic relief | 500 mg | every 8 hours | 3 days | oral | fallback complete dose
""".strip()

    plan = OutputParser().parse(raw)

    assert len(plan.medications) == 1
    assert plan.medications[0].active_ingredient == "paracetamol"
    assert plan.medications[0].dose == "500 mg"
    assert plan.medications[0].frequency == "every 8 hours"
    assert plan.medications[0].duration == "3 days"


def test_vector_client_kaggle_pickle_backend_reads_notebook_assets(tmp_path) -> None:
    meta_path = tmp_path / "all_metadata.pkl"
    texts_path = tmp_path / "all_texts.pkl"
    metadata = [
        {"title": "Renal dosing guidance", "source": "guideline", "section": "renal", "score": 0.4},
        {"title": "Pregnancy safety", "source": "guideline", "section": "pregnancy", "score": 0.3},
    ]
    texts = [
        "Paracetamol can be used carefully in renal impairment while NSAIDs should be avoided.",
        "Pregnancy-safe symptomatic treatment should avoid unsafe NSAIDs.",
    ]
    meta_path.write_bytes(pickle.dumps(metadata))
    texts_path.write_bytes(pickle.dumps(texts))

    client = VectorIndexClient(
        backend="kaggle_pickle",
        pickle_metadata_path=meta_path,
        pickle_texts_path=texts_path,
    )
    results = client.similarity_search("renal impairment paracetamol", top_k=2)

    assert results
    assert results[0].title == "Renal dosing guidance"

from __future__ import annotations

import json
from pathlib import Path

from libs.contracts.clinical_runtime import PrescriptionDraftV1
from libs.contracts.evidence import EvidenceBundle, EvidenceHit
from libs.contracts.patient import PatientSnapshot

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
GENERATION_SYSTEM_PROMPT = (_PROMPT_DIR / "evidence_grounded_generation_system.txt").read_text(encoding="utf-8")


class PromptBuilder:
    """Builds strict JSON Qwen prompts from selected EvidenceHit objects.

    Patch17 replaces the legacy compact text contract (``medication: a | b``)
    with a real Pydantic JSON schema. Legacy headings are kept for existing
    tests/debug notebooks, but the actual output contract is strict JSON.
    """

    def __init__(self, template_path: str | Path | None = None) -> None:
        self.template_path = Path(template_path) if template_path else None

    @property
    def system_prompt(self) -> str:
        return GENERATION_SYSTEM_PROMPT

    def build(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> str:
        execution_context = _execution_context_section(snapshot)
        schema = PrescriptionDraftV1.model_json_schema()
        sections = [
            "## TASK",
            "Generate a physician-reviewable outpatient prescription draft only if the ExecutionPlan allows generation.",
            "Return one valid JSON object conforming exactly to PrescriptionDraftV1. No markdown and no extra text.",
            "If route/display route is review_blocked, emergency, non_pharma, or missing_info, return an empty medications list and explain the reason in monitoring/missing_questions.",
            "",
            "## EXECUTION PLAN AND ROUTE CONTRACT",
            execution_context,
            "",
            "## PATIENT CONTEXT",
            _snapshot_section(snapshot),
            "",
            "## CONSULTATION EXCERPTS",
            _consultation_excerpts_section(snapshot),
            "",
            "## EVIDENCE",
            "SELECTED EVIDENCE FOR PROMPT",
            _selected_evidence_section(evidence),
            "",
            "## LOCAL PRODUCTS",
            _local_products_section(evidence),
            "",
            "EVIDENCE QUALITY SUMMARY",
            _quality_summary_section(evidence),
            "",
            "## STRICT OUTPUT JSON SCHEMA",
            json.dumps(schema, ensure_ascii=False),
            "",
            "## STRICT RULES",
            "- Use only ExecutionPlan target_ingredients for medications.",
            "- Never output a medication if it appears in forbidden_ingredients.",
            "- Never invent dose, duration, frequency, indication, or evidence IDs.",
            "- If a required medication field is unknown, return triage='missing_info' and medications=[].",
            "- If any route conflict exists, return triage matching the display route and medications=[].",
            "- All drafts are clinician_review_required=true.",
            "- Use evidence_ids when available; otherwise keep evidence_ids empty and explain the limitation.",
            "- The JSON must start with { and end with }. Do not include compact `medication:` lines.",
            "",
            "## MINIMAL VALID EXAMPLE",
            json.dumps(
                {
                    "schema_version": "PrescriptionDraftV1",
                    "problem_summary": "Low-risk fever with clinician-authorized symptomatic target.",
                    "triage": "draft_prescription",
                    "medications": [
                        {
                            "active_ingredient": "paracetamol",
                            "indication": "fever or mild pain symptomatic relief",
                            "dose": "500 mg",
                            "frequency": "every 8 hours if needed",
                            "duration": "3 days",
                            "route": "oral",
                            "rationale": "Controlled target ingredient with local evidence; physician validation required.",
                            "evidence_ids": [],
                            "safety_considerations": ["Do not combine with other paracetamol-containing products."],
                        }
                    ],
                    "non_drug_recommendations": ["maintain hydration"],
                    "monitoring": ["seek medical review if symptoms worsen or red flags appear"],
                    "missing_questions": [],
                    "evidence_ids": [],
                    "clinician_review_required": True,
                    "confidence": 0.74,
                },
                ensure_ascii=False,
            ),
            "",
            "Return the PrescriptionDraftV1 JSON now:",
        ]
        return "\n".join(sections)

    def build_prompt(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> str:
        return self.build(snapshot, evidence)


def _execution_context_section(snapshot: PatientSnapshot) -> str:
    ctx = getattr(snapshot, "extracted_context", {}) or {}
    return "\n".join(
        [
            f"route_recommendation: {getattr(snapshot, 'route_recommendation', None)}",
            f"final_execution_route: {ctx.get('final_execution_route')}",
            f"final_display_route: {ctx.get('final_display_route')}",
            f"target_ingredients: {ctx.get('execution_target_ingredients', ctx.get('target_ingredients', []))}",
            f"forbidden_ingredients: {ctx.get('execution_forbidden_ingredients', ctx.get('forbidden_ingredients', []))}",
            f"generation_allowed: {ctx.get('execution_allowed_to_generate')}",
        ]
    )


def _diagnosis_section(snapshot: PatientSnapshot) -> str:
    return "\n".join(
        [
            f"symptoms: {', '.join(snapshot.normalized_symptoms or [])}",
            f"suspected_conditions: {', '.join(snapshot.suspected_conditions or [])}",
            f"disease_tags: {', '.join(snapshot.disease_tags or [])}",
        ]
    )


def _snapshot_section(snapshot: PatientSnapshot) -> str:
    patient = snapshot.patient
    return "\n".join(
        [
            f"patient_id: {patient.patient_id}",
            f"age_years: {patient.age_years}",
            f"age_months: {patient.age_months}",
            f"sex: {patient.sex}",
            f"weight_kg: {patient.weight_kg}",
            f"pregnant: {patient.pregnant}",
            f"pregnancy_status: {getattr(patient, 'pregnancy_status', 'unknown')}",
            f"gestational_age_weeks: {getattr(patient, 'gestational_age_weeks', None)}",
            f"breastfeeding: {patient.breastfeeding}",
            f"renal_impairment: {patient.renal_impairment}",
            f"egfr: {getattr(patient, 'egfr', None)}",
            f"creatinine: {getattr(patient, 'creatinine_value', None)} {getattr(patient, 'creatinine_unit', '') or ''} date={getattr(patient, 'creatinine_date', None)}",
            f"hepatic_impairment: {patient.hepatic_impairment}",
            f"temperature_c: {getattr(patient, 'temperature_c', None)}",
            f"bp: {getattr(patient, 'systolic_bp', None)}/{getattr(patient, 'diastolic_bp', None)}",
            f"spo2: {getattr(patient, 'spo2', None)}",
            f"heart_rate: {getattr(patient, 'heart_rate', None)}",
            f"respiratory_rate: {getattr(patient, 'respiratory_rate', None)}",
            f"pain_score: {getattr(patient, 'pain_score', None)}",
            f"symptom_severity: {getattr(patient, 'symptom_severity', 'unknown')}",
            f"known_allergies: {', '.join(patient.known_allergies or [])}",
            f"current_medications: {', '.join(patient.current_medications or [])}",
            f"chronic_conditions: {', '.join(patient.chronic_conditions or [])}",
            f"structured_history: {', '.join(getattr(patient, 'structured_history', []) or [])}",
            f"runtime_text: {snapshot.normalized_runtime_text[:1200]}",
        ]
    )


def _consultation_excerpts_section(snapshot: PatientSnapshot) -> str:
    consultation = getattr(snapshot, "consultation", None)
    lines = []
    if consultation is not None:
        notes = getattr(consultation, "doctor_notes", None)
        if notes:
            lines.append(f"- Doctor notes: {str(notes)[:1200]}")
        transcript = getattr(consultation, "transcript", None) or []
        for idx, turn in enumerate(transcript[:10], start=1):
            speaker = getattr(turn, "speaker", None) if not isinstance(turn, dict) else turn.get("speaker")
            text = getattr(turn, "text", None) if not isinstance(turn, dict) else turn.get("text")
            if text:
                lines.append(f"- [{idx}] {speaker or 'speaker'}: {str(text)[:500]}")
    runtime_text = getattr(snapshot, "normalized_runtime_text", None)
    if runtime_text and not lines:
        lines.append(f"- Runtime text: {str(runtime_text)[:1200]}")
    return "\n".join(lines) if lines else "No consultation excerpts provided."


def _selected_evidence_section(evidence: EvidenceBundle, limit: int = 8) -> str:
    hits = [h for h in getattr(evidence, "evidence_hits", []) if not getattr(h, "why_rejected", None)]
    if hits:
        return "\n".join(_format_hit(i, h) for i, h in enumerate(hits[:limit], start=1))

    lines = []
    for i, chunk in enumerate(getattr(evidence, "vector_chunks", [])[:limit], start=1):
        title = getattr(chunk, "title", None) or getattr(chunk, "source", None) or "evidence"
        content = getattr(chunk, "content", None) or getattr(chunk, "text", None) or ""
        excerpt = str(content).replace("\n", " ")[:700]
        lines.append(f"{i}. [VS] {title} | {excerpt}")

    offset = len(lines)
    for i, product in enumerate(getattr(evidence, "local_products", [])[:3], start=1):
        lines.append(
            f"{offset+i}. [LOCAL] {getattr(product, 'product_name', '')} | "
            f"{getattr(product, 'active_ingredient', '')} | "
            f"{getattr(product, 'strength', '')} | {getattr(product, 'dosage_form', '')}"
        )

    offset = len(lines)
    for i, fact in enumerate(getattr(evidence, "graph_facts", [])[:3], start=1):
        lines.append(
            f"{offset+i}. [KG] {getattr(fact, 'subject', '')} "
            f"{getattr(fact, 'predicate', '')} {getattr(fact, 'object', '')}"
        )

    return "\n".join(lines) if lines else "No selected evidence available."


def _format_hit(index: int, hit: EvidenceHit) -> str:
    parts = [
        f"{index}. evidence_id={getattr(hit, 'evidence_id', '')}",
        f"[{hit.channel}] source={hit.source_system}",
        f"priority={hit.source_priority}",
        f"score={hit.final_score}",
        f"runtime_retrieval={getattr(hit, 'accepted_for_runtime_retrieval', hit.accepted_for_clinical_use)}",
        f"section={hit.section_kind}",
    ]
    if hit.active_ingredient:
        parts.append(f"ingredient={hit.active_ingredient}")
    if hit.product_name:
        parts.append(f"product={hit.product_name}")
    if hit.strength:
        parts.append(f"strength={hit.strength}")
    if hit.form:
        parts.append(f"form={hit.form}")
    excerpt = getattr(hit, "content_excerpt", None)
    if excerpt:
        parts.append(f"excerpt={str(excerpt)[:700]}")
    if hit.why_selected:
        parts.append(f"why={hit.why_selected}")
    return " | ".join(parts)


def _local_products_section(evidence: EvidenceBundle) -> str:
    if not evidence.local_products:
        return "No local product candidates available."
    return "\n".join(
        f"- {p.product_name} | {p.active_ingredient} | "
        f"{p.strength} | {p.dosage_form} | score={p.score}"
        for p in evidence.local_products[:8]
    )


def _quality_summary_section(evidence: EvidenceBundle) -> str:
    s = evidence.evidence_quality_summary
    return "\n".join(
        [
            f"evidence_confidence: {s.evidence_confidence}",
            f"top_source_system: {s.top_source_system}",
            f"local_product_candidates: {s.local_product_candidates}",
            f"localized_product_verified: {s.localized_product_verified}",
            f"accepted_for_runtime_retrieval_count: {getattr(s, 'accepted_for_runtime_retrieval_count', s.accepted_for_clinical_use_count)}",
            f"requires_rcp_verification_count: {getattr(s, 'requires_rcp_verification_count', 0)}",
            f"fallback_evidence_count: {s.fallback_evidence_count}",
            f"support_only_count: {s.support_only_count}",
            f"kg_safety_facts_count: {s.kg_safety_facts_count}",
            f"broad_vector_fallback_used: {s.broad_vector_fallback_used}",
            f"notes: {'; '.join(s.notes or [])}",
        ]
    )

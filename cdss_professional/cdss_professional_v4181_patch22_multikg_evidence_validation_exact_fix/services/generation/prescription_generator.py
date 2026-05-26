from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import MedicationDraft, TherapeuticPlan
from libs.utils.medical_text import normalize_search_text

from services.generation.llm_router import LLMRouter
from services.generation.output_parser import OutputParser
from services.generation.prompt_builder import PromptBuilder


class PrescriptionGenerator:
    """Main prescription drafting service."""

    def __init__(
        self,
        prompt_builder: PromptBuilder | None = None,
        llm_router: LLMRouter | None = None,
        output_parser: OutputParser | None = None,
    ) -> None:
        self.prompt_builder = prompt_builder or PromptBuilder()
        self.llm_router = llm_router or LLMRouter()
        self.output_parser = output_parser or OutputParser()

    def generate(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> TherapeuticPlan:
        prompt = self.prompt_builder.build(snapshot, evidence)
        try:
            raw = self.llm_router.generate_structured_text(
                prompt,
                snapshot=snapshot,
                evidence=evidence,
                system_prompt_override=getattr(self.prompt_builder, "system_prompt", None),
            )
        except TypeError:
            # Backward-compatible unit-test/dummy routers may not accept the
            # Patch17 system_prompt_override keyword. Real LLMRouter instances do.
            raw = self.llm_router.generate_structured_text(prompt, snapshot=snapshot, evidence=evidence)
        raw = _with_raw_debug_notes(raw)
        plan = self.output_parser.parse(raw, snapshot=snapshot)
        plan = _filter_clinical_output(plan, snapshot)
        if _needs_structured_completion(raw, plan, snapshot):
            fallback = self.llm_router.generate_fallback_text(snapshot, evidence)
            fallback_reason = "empty_medication_plan_after_qwen" if not plan.medications else "incomplete_medication_fields_after_qwen"
            raw = "\n".join(
                [
                    raw.rstrip(),
                    f"note: parsed_medications_before_fallback={len(plan.medications)}",
                    f"note: fallback_reason={fallback_reason}",
                    "note: llm_output_unparseable_or_empty=true; incomplete medication fields detected after parsing; evidence-grounded notebook fallback appended for structured dosing.",
                    fallback,
                ]
            )
            plan = self.output_parser.parse(raw, snapshot=snapshot)
            plan = _filter_clinical_output(plan, snapshot)
        return plan


def _filter_clinical_output(plan: TherapeuticPlan, snapshot: PatientSnapshot) -> TherapeuticPlan:
    text = normalize_search_text(
        " ".join([
            snapshot.normalized_runtime_text,
            " ".join(snapshot.normalized_symptoms),
            " ".join(snapshot.suspected_conditions),
            " ".join(snapshot.disease_tags),
        ])
    )
    meds = list(plan.medications or [])
    notes = list(plan.generation_notes or [])

    asthma_or_wheeze = any(term in text for term in ["asthma", "asthme", "wheezing", "sifflement", "bronchodilat"])
    has_salbutamol = any("salbutamol" in normalize_search_text(m.active_ingredient) or "albuterol" in normalize_search_text(m.active_ingredient) for m in meds)

    if asthma_or_wheeze and has_salbutamol:
        filtered = []
        removed = []
        for med in meds:
            ingredient = normalize_search_text(med.active_ingredient)
            if any(x in ingredient for x in ["dextromethorphan", "dextromethorphane", "noscapine", "codeine"]):
                removed.append(med.active_ingredient)
                continue
            filtered.append(med)
        if removed:
            meds = filtered
            notes.append(
                "note: removed_non_core_asthma_medication="
                + ",".join(str(x) for x in removed)
                + "; bronchodilator-focused asthma/wheezing plan kept."
            )

    return plan.model_copy(update={"medications": meds, "generation_notes": notes})


def _needs_structured_completion(raw_text: str, plan: TherapeuticPlan, snapshot: PatientSnapshot) -> bool:
    note_text = normalize_search_text(" ".join(plan.generation_notes) + " " + raw_text)
    if "llm_model_used true" not in note_text and "llm_model_used=true" not in raw_text:
        return False
    if "llm_output_unparseable_or_empty true" in note_text or "llm_output_unparseable_or_empty=true" in raw_text:
        return False
    if snapshot.route_recommendation != "prescription":
        return False
    if not plan.medications:
        return True
    return any(_medication_incomplete(med) for med in plan.medications)


def _medication_incomplete(medication: MedicationDraft) -> bool:
    for value in [medication.dose, medication.frequency, medication.duration]:
        normalized = normalize_search_text(value)
        if not value or any(token in normalized for token in ["unspecified", "unknown", "tbd", "to confirm"]):
            return True
    return False


def _with_raw_debug_notes(raw_text: str) -> str:
    if "llm_model_used=true" not in raw_text:
        return raw_text
    preview = raw_text.replace("\r", "\\r").replace("\n", "\\n")[:700]
    return "\n".join(
        [
            raw_text.rstrip(),
            f"note: raw_llm_output_length={len(raw_text)}",
            f"note: raw_llm_output_preview={preview}",
        ]
    )

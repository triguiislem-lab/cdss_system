from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import TherapeuticPlan

from services.generation.prescription_generator import PrescriptionGenerator
from services.generation.rationale_generator import RationaleGenerator


class GenerationService:
    """High-level generation entrypoint."""

    def __init__(
        self,
        generator: PrescriptionGenerator | None = None,
        rationale_generator: RationaleGenerator | None = None,
    ) -> None:
        self.generator = generator or PrescriptionGenerator()
        self.rationale_generator = rationale_generator or RationaleGenerator()

    def draft(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> TherapeuticPlan:
        plan = self.generator.generate(snapshot, evidence)
        generated_notes = self.rationale_generator.build_notes(plan, evidence)
        existing_notes = list(plan.generation_notes)
        plan.generation_notes = [*existing_notes, *generated_notes]
        return plan

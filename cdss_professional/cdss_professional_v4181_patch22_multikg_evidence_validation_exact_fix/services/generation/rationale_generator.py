from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.prescription import TherapeuticPlan


class RationaleGenerator:
    """Produces concise generation notes for UI display or audit traces."""

    def build_notes(self, plan: TherapeuticPlan, evidence: EvidenceBundle) -> list[str]:
        notes: list[str] = []
        med_names = ", ".join(m.active_ingredient for m in plan.medications) or "no medication"
        notes.append(f"Draft plan built around {med_names}.")
        if evidence.vector_chunks:
            notes.append(f"Retrieved {len(evidence.vector_chunks)} vector evidence chunks.")
        if evidence.graph_facts:
            notes.append(f"Retrieved {len(evidence.graph_facts)} KG facts.")
        if evidence.local_products:
            top_product = evidence.local_products[0]
            notes.append(
                f"Top local product candidate: {top_product.product_name} ({top_product.active_ingredient} {top_product.strength})."
            )
        return notes

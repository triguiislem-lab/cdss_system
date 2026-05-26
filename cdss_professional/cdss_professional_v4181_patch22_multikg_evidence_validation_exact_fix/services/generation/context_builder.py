from __future__ import annotations

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot


class GenerationContextBuilder:
    """Builds compact structured context for prompt assembly and auditing."""

    def build_clinical_context(self, snapshot: PatientSnapshot) -> str:
        patient = snapshot.patient
        symptoms = ", ".join(snapshot.normalized_symptoms) or "none"
        suspected = ", ".join(snapshot.suspected_conditions) or "none"
        allergies = ", ".join(patient.known_allergies) or "none"
        meds = ", ".join(patient.current_medications) or "none"
        chronic = ", ".join(patient.chronic_conditions) or "none"
        missing = ", ".join(snapshot.missing_critical_information) or "none"
        risk_notes = "; ".join(snapshot.risk_flags.notes) or "none"
        return (
            f"age={patient.age_years}; sex={patient.sex}; pregnant={patient.pregnant}; "
            f"breastfeeding={patient.breastfeeding}; renal_impairment={patient.renal_impairment}; "
            f"hepatic_impairment={patient.hepatic_impairment};\n"
            f"symptoms={symptoms};\n"
            f"suspected_conditions={suspected};\n"
            f"known_allergies={allergies};\n"
            f"current_medications={meds};\n"
            f"chronic_conditions={chronic};\n"
            f"missing_critical_information={missing};\n"
            f"risk_notes={risk_notes}"
        )

    def build_evidence_context(self, evidence: EvidenceBundle) -> str:
        chunks = []
        for chunk in evidence.vector_chunks[:3]:
            chunks.append(f"[VS] {chunk.title} :: {chunk.content[:180]}")
        for fact in evidence.graph_facts[:3]:
            chunks.append(f"[KG] {fact.subject} {fact.predicate} {fact.object}")
        for product in evidence.local_products[:3]:
            chunks.append(
                f"[LOCAL] {product.product_name} :: {product.active_ingredient} :: {product.strength} :: {product.dosage_form}"
            )
        if evidence.merged_summary:
            chunks.append(f"[SUMMARY] {evidence.merged_summary[:220]}")
        return "\n".join(chunks) if chunks else "no retrieved evidence"

    def build_clinical_request(self, snapshot: PatientSnapshot) -> str:
        transcript_lines = [f"{turn.speaker}: {turn.text}" for turn in snapshot.consultation.transcript[:8]]
        symptoms = ", ".join(snapshot.normalized_symptoms) or "unspecified symptoms"
        suspected = ", ".join(snapshot.suspected_conditions) or "uncertain diagnosis"
        doctor_notes = (snapshot.consultation.doctor_notes or "").strip()
        parts = [
            f"Draft a clinician-reviewable outpatient prescription proposal for symptoms: {symptoms}.",
            f"Current suspected condition(s): {suspected}.",
        ]
        if doctor_notes:
            parts.append(f"Doctor notes: {doctor_notes}")
        if transcript_lines:
            parts.append("Consultation excerpts:\n" + "\n".join(transcript_lines))
        if snapshot.missing_critical_information:
            parts.append("Explicitly surface missing information: " + ", ".join(snapshot.missing_critical_information[:5]))
        return "\n".join(parts)

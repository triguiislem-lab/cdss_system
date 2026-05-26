from __future__ import annotations

from typing import Any

from libs.contracts.evidence import EvidenceBundle, EvidenceHit, EvidenceQualitySummary, KnowledgeGraphFact, LocalProductEvidence
from services.retrieval.source_priority import (
    SUPPORT_ONLY_SECTION_KINDS,
    final_evidence_score,
    get_source_priority,
    infer_section_kind,
    infer_source_system,
    is_accepted_for_clinical_use,
    is_accepted_for_runtime_retrieval,
    is_clinically_authoritative,
    requires_rcp_verification,
    normalize_source_system,
)

SAFETY_PREDICATE_HINTS = {"contraindicated", "contraindication", "caution", "warning", "renal", "hepatic", "pregnancy", "interaction", "dose_adjustment", "requires_monitoring", "increases_risk"}
TREATMENT_PREDICATE_HINTS = {"treats", "indicated_for", "therapy", "recommended_for", "belongs_to_therapeutic_class"}
KNOWN_ACTIVE_INGREDIENTS = {"paracetamol", "acetaminophen", "ibuprofen", "amoxicillin", "salbutamol", "albuterol", "omeprazole", "metformin", "aspirin", "warfarin", "azithromycin", "amoxicilline"}


class EvidenceQualityBuilder:
    def build(self, bundle: EvidenceBundle, expected_terms: list[str] | None = None, expected_active_ingredient: str | None = None) -> EvidenceBundle:
        expected_active_ingredient = expected_active_ingredient or _expected_active_ingredient(bundle, expected_terms)
        hits: list[EvidenceHit] = []
        rejected: list[EvidenceHit] = []
        for idx, product in enumerate(bundle.local_products, start=1):
            hits.append(self._local_product_hit(product, idx, expected_active_ingredient))
        for idx, fact in enumerate(bundle.graph_facts, start=1):
            hits.append(self._kg_fact_hit(fact, idx))
        for idx, chunk in enumerate(bundle.vector_chunks, start=1):
            hit = self._vector_hit(chunk, idx, expected_active_ingredient)
            if hit.why_rejected:
                rejected.append(hit)
            else:
                hits.append(hit)

        hits = sorted(hits, key=lambda item: (item.final_score or 0.0, item.source_priority or 0), reverse=True)
        rejected = sorted(rejected, key=lambda item: item.final_score or 0.0, reverse=True)
        summary = self._summary(hits, rejected, bundle)
        merged_summary = bundle.merged_summary or ""
        quality_note = (
            f"Evidence quality: confidence={summary.evidence_confidence}, runtime_accepted={summary.accepted_for_runtime_retrieval_count}, requires_rcp_verification={summary.requires_rcp_verification_count}, "
            f"local={summary.local_evidence_count}, fallback={summary.fallback_evidence_count}, kg_safety={summary.kg_safety_facts_count}, "
            f"localized_verified={summary.localized_product_verified}."
        )
        diagnostics = dict(bundle.retrieval_diagnostics or {})
        diagnostics.update({
            "evidence_hit_count": len(hits),
            "rejected_evidence_hit_count": len(rejected),
            "evidence_confidence": summary.evidence_confidence,
            "top_source_system": summary.top_source_system,
            "broad_vector_fallback_used": summary.broad_vector_fallback_used,
            "expected_active_ingredient_for_scoring": expected_active_ingredient,
            "target_ingredients": _target_ingredients(bundle),
        })
        return bundle.model_copy(update={
            "evidence_hits": hits,
            "rejected_evidence_hits": rejected,
            "evidence_quality_summary": summary,
            "merged_summary": " | ".join(part for part in [merged_summary, quality_note] if part),
            "retrieval_diagnostics": diagnostics,
        })

    def _local_product_hit(self, product: LocalProductEvidence, rank: int, expected_active_ingredient: str | None) -> EvidenceHit:
        metadata = dict(product.metadata or {})
        source_system = infer_source_system(metadata, fallback="final_data_release_final_medicines")
        accepted = is_accepted_for_runtime_retrieval(metadata)
        clinically_authoritative = is_clinically_authoritative(metadata)
        rcp_required = requires_rcp_verification(metadata)
        final_score = final_evidence_score(product.score, source_system, "local_product", product.active_ingredient, expected_active_ingredient, str(metadata.get("quality_tier") or metadata.get("veic") or ""), accepted if accepted is not None else True, route=str(metadata.get("route") or ""), form=product.dosage_form, strength=product.strength)
        return EvidenceHit(channel="local_formulary" if "formulaire" not in source_system else "formulaire_tunisien", source_system=source_system, source_name=str(metadata.get("source_name") or metadata.get("source") or "final_medicines"), source_priority=get_source_priority(source_system), quality_tier=str(metadata.get("quality_tier") or metadata.get("veic") or ""), evidence_rank=rank, accepted_for_clinical_use=accepted if accepted is not None else True, accepted_for_runtime_retrieval=accepted if accepted is not None else True, clinically_authoritative=clinically_authoritative, requires_rcp_verification=rcp_required, section_kind="local_product", active_ingredient=product.active_ingredient, product_name=product.product_name, route=str(metadata.get("route") or ""), form=product.dosage_form, strength=product.strength, semantic_score=product.score, final_score=final_score, why_selected="Structured local product candidate from final Tunisian medicines/formulary data.", fallback_used=False, metadata=metadata)

    def _kg_fact_hit(self, fact: KnowledgeGraphFact, rank: int) -> EvidenceHit:
        source_system = normalize_source_system(fact.provenance or "kg")
        category = _kg_category(fact.predicate)
        final_score = final_evidence_score(fact.score, source_system, category, fact.subject, None, None, True)
        return EvidenceHit(channel="kg", source_system=source_system, source_name=fact.provenance or "kg", source_priority=get_source_priority(source_system), evidence_rank=rank, accepted_for_clinical_use=True, accepted_for_runtime_retrieval=True, clinically_authoritative=False, requires_rcp_verification=True, section_kind=category, active_ingredient=fact.subject, semantic_score=fact.score, final_score=final_score, why_selected=f"Structured KG fact: {fact.subject} {fact.predicate} {fact.object}.", metadata={"predicate": fact.predicate, "object": fact.object})

    def _vector_hit(self, chunk, rank: int, expected_active_ingredient: str | None) -> EvidenceHit:
        metadata = dict(chunk.metadata or {})
        source_system = infer_source_system(metadata, fallback=chunk.source)
        section_kind = infer_section_kind(metadata, chunk.title, chunk.content)
        accepted = is_accepted_for_runtime_retrieval(metadata)
        clinically_authoritative = is_clinically_authoritative(metadata)
        rcp_required = requires_rcp_verification(metadata)
        active_ingredient = metadata.get("active_ingredient") or metadata.get("dci") or _guess_ingredient_from_title(chunk.title)
        is_support = _is_support_only(source_system, section_kind, metadata)
        channel = "vector_fallback" if _is_fallback_source(source_system, metadata) or is_support else "vector_prescription"
        why_rejected = "Support-only or non-prescription section; not allowed to dominate prescription evidence." if is_support else ("Evidence section is not accepted for runtime retrieval." if accepted is False else None)
        final_score = final_evidence_score(chunk.score, source_system, section_kind, active_ingredient, expected_active_ingredient, str(metadata.get("quality_tier") or ""), accepted, route=metadata.get("route"), form=metadata.get("form") or metadata.get("dosage_form"), strength=metadata.get("strength"))
        return EvidenceHit(channel=channel, source_system=source_system, source_name=str(metadata.get("source_name") or chunk.source), source_priority=get_source_priority(source_system), quality_tier=str(metadata.get("quality_tier") or ""), evidence_rank=rank, accepted_for_clinical_use=accepted, accepted_for_runtime_retrieval=accepted, clinically_authoritative=clinically_authoritative, requires_rcp_verification=rcp_required, section_kind=section_kind, active_ingredient=active_ingredient, product_name=metadata.get("product_name"), route=metadata.get("route"), form=metadata.get("form") or metadata.get("dosage_form"), strength=metadata.get("strength"), semantic_score=chunk.score, final_score=final_score, why_selected="Accepted prescription evidence section." if not why_rejected else "", why_rejected=why_rejected, fallback_used=(channel == "vector_fallback"), content_excerpt=chunk.content[:700] if hasattr(EvidenceHit, "model_fields") and "content_excerpt" in EvidenceHit.model_fields else None, metadata=metadata)

    def _summary(self, hits: list[EvidenceHit], rejected: list[EvidenceHit], bundle: EvidenceBundle) -> EvidenceQualitySummary:
        top = hits[0] if hits else None
        kg_safety = [h for h in hits if h.channel == "kg" and str(h.section_kind or "") in {"safety", "contraindication", "interaction", "renal_warning", "hepatic_warning", "pregnancy_warning", "dose_adjustment"}]
        kg_treatment = [h for h in hits if h.channel == "kg" and str(h.section_kind or "") == "treatment"]
        fallback_count = sum(1 for h in hits if h.fallback_used or h.channel == "vector_fallback")
        accepted_count = sum(1 for h in hits if h.accepted_for_runtime_retrieval is True)
        clinically_authoritative_count = sum(1 for h in hits if h.clinically_authoritative is True)
        rcp_required_count = sum(1 for h in hits if h.requires_rcp_verification is True)
        support_only_count = sum(1 for h in rejected if h.why_rejected and "Support-only" in h.why_rejected)
        local_count = sum(1 for h in hits if h.channel in {"local_formulary", "formulaire_tunisien"})
        confidence = "not_applicable" if not hits and not bundle.local_products and not bundle.graph_facts and not bundle.vector_chunks else "weak"
        if fallback_count and accepted_count == 0:
            confidence = "fallback_only"
        elif local_count >= 1 and accepted_count >= 2 and (kg_safety or kg_treatment or bundle.vector_chunks):
            confidence = "strong"
        elif accepted_count >= 1 or local_count >= 1:
            confidence = "moderate"
        return EvidenceQualitySummary(local_product_candidates=local_count, localized_product_verified=False, local_evidence_count=sum(1 for h in hits if h.source_priority and h.source_priority >= 80), fallback_evidence_count=fallback_count, support_only_count=support_only_count, accepted_for_clinical_use_count=accepted_count, accepted_for_runtime_retrieval_count=accepted_count, clinically_authoritative_count=clinically_authoritative_count, requires_rcp_verification_count=rcp_required_count, top_source_system=top.source_system if top else None, kg_safety_facts_count=len(kg_safety), kg_treatment_facts_count=len(kg_treatment), kg_contraindication_facts_count=sum(1 for h in kg_safety if h.section_kind == "contraindication"), kg_interaction_facts_count=sum(1 for h in kg_safety if h.section_kind == "interaction"), kg_dose_adjustment_facts_count=sum(1 for h in kg_safety if h.section_kind == "dose_adjustment"), broad_vector_fallback_used=fallback_count > 0, evidence_confidence=confidence, notes=["Retrieval candidates are not treated as localized verification until localization succeeds."])


def _target_ingredients(bundle: EvidenceBundle) -> list[str]:
    diagnostics = bundle.retrieval_diagnostics or {}
    targets = diagnostics.get("target_ingredients") or []
    if targets:
        return list(targets)
    plan = bundle.retrieval_plan
    if plan is not None:
        if getattr(plan, "expected_active_ingredients", None):
            return list(plan.expected_active_ingredients)
        if getattr(plan, "expected_active_ingredient", None):
            return [plan.expected_active_ingredient]
        for query in plan.queries:
            filters = getattr(query, "filters", {}) or {}
            if filters.get("active_ingredient"):
                return [filters["active_ingredient"]]
    return []


def _expected_active_ingredient(bundle: EvidenceBundle, expected_terms: list[str] | None = None) -> str | None:
    targets = _target_ingredients(bundle)
    if targets:
        return str(targets[0])
    terms = list(expected_terms or [])
    plan = bundle.retrieval_plan
    if plan is not None:
        terms.extend(plan.primary_terms or [])
        terms.extend(plan.patient_context_tokens or [])
        for query in plan.queries:
            terms.append(query.text)
    for term in terms:
        norm = str(term or "").strip().lower()
        for ingredient in KNOWN_ACTIVE_INGREDIENTS:
            if ingredient in norm:
                return ingredient
    return None


def _kg_category(predicate: str) -> str:
    p = str(predicate or "").lower()
    if "contra" in p: return "contraindication"
    if "interact" in p or "increases_risk" in p: return "interaction"
    if "renal" in p: return "renal_warning"
    if "hepatic" in p: return "hepatic_warning"
    if "preg" in p: return "pregnancy_warning"
    if "dose" in p or "adjust" in p: return "dose_adjustment"
    if any(x in p for x in SAFETY_PREDICATE_HINTS): return "safety"
    if any(x in p for x in TREATMENT_PREDICATE_HINTS): return "treatment"
    return p or "kg_fact"


def _is_support_only(source_system: str, section_kind: str | None, metadata: dict[str, Any]) -> bool:
    text = " ".join([source_system, str(section_kind or ""), str(metadata.get("retrieval_role") or ""), str(metadata.get("quality_flags") or "")]).lower()
    return any(kind in text for kind in SUPPORT_ONLY_SECTION_KINDS)


def _is_fallback_source(source_system: str, metadata: dict[str, Any]) -> bool:
    text = " ".join([source_system, str(metadata.get("retrieval_role") or ""), str(metadata.get("source") or "")]).lower()
    return any(x in text for x in ["general_biomedical_qa", "medqa", "medmcqa", "pubmedqa", "exam", "pubchem", "chembl", "fallback"])


def _guess_ingredient_from_title(title: str) -> str | None:
    text = (title or "").strip()
    return text.split(" - ")[0].split(":")[0].strip()[:120] if text else None

from __future__ import annotations

from typing import Any

PRESCRIPTION_SECTION_KINDS = {
    "dosage", "dose", "posology", "posologie", "indication", "indications",
    "contraindication", "contraindications", "warning", "warnings", "precaution",
    "precautions", "interaction", "interactions", "pregnancy", "grossesse", "renal",
    "kidney", "hepatic", "liver", "adverse_effect", "adverse_effects", "monitoring",
    "local_product", "formulary_product", "tunisian_product",
    "therapeutic_classification", "therapeutic_class", "therapeutic_subclass",
    "price_reimbursement", "structured_enrichment",
}
SUPPORT_ONLY_SECTION_KINDS = {
    "pubchem", "chembl", "metadata", "pipeline_document", "source_manifest",
    "summary", "uncovered", "support_only", "exam_qa", "general_qa",
    "raw_clinical_evidence_summary", "candidate_heuristic_rules",
}
SOURCE_PRIORITY = {
    "tunisia_dpm_local_rcp_pdf": 100,
    "final_data_release_final_medicines": 98,
    "final_medicines": 98,
    "final_data_release": 98,
    "local_formulary": 98,
    "tunisian_final_release": 98,
    "tunisia_lab_local_document": 95,
    "formulaire_therapeutique_tunisien_2012": 90,
    "tn_med_db_v1": 92,
    "tn_med_structured_enrichment": 92,
    "kg": 85,
    "cdss_kg": 85,
    "hetionet": 75,
    "primekg": 75,
    "local_ocr_html_recovered_document": 80,
    "aemps_cima_ficha_tecnica": 75,
    "bdpm_api_medicaments_fr": 70,
    "emc_smpc_html": 70,
    "swissmedic_aips_professional_info": 65,
    "dailymed_spl": 60,
    "openfda_label": 55,
    "dailymed_live_spl": 55,
    "openfda_live_label": 50,
    "who_vaccine_product_information": 50,
    "pubchem_annotations": 20,
    "chembl_ebi_api": 20,
    "general_biomedical_qa": 10,
    "medqa": 10,
    "medmcqa": 10,
    "pubmedqa": 10,
    "exam_qa": 8,
    "unknown": 5,
}
QUALITY_TIER_SCORE = {
    "A": 1.0, "B": 0.82, "C": 0.62, "D": 0.38, "E": 0.25,
    "accepted": 1.0, "high": 1.0, "medium": 0.65, "low": 0.35,
    "VITAL": 1.0, "ESSENTIEL": 0.95, "INTERMEDIAIRE": 0.75, "CONFORT": 0.35,
}


def normalize_source_system(value: Any) -> str:
    if value is None:
        return "unknown"
    text = str(value).strip().lower().replace(" ", "_").replace("-", "_")
    if not text:
        return "unknown"
    if text in {"kg", "graph", "knowledge_graph", "cdss_kg"}:
        return "cdss_kg"
    if "hetionet" in text:
        return "hetionet"
    if "primekg" in text:
        return "primekg"
    if "final_medicines" in text or "final_data_release" in text or "final_release" in text:
        return "final_data_release_final_medicines"
    if text == "local_formulary" or text == "formulary":
        return "local_formulary"
    if "tn_med" in text or "tnmed" in text:
        return "tn_med_db_v1"
    if "formulaire" in text and "tunis" in text:
        return "formulaire_therapeutique_tunisien_2012"
    if "dpm" in text and ("rcp" in text or "tunisia" in text or "tunis" in text):
        return "tunisia_dpm_local_rcp_pdf"
    if "lab" in text and ("tunisia" in text or "tunis" in text):
        return "tunisia_lab_local_document"
    if "dailymed" in text:
        return "dailymed_spl"
    if "openfda" in text:
        return "openfda_label"
    if "pubchem" in text:
        return "pubchem_annotations"
    if "chembl" in text:
        return "chembl_ebi_api"
    if "medmcqa" in text:
        return "medmcqa"
    if "medqa" in text:
        return "medqa"
    if "pubmedqa" in text:
        return "pubmedqa"
    return text


def get_source_priority(source_system: Any) -> int:
    return SOURCE_PRIORITY.get(normalize_source_system(source_system), SOURCE_PRIORITY["unknown"])


def infer_source_system(metadata: dict[str, Any] | None, fallback: str = "unknown") -> str:
    metadata = metadata or {}
    for key in ("source_system", "source", "source_name", "book", "authority_class", "retrieval_role", "catalog", "dataset"):
        if metadata.get(key):
            return normalize_source_system(metadata.get(key))
    return normalize_source_system(fallback)


def infer_section_kind(metadata: dict[str, Any] | None, title: str = "", content: str = "") -> str | None:
    metadata = metadata or {}
    for key in ("section_kind", "section", "kind", "evidence_type", "retrieval_role"):
        value = metadata.get(key)
        if value:
            return str(value).strip().lower().replace(" ", "_")
    text = f"{title} {content[:500]}".lower()
    for kind in PRESCRIPTION_SECTION_KINDS:
        if kind in text:
            return kind
    return None


def is_accepted_for_runtime_retrieval(metadata: dict[str, Any] | None) -> bool | None:
    metadata = metadata or {}
    value = metadata.get("accepted_for_runtime_retrieval")
    if isinstance(value, bool):
        return value
    if value is not None:
        return str(value).strip().lower() in {"true", "1", "yes", "accepted", "runtime"}
    # Backward-compatible fallback only; this no longer implies clinical authority.
    legacy = metadata.get("accepted_for_clinical_use")
    if isinstance(legacy, bool):
        return legacy
    if legacy is not None:
        return str(legacy).strip().lower() in {"true", "1", "yes", "accepted", "clinical"}
    source = infer_source_system(metadata)
    if source in {"final_data_release_final_medicines", "local_formulary", "tunisia_dpm_local_rcp_pdf", "tunisia_lab_local_document", "formulaire_therapeutique_tunisien_2012"}:
        return True
    return None


def is_clinically_authoritative(metadata: dict[str, Any] | None) -> bool | None:
    metadata = metadata or {}
    value = metadata.get("clinically_authoritative")
    if isinstance(value, bool):
        return value
    if value is not None:
        return str(value).strip().lower() in {"true", "1", "yes", "authoritative"}
    return False


def requires_rcp_verification(metadata: dict[str, Any] | None) -> bool | None:
    metadata = metadata or {}
    value = metadata.get("requires_rcp_verification")
    if isinstance(value, bool):
        return value
    if value is not None:
        return str(value).strip().lower() in {"true", "1", "yes"}
    return True


def is_accepted_for_clinical_use(metadata: dict[str, Any] | None) -> bool | None:
    # Deprecated name kept for compatibility; means accepted for runtime retrieval.
    return is_accepted_for_runtime_retrieval(metadata)


def section_kind_score(section_kind: str | None) -> float:
    if not section_kind:
        return 0.2
    norm = str(section_kind).lower()
    if norm in SUPPORT_ONLY_SECTION_KINDS or any(x in norm for x in SUPPORT_ONLY_SECTION_KINDS):
        return 0.0
    if norm in PRESCRIPTION_SECTION_KINDS or any(x in norm for x in PRESCRIPTION_SECTION_KINDS):
        return 1.0
    return 0.35


def quality_score(quality_tier: Any, accepted_for_runtime_retrieval: bool | None) -> float:
    accepted_bonus = 1.0 if accepted_for_runtime_retrieval is True else 0.0 if accepted_for_runtime_retrieval is False else 0.45
    tier = str(quality_tier or "").strip()
    tier_score = QUALITY_TIER_SCORE.get(tier, QUALITY_TIER_SCORE.get(tier.upper(), 0.5))
    return max(accepted_bonus, tier_score)


def exact_text_match_score(expected: str | None, actual: str | None) -> float:
    if not expected:
        return 0.75
    if not actual:
        return 0.0
    exp = _norm(expected)
    act = _norm(actual)
    if not exp or not act:
        return 0.0
    if exp == act:
        return 1.0
    exp_tokens = set(exp.split())
    act_tokens = set(act.split())
    return 0.65 if exp_tokens and act_tokens and exp_tokens.intersection(act_tokens) else 0.0


def route_form_strength_score(route: str | None, form: str | None, strength: str | None, query_route: str | None = None, query_strength: str | None = None) -> float:
    score = 0.4
    if query_route and form:
        route_norm = _norm(query_route)
        form_norm = _norm(form)
        if route_norm and route_norm in form_norm:
            score += 0.35
        elif route_norm in {"oral", "orale"} and any(x in form_norm for x in ["comprime", "gelule", "sirop", "buvable", "orale", "tablet", "capsule"]):
            score += 0.35
        elif route_norm in {"inhalation", "inhaled"} and any(x in form_norm for x in ["aerosol", "inhal", "nebul", "spray"]):
            score += 0.35
    if query_strength and strength and _norm(query_strength) in _norm(strength):
        score += 0.25
    return min(score, 1.0)


def final_evidence_score(semantic_score: float | None, source_system: str, section_kind: str | None, active_ingredient: str | None, expected_active_ingredient: str | None, quality_tier: str | None, accepted_for_clinical_use: bool | None, route: str | None = None, form: str | None = None, strength: str | None = None, query_route: str | None = None, query_strength: str | None = None) -> float:
    semantic = max(0.0, min(float(semantic_score or 0.0), 1.0))
    source = get_source_priority(source_system) / 100.0
    section = section_kind_score(section_kind)
    ingredient = exact_text_match_score(expected_active_ingredient, active_ingredient)
    accepted_quality = quality_score(quality_tier, accepted_for_clinical_use)
    route_form = route_form_strength_score(route, form, strength, query_route=query_route, query_strength=query_strength)
    return round(0.35 * semantic + 0.20 * source + 0.15 * section + 0.15 * ingredient + 0.10 * accepted_quality + 0.05 * route_form, 4)


def _norm(text: Any) -> str:
    return str(text or "").strip().lower().replace("_", " ").replace("-", " ")

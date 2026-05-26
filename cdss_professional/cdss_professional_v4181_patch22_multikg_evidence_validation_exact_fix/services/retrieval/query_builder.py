from __future__ import annotations

from libs.contracts.evidence import RetrievalPlan, RetrievalQuery
from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import query_keywords

RUNTIME_DISEASE_ALIASES = {
    "upper respiratory tract infection": "grippe",
    "viral syndrome": "grippe",
    "grippe": "grippe",
    "influenza": "grippe",
    "cardiac emergency": "stemi",
    "stemi": "stemi",
    "refractive error or ophthalmology review": "myopie",
    "myopie": "myopie",
    "biliary obstruction requiring surgical review": "lithiase",
    "acute abdomen requiring surgical review": "lithiase",
    "medication overuse headache": "migraine",
    "headache": "migraine",
    "migraine": "migraine",
    "hypertension": "hta",
    "hta": "hta",
    "diabetes": "diabete",
    "diabete": "diabete",
    "asthma": "asthme",
    "eczema": "eczema",
    "dental abscess": "abces_dentaire",
    "abces dentaire": "abces_dentaire",
}

ROUTE_BY_RESPONSE_MODE = {
    "routine_prescription": "prescription",
    "symptomatic": "prescription",
    "clinician_review": "review",
    "non_pharma": "non_pharma",
    "emergency_referral": "emergency",
}

INTENT_QUERY_HINTS = {
    "prescription": "first line treatment dose route frequency duration contraindications monitoring local formulary",
    "treats": "indications first line treatment guideline recommended regimen",
    "interaction": "drug drug interaction severity management avoid combination contraindication",
    "contraindication": "contraindications warnings pregnancy renal hepatic avoid use",
    "general": "clinical recommendation diagnosis treatment contraindications",
}


class RetrievalQueryBuilder:
    """Builds retrieval queries from the normalized patient snapshot.

    This includes notebook-derived query enrichment so the vector step is closer
    to the large notebook behavior even before the real retrievers are ported.
    """

    def build(
        self,
        snapshot: PatientSnapshot,
        *,
        top_k_vector_results: int,
        top_k_graph_facts: int,
        top_k_local_products: int,
    ) -> RetrievalPlan:
        symptom_terms = [item.strip().lower() for item in snapshot.normalized_symptoms if item.strip()]
        condition_terms = [item.strip().lower() for item in snapshot.suspected_conditions if item.strip()]
        chronic_terms = [item.strip().lower() for item in snapshot.patient.chronic_conditions if item.strip()]
        parsed_meds = [
            str(item).strip().lower()
            for item in (snapshot.extracted_context.get("current_medications", []) or [])
            if str(item).strip()
        ]
        current_meds = self._dedupe([item.strip().lower() for item in snapshot.patient.current_medications if item.strip()] + parsed_meds)
        allergy_terms = [item.strip().lower() for item in snapshot.patient.known_allergies if item.strip()]

        primary_terms = self._dedupe(symptom_terms + condition_terms)
        patient_tokens = self._dedupe(chronic_terms + current_meds + allergy_terms + self._risk_tokens(snapshot))
        clinical_terms = query_keywords(
            " ".join(primary_terms),
            " ".join(patient_tokens),
            snapshot.consultation.doctor_notes or "",
            " ".join(turn.text for turn in snapshot.consultation.transcript[:6]),
            max_terms=12,
        )
        runtime_disease = self._runtime_disease(snapshot, condition_terms, symptom_terms)
        response_mode = getattr(snapshot, "response_mode", "routine_prescription")
        route = ROUTE_BY_RESPONSE_MODE.get(response_mode, "prescription")
        joined = " ".join(primary_terms + patient_tokens + clinical_terms + ([runtime_disease] if runtime_disease else [])) or "general consultation"
        vector_query = f"{joined} {INTENT_QUERY_HINTS['prescription']}".strip()
        kg_terms = self._expand_kg_terms(([runtime_disease] if runtime_disease else []) + primary_terms + current_meds)
        kg_query = " ".join(kg_terms or clinical_terms or [joined])
        local_terms = self._dedupe(([runtime_disease] if runtime_disease else []) + condition_terms + symptom_terms + current_meds + clinical_terms)
        local_query = " ".join(local_terms or [joined])
        vector_filters = {"language": snapshot.consultation.language, "route": route}
        kg_filters = {"route": route}
        if runtime_disease:
            vector_filters["disease"] = runtime_disease
            kg_filters["disease"] = runtime_disease

        return RetrievalPlan(
            primary_terms=self._dedupe(primary_terms + clinical_terms),
            patient_context_tokens=patient_tokens,
            queries=[
                RetrievalQuery(
                    source="vector",
                    text=vector_query,
                    limit=top_k_vector_results,
                    rationale="Guideline/supporting evidence retrieval with prescription-oriented hints",
                    filters=vector_filters,
                ),
                RetrievalQuery(
                    source="kg",
                    text=kg_query,
                    limit=top_k_graph_facts,
                    rationale="Clinical relation retrieval from KG",
                    filters=kg_filters,
                ),
                RetrievalQuery(
                    source="local_formulary",
                    text=local_query,
                    limit=top_k_local_products,
                    rationale="Tunisian formulary/product grounding candidates",
                    filters={"market": "TN"},
                ),
            ],
        )

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for item in items:
            if item and item not in seen:
                ordered.append(item)
                seen.add(item)
        return ordered

    @staticmethod
    def _runtime_disease(snapshot: PatientSnapshot, condition_terms: list[str], symptom_terms: list[str]) -> str | None:
        search_space = list(condition_terms) + [" ".join(symptom_terms)] + [snapshot.consultation.doctor_notes or ""]
        for raw in search_space:
            normalized = raw.strip().lower()
            if not normalized:
                continue
            if normalized in RUNTIME_DISEASE_ALIASES:
                return RUNTIME_DISEASE_ALIASES[normalized]
            for key, value in RUNTIME_DISEASE_ALIASES.items():
                if key in normalized:
                    return value
        if "fever" in symptom_terms and ("cough" in symptom_terms or "sore throat" in symptom_terms):
            return "grippe"
        return None

    @classmethod
    def _expand_kg_terms(cls, terms: list[str]) -> list[str]:
        aliases = {
            "paracetamol": ["paracetamol", "acetaminophen"],
            "acetaminophen": ["acetaminophen", "paracetamol"],
            "fever": ["fever", "pyrexia"],
            "fievre": ["fever", "pyrexia"],
            "asthme": ["asthma"],
            "asthma": ["asthme", "asthma", "salbutamol", "albuterol", "bronchodilator", "bronchospasm"],
            "salbutamol": ["salbutamol", "albuterol", "bronchodilator", "beta agonist"],
            "albuterol": ["albuterol", "salbutamol", "bronchodilator", "beta agonist"],
            "bronchodilator": ["bronchodilator", "salbutamol", "albuterol", "beta agonist"],
            "grippe": ["influenza", "flu", "upper respiratory tract infection"],
        }
        expanded: list[str] = []
        for term in terms:
            expanded.extend(aliases.get(term, [term]))
        return cls._dedupe(expanded)

    @staticmethod
    def _risk_tokens(snapshot: PatientSnapshot) -> list[str]:
        tokens: list[str] = []
        age = snapshot.patient.age_years
        if snapshot.patient.pregnant:
            tokens.append("pregnancy")
        if snapshot.patient.breastfeeding:
            tokens.append("breastfeeding")
        if snapshot.patient.renal_impairment:
            tokens.append("renal impairment")
        if snapshot.patient.hepatic_impairment:
            tokens.append("hepatic impairment")
        if snapshot.patient.known_allergies:
            tokens.append("drug allergy")
        if age is not None and age >= 65:
            tokens.append("elderly")
        if age is not None and age <= 14:
            tokens.append("pediatric")
        return tokens

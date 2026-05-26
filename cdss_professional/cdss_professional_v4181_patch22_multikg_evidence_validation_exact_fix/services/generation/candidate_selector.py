from __future__ import annotations

from collections import defaultdict

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import normalize_search_text, tokenize_clinical_text
from services.normalization.dci_normalizer import canonicalize_dci

TREAT_PREDICATES = {"treats", "may_treat", "can_relieve", "recommended_for", "used_for"}
RISK_PREDICATES = {"contraindicated_in", "avoid_in", "warning_for"}
NSAIDS = {"ibuprofen", "diclofenac", "naproxen"}


class CandidateSelector:
    """Builds notebook-style medication candidates from evidence.

    It favors evidence-grounded symptomatic agents and applies hard safety-aware
    generation penalties so the drafting layer is safer before deterministic
    validation runs.
    """

    def select(self, snapshot: PatientSnapshot, evidence: EvidenceBundle, strategy: str) -> list[dict]:
        primary_terms = [normalize_search_text(x) for x in (snapshot.normalized_symptoms + snapshot.suspected_conditions)]
        primary_blob = " ".join(primary_terms)
        scores: dict[str, float] = defaultdict(float)
        supports: dict[str, list[dict]] = defaultdict(list)
        reasons: dict[str, list[str]] = defaultdict(list)

        for product in evidence.local_products:
            ingredient = canonicalize_dci(product.active_ingredient)
            if not ingredient:
                continue
            indication = normalize_search_text(product.metadata.get("indication", ""))
            score = 0.15 + (float(product.score or 0.0) * 0.45)
            term_hits = sum(1 for term in tokenize_clinical_text(primary_blob, min_len=4) if term in indication)
            score += min(0.28, term_hits * 0.07)
            if ingredient in primary_blob:
                score += 0.18
            scores[ingredient] += score
            supports[ingredient].append({"source": "local", "note": f"Local TN product available: {product.product_name} ({product.strength})."})
            reasons[ingredient].append("local_formulary_match")

        for fact in evidence.graph_facts:
            subject = normalize_search_text(fact.subject)
            predicate = normalize_search_text(fact.predicate)
            obj = normalize_search_text(fact.object)
            if not subject:
                continue
            if predicate in TREAT_PREDICATES and any(term and (term in obj or obj in term) for term in primary_terms):
                scores[subject] += 0.35 + (float(fact.score or 0.0) * 0.25)
                supports[subject].append({"source": "kg", "note": f"KG fact: {fact.subject} {fact.predicate} {fact.object}."})
                reasons[subject].append("kg_treats_match")
            elif predicate in RISK_PREDICATES:
                # Keep risk evidence in support but apply penalties later.
                supports[subject].append({"source": "kg", "note": f"Risk fact: {fact.subject} {fact.predicate} {fact.object}."})

        chunk_blob = " ".join(f"{chunk.title} {chunk.content}" for chunk in evidence.vector_chunks).lower()
        for ingredient in list(scores.keys()) or ["paracetamol", "ibuprofen", "salbutamol"]:
            if ingredient and ingredient in chunk_blob:
                scores[ingredient] += 0.08
                supports[ingredient].append({"source": "vector", "note": f"Retrieved text mentions {ingredient}."})
                reasons[ingredient].append("vector_mention")

        symptoms = set(snapshot.normalized_symptoms)
        conditions_blob = normalize_search_text(" ".join(snapshot.suspected_conditions))
        if strategy in {"symptomatic", "disease_directed"}:
            if symptoms.intersection({"fever", "headache", "pain", "sore throat"}) or "viral" in conditions_blob:
                scores["paracetamol"] += 0.65
                reasons["paracetamol"].append("symptomatic_first_line")
            if symptoms.intersection({"pain", "headache"}) and not self._has_nsaid_risk(snapshot):
                scores["ibuprofen"] += 0.24
                reasons["ibuprofen"].append("symptomatic_nsaid_option")
            if "asthma" in conditions_blob or any(term in conditions_blob for term in ["bronchospasm", "wheez"]):
                scores["salbutamol"] += 0.75
                reasons["salbutamol"].append("bronchospasm_relief")

        penalties = self._ingredient_penalties(snapshot)
        selected: list[dict] = []
        for ingredient, score in scores.items():
            adjusted = score - penalties.get(ingredient, 0.0)
            if adjusted <= 0.18:
                continue
            selected.append(
                {
                    "ingredient": ingredient,
                    "score": round(adjusted, 3),
                    "supports": self._dedupe_supports(supports.get(ingredient, []))[:4],
                    "reasons": reasons.get(ingredient, []),
                    "penalty": penalties.get(ingredient, 0.0),
                }
            )
        selected.sort(key=lambda item: item["score"], reverse=True)
        return selected[:2]

    def _ingredient_penalties(self, snapshot: PatientSnapshot) -> dict[str, float]:
        penalties: dict[str, float] = defaultdict(float)
        if self._has_nsaid_risk(snapshot):
            for ingredient in NSAIDS:
                penalties[ingredient] += 1.25
        if snapshot.patient.hepatic_impairment:
            penalties["paracetamol"] += 0.10
        return penalties

    @staticmethod
    def _has_nsaid_risk(snapshot: PatientSnapshot) -> bool:
        allergies = {normalize_search_text(x) for x in snapshot.patient.known_allergies}
        current_meds = {normalize_search_text(x) for x in snapshot.patient.current_medications}
        chronic = {normalize_search_text(x) for x in snapshot.patient.chronic_conditions}
        return bool(
            snapshot.patient.pregnant
            or snapshot.patient.renal_impairment
            or "nsaid" in allergies
            or any(med in current_meds for med in {"warfarin", "acenocoumarol"})
            or any(cond in chronic for cond in {"peptic ulcer", "anticoagulation", "asthma"})
        )

    @staticmethod
    def _dedupe_supports(items: list[dict]) -> list[dict]:
        seen: set[tuple[str, str]] = set()
        out: list[dict] = []
        for item in items:
            key = (str(item.get("source", "")), str(item.get("note", "")))
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out

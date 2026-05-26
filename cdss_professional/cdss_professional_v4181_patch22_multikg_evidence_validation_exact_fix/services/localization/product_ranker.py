from __future__ import annotations
from libs.contracts.evidence import LocalProductEvidence
from services.localization.ingredient_aliases import canonical_active_ingredient, inhalation_form, oral_form, preferred_brand_bonus

class ProductRanker:
    def rank(self, products: list[LocalProductEvidence]) -> list[LocalProductEvidence]:
        ranked = []
        for product in products or []:
            score = float(product.score or 0.0)
            meta = dict(product.metadata or {})
            if str(meta.get("candidate_origin","")).lower() in {"explicit_evidence","evidence"}: score += 0.5
            score += preferred_brand_bonus(product.product_name, product.active_ingredient)
            ai = canonical_active_ingredient(product.active_ingredient)
            if str(meta.get("strict_mono_localization_eligible", "")).lower() in {"1", "true", "yes"}: score += 0.15
            if str(meta.get("is_combination", "")).lower() in {"1", "true", "yes"}: score -= 0.35
            if ai == "salbutamol" and inhalation_form(product.dosage_form): score += 0.25
            if ai == "paracetamol" and oral_form(product.dosage_form): score += 0.15
            meta.setdefault("ranker_source", "explicit_input_only")
            ranked.append(product.model_copy(update={"score": round(score, 3), "metadata": meta}))
        return sorted(ranked, key=lambda item: item.score, reverse=True)

from __future__ import annotations
from libs.contracts.evidence import LocalProductEvidence
from libs.contracts.prescription import MedicationDraft
from services.localization.ingredient_aliases import canonical_active_ingredient, ingredient_matches, is_combination, preferred_brand_bonus, requested_route_from_medication, route_compatible, strength_tokens

class AMMMapper:
    def map_to_candidates(self, medication: MedicationDraft, local_evidence: list[LocalProductEvidence]) -> list[LocalProductEvidence]:
        expected_ai = canonical_active_ingredient(medication.active_ingredient)
        requested_route = requested_route_from_medication(medication)
        candidates = []
        for product in local_evidence or []:
            if expected_ai and not ingredient_matches(expected_ai, product.active_ingredient, product.product_name): continue
            if expected_ai and is_combination(product.active_ingredient) and not is_combination(medication.active_ingredient): continue
            if not route_compatible(requested_route, product.dosage_form, product.active_ingredient, product.product_name): continue
            score = float(product.score or 0.1) + 0.8 + 0.3 + preferred_brand_bonus(product.product_name, expected_ai)/10.0
            mt, pt = strength_tokens(medication.dose), strength_tokens(product.strength)
            if mt and pt and mt.intersection(pt): score += 0.25
            meta = dict(product.metadata or {})
            meta["amm_match_score_raw"] = round(score * 100, 2)
            candidates.append(product.model_copy(update={"score": round(min(0.99, score), 3), "metadata": meta}))
        return sorted(candidates, key=lambda item: item.score, reverse=True)

    def _soft_match(self, medication: MedicationDraft, product: LocalProductEvidence) -> LocalProductEvidence:
        candidates = self.map_to_candidates(medication, [product])
        return candidates[0] if candidates else product.model_copy(update={"score": 0.0})

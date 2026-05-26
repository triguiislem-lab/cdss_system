from __future__ import annotations
import re
from libs.contracts.evidence import LocalProductEvidence
from libs.contracts.prescription import MedicationDraft
from services.localization.ingredient_aliases import preferred_brand_bonus, requested_route_from_medication, route_compatible, strength_tokens

class StrengthResolver:
    @staticmethod
    def _extract_strength_value(text: str) -> float | None:
        match = re.search(r"(\d+(?:[.,]\d+)?)", str(text or ""))
        return float(match.group(1).replace(",", ".")) if match else None

    def choose_best(self, medication: MedicationDraft, candidates: list[LocalProductEvidence]) -> LocalProductEvidence | None:
        if not candidates: return None
        target = self._extract_strength_value(medication.dose)
        requested_tokens = strength_tokens(medication.dose)
        requested_route = requested_route_from_medication(medication)
        def sort_key(item):
            item_tokens = strength_tokens(item.strength)
            token_match = 1 if requested_tokens and item_tokens.intersection(requested_tokens) else 0
            dist = abs((self._extract_strength_value(item.strength) or target or 0.0) - (target or 0.0))
            route_ok = 1 if route_compatible(requested_route, item.dosage_form, item.active_ingredient, item.product_name) else 0
            brand = preferred_brand_bonus(item.product_name, medication.active_ingredient)
            explicit = 1 if (item.metadata or {}).get("candidate_origin") in {"explicit_evidence","evidence"} else 0
            return (-explicit, -route_ok, -token_match, dist, -brand, -float(item.score or 0.0))
        return sorted(candidates, key=sort_key)[0]

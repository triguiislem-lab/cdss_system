from __future__ import annotations
from libs.contracts.evidence import LocalProductEvidence, RetrievalQuery
from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from services.localization.ingredient_aliases import canonical_active_ingredient, ingredient_matches, is_combination, preferred_brand_bonus, route_compatible, strength_tokens, normalize_text

class LocalFormularyRetriever:
    def __init__(self, client: LocalFormularyClient | None = None) -> None:
        self.client = client or LocalFormularyClient()

    def retrieve(self, query: RetrievalQuery | str, limit: int = 5) -> list[LocalProductEvidence]:
        if isinstance(query, RetrievalQuery):
            text, filters = query.text, (query.filters or {})
            limit = query.limit or limit
        else:
            text, filters = query, {}
        expected_ai = filters.get("active_ingredient") or filters.get("dci") or canonical_active_ingredient(text)
        expected_route = filters.get("route") or _route_from_query(text)
        try:
            products = list(self.client.load_products() or [])
        except Exception:
            products = []
        scored = []
        for product in products:
            score = self._score_product(product, text, expected_ai, expected_route)
            if score > 0:
                meta = dict(product.metadata or {})
                meta.update({"retriever_expected_active_ingredient": expected_ai, "retriever_expected_route": expected_route})
                scored.append(product.model_copy(update={"score": round(score, 3), "metadata": meta}))
        return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]

    @staticmethod
    def _score_product(product: LocalProductEvidence, query_text: str, expected_ai: str | None, expected_route: str | None) -> float:
        ai = expected_ai or canonical_active_ingredient(query_text)
        q = normalize_text(query_text)
        score = float(product.score or 0.05)
        if ai:
            if not ingredient_matches(ai, product.active_ingredient, product.product_name): return 0.0
            score += 2.0
        product_combo = is_combination(product.active_ingredient) or _truthy((product.metadata or {}).get("is_combination"))
        strict_mono = _truthy((product.metadata or {}).get("strict_mono_localization_eligible", ""))
        if ai and "mono ingredient" in q and product_combo: return 0.0
        if ai and not product_combo and strict_mono: score += 0.25
        if ai and product_combo and "combination" not in q and "+" not in str(ai): score -= 0.45
        route = expected_route or _route_from_query(query_text)
        if ai == "salbutamol": route = "inhalation"
        if ai == "paracetamol" and not route: route = "oral"
        if route and not route_compatible(route, product.dosage_form, product.active_ingredient, product.product_name): return 0.0
        if route: score += 0.35
        qt, pt = strength_tokens(query_text), strength_tokens(product.strength)
        if qt and pt and qt.intersection(pt):
            score += 0.6
        elif qt and pt:
            score -= 0.15
        score += preferred_brand_bonus(product.product_name, ai or product.active_ingredient)
        return score

def _route_from_query(text: str) -> str | None:
    q = normalize_text(text)
    if any(t in q for t in ["inhal","aerosol","spray","aerol","ventol","ventaxx"]): return "inhalation"
    if any(t in q for t in ["oral","orale","comprime","tablet","sirop","buvable"]): return "oral"
    if any(t in q for t in ["inject","iv","im"]): return "injectable"
    return None


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}

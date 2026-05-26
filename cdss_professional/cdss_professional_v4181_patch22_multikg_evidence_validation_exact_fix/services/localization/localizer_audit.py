from __future__ import annotations

from libs.contracts.evidence import LocalProductEvidence
from libs.contracts.prescription import MedicationDraft, RejectedLocalizationCandidate
from libs.utils.medical_text import dose_tokens, form_bucket, ingredient_set, normalize_search_text, route_bucket
from services.normalization.dci_normalizer import canonicalize_dci


class LocalizerAuditHelper:
    """Builds rejected candidate explanations for localizer transparency."""

    def rejected_candidates_for(
        self,
        medication: MedicationDraft,
        all_products: list[LocalProductEvidence],
        selected: LocalProductEvidence | None,
        accepted_candidates: list[LocalProductEvidence],
        limit: int = 8,
    ) -> list[RejectedLocalizationCandidate]:
        selected_name = (selected.product_name if selected else "").lower()
        accepted_names = {p.product_name.lower() for p in accepted_candidates}
        rejected: list[RejectedLocalizationCandidate] = []
        for product in all_products:
            name = product.product_name.lower()
            if name == selected_name:
                continue
            reason = self._reason(medication, product, accepted_names)
            if reason:
                rejected.append(
                    RejectedLocalizationCandidate(
                        product_name=product.product_name,
                        active_ingredient=product.active_ingredient,
                        strength=product.strength,
                        dosage_form=product.dosage_form,
                        reason=reason,
                        score=product.score,
                        metadata={
                            "source": product.metadata.get("source"),
                            "veic": product.metadata.get("veic"),
                            "hospital_only": _is_hospital_only(product),
                        },
                    )
                )
        return sorted(rejected, key=lambda item: item.score or 0.0, reverse=True)[:limit]

    def _reason(self, medication: MedicationDraft, product: LocalProductEvidence, accepted_names: set[str]) -> str | None:
        med_ing = canonicalize_dci(medication.active_ingredient)
        prod_ing = canonicalize_dci(product.active_ingredient)
        med_set = {canonicalize_dci(x) for x in ingredient_set(medication.active_ingredient) if canonicalize_dci(x)}
        prod_set = {canonicalize_dci(x) for x in ingredient_set(product.active_ingredient) if canonicalize_dci(x)}

        if med_ing and prod_ing and med_ing != prod_ing:
            if not (med_set and prod_set and med_set.intersection(prod_set)):
                return "wrong active ingredient"

        if _looks_combination(product.active_ingredient) and not _looks_combination(medication.active_ingredient):
            return "combination product rejected for mono-ingredient prescription"

        requested_route = route_bucket(medication.route, medication.dose, medication.active_ingredient)
        product_route = form_bucket(product.dosage_form)
        if _hard_route_mismatch(requested_route, product_route):
            return f"wrong route/form: requested {requested_route}, product form {product.dosage_form}"

        med_tokens = dose_tokens(medication.dose)
        product_tokens = dose_tokens(product.strength)
        if med_tokens and product_tokens and not med_tokens.intersection(product_tokens):
            return "strength mismatch"

        if _is_hospital_only(product):
            return "hospital-only product not suitable for default outpatient localization"

        indication_text = normalize_search_text(f"{product.product_name} {product.metadata.get('indication', '')} {product.dosage_form}")
        if "salbutamol" in med_ing and any(x in indication_text for x in ["sirop", "syrup", "toux", "cough"]):
            return "cough/syrup product rejected for inhaled bronchodilator case"

        if product.product_name.lower() not in accepted_names and (product.score or 0) <= 0:
            return "low localizer score"

        return None


def _looks_combination(text: str) -> bool:
    lowered = normalize_search_text(text)
    return "+" in text or " + " in text or any(token in lowered for token in ["association", "associe", "associes", "combine"])


def _is_hospital_only(product: LocalProductEvidence) -> bool:
    meta = product.metadata or {}
    values = " ".join(str(meta.get(k, "")) for k in ["hospital_only", "price", "status", "presentation", "veic"])
    values = values.upper()
    return " H " in f" {values} " or values.strip() == "H" or "HOSPITAL" in values or "HOSPITALIER" in values


def _hard_route_mismatch(requested_route: str, candidate_route: str) -> bool:
    if requested_route in {"", "unknown"} or candidate_route in {"", "other"}:
        return False
    return (requested_route, candidate_route) in {
        ("oral", "injectable"),
        ("injectable", "oral"),
        ("inhaled", "oral"),
        ("inhaled", "injectable"),
        ("oral", "inhaled"),
        ("injectable", "inhaled"),
    }

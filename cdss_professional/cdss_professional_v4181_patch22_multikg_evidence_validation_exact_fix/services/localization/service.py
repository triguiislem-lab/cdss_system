from __future__ import annotations
from libs.contracts.evidence import EvidenceBundle, LocalProductEvidence
from libs.contracts.prescription import LocalizedMedication, TherapeuticPlan
from services.localization.ingredient_aliases import canonical_active_ingredient, ingredient_matches, is_combination, preferred_brand_bonus, requested_route_from_medication, route_compatible, strength_tokens
from services.localization.localizer_audit import LocalizerAuditHelper
from services.localization.tunisia_localizer import TunisiaLocalizer
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever

PATCH_VERSION = "v4.13_explicit_first_localization"

class LocalizationService:
    PATCH_VERSION = PATCH_VERSION

    def __init__(self, localizer: TunisiaLocalizer | None = None, local_retriever: LocalFormularyRetriever | None = None, use_direct_lookup: bool = True) -> None:
        self.localizer = localizer or TunisiaLocalizer()
        self.local_retriever = local_retriever or LocalFormularyRetriever()
        self.use_direct_lookup = use_direct_lookup
        self.audit_helper = LocalizerAuditHelper()
        self.last_explicit_evidence_debug = []

    def localize(self, plan: TherapeuticPlan, evidence: EvidenceBundle) -> list[LocalizedMedication]:
        localized = []
        for medication in plan.medications:
            explicit = self._localize_from_explicit_evidence(medication, evidence.local_products)
            if explicit is not None:
                localized.append(explicit)
                continue
            single_plan = plan.model_copy(update={"medications": [medication]})
            first = self.localizer.localize(single_plan, evidence)
            if first:
                localized.extend(first)
                continue
            if not self.use_direct_lookup:
                continue
            direct_products = self._direct_lookup(medication)
            second = self.localizer.localize(single_plan, evidence.model_copy(update={"local_products": direct_products}))
            if second:
                localized.extend(second)
                continue
            direct_explicit = self._localize_from_explicit_evidence(medication, direct_products)
            if direct_explicit is not None:
                localized.append(direct_explicit)
        return sorted(localized, key=lambda item: item.match_confidence or 0.0, reverse=True)

    def _localize_from_explicit_evidence(self, medication, products: list[LocalProductEvidence]) -> LocalizedMedication | None:
        self.last_explicit_evidence_debug = []
        expected_ai = canonical_active_ingredient(medication.active_ingredient)
        requested_route = requested_route_from_medication(medication)
        med_strength = strength_tokens(medication.dose)
        candidates = []
        for product in products or []:
            product_ai = canonical_active_ingredient(product.active_ingredient)
            product_name_ai = canonical_active_ingredient(product.product_name)
            product_strength = strength_tokens(product.strength)
            debug = {"product_name": product.product_name, "expected_ai": expected_ai, "product_ai": product_ai, "product_name_ai": product_name_ai, "requested_route": requested_route, "form": product.dosage_form, "accepted": False, "reason": None}
            if expected_ai and not ingredient_matches(expected_ai, product.active_ingredient, product.product_name):
                debug["reason"] = "active_ingredient_mismatch"; self.last_explicit_evidence_debug.append(debug); continue
            if expected_ai and is_combination(product.active_ingredient) and not is_combination(medication.active_ingredient):
                debug["reason"] = "combination_rejected"; self.last_explicit_evidence_debug.append(debug); continue
            if not route_compatible(requested_route, product.dosage_form, product.active_ingredient, product.product_name):
                debug["reason"] = "route_or_form_mismatch"; self.last_explicit_evidence_debug.append(debug); continue
            strength_match = bool(med_strength and product_strength and med_strength.intersection(product_strength))
            score = float(product.score or 0.0) + 100.0
            if strength_match: score += 5.0
            if expected_ai == product_ai: score += 2.0
            if expected_ai == product_name_ai: score += 1.0
            score += preferred_brand_bonus(product.product_name, expected_ai or product.active_ingredient)
            meta = dict(product.metadata or {})
            meta.update({"candidate_origin": meta.get("candidate_origin") or "explicit_evidence", "explicit_evidence_precedence": True, "explicit_evidence_match_score": round(score, 3), "explicit_evidence_debug": debug})
            debug.update({"accepted": True, "reason": "explicit_evidence_match", "score": round(score, 3)})
            self.last_explicit_evidence_debug.append(debug)
            candidates.append((score, product.model_copy(update={"score": round(score, 3), "metadata": meta}), debug))
        if not candidates:
            return None
        _, selected, selected_debug = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
        rejected = self.audit_helper.rejected_candidates_for(medication=medication, all_products=products, selected=selected, accepted_candidates=[item[1] for item in candidates])
        raw_score = selected.metadata.get("explicit_evidence_match_score")
        notes = [
            "Explicit evidence candidate selected before TunisiaLocalizer and before direct local lookup.",
            "candidate_origin=explicit_evidence",
            "explicit_evidence_precedence=True",
            f"Raw AMM match score={raw_score}",
            f"explicit_evidence_match_score={raw_score}",
            f"Rejected explicit candidate explanations stored: {len(rejected)}.",
            f"patch_version={PATCH_VERSION}",
            f"explicit_evidence_debug={selected_debug}",
        ]
        return LocalizedMedication(generic=medication, local_product_name=selected.product_name, strength=selected.strength, dosage_form=selected.dosage_form, market=selected.market, reimbursement_note=None, match_confidence=0.99, localization_notes=notes, rejected_candidates=rejected)

    def _direct_lookup(self, medication) -> list[LocalProductEvidence]:
        query = f"{medication.active_ingredient} {medication.dose} {medication.route} Tunisia mono ingredient local formulary"
        products = list(self.local_retriever.retrieve(query, limit=25) or [])
        out = []
        for product in products:
            meta = dict(product.metadata or {})
            meta.setdefault("candidate_origin", "direct_lookup")
            out.append(product.model_copy(update={"metadata": meta}))
        return out

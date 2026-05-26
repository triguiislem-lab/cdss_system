from libs.contracts.evidence import EvidenceBundle, LocalProductEvidence
from libs.contracts.prescription import LocalizedMedication, TherapeuticPlan

from services.localization.amm_mapper import AMMMapper
from services.localization.localizer_audit import LocalizerAuditHelper
from services.localization.product_ranker import ProductRanker
from services.localization.strength_resolver import StrengthResolver
from services.localization.vei_mapper import VEIMapper


class TunisiaLocalizer:
    """Localizes a generic plan to Tunisian market products with rejected-candidate audit."""

    def __init__(self) -> None:
        self.amm_mapper = AMMMapper()
        self.product_ranker = ProductRanker()
        self.strength_resolver = StrengthResolver()
        self.vei_mapper = VEIMapper()
        self.audit_helper = LocalizerAuditHelper()

    def localize(self, plan: TherapeuticPlan, evidence: EvidenceBundle) -> list[LocalizedMedication]:
        localized: list[LocalizedMedication] = []
        ranked_products = self.product_ranker.rank(evidence.local_products)

        for medication in plan.medications:
            candidates = self.amm_mapper.map_to_candidates(medication, ranked_products)
            choice = self.strength_resolver.choose_best(medication, candidates)
            if choice is None:
                continue
            rejected = self.audit_helper.rejected_candidates_for(
                medication=medication,
                all_products=ranked_products,
                selected=choice,
                accepted_candidates=candidates,
            )
            localized.append(self._build_localized_medication(medication, choice, len(candidates), rejected))
        return localized

    def _build_localized_medication(
        self,
        medication,
        choice: LocalProductEvidence,
        candidate_count: int,
        rejected_candidates,
    ) -> LocalizedMedication:
        raw_match = choice.metadata.get("amm_match_score_raw")
        notes = [
            "Notebook-derived AMM matching heuristics applied: DCI, route/form, dose, indication, and VEIC tie-breakers.",
            f"Selected from {candidate_count} accepted candidate(s).",
            f"Rejected candidate explanations stored: {len(rejected_candidates)}.",
        ]
        if raw_match is not None:
            notes.append(f"Raw AMM match score={raw_match}.")
        if choice.metadata.get("requires_freshness_check_for_availability_price"):
            notes.append("Historical/local reference requires freshness check for current availability or price.")
        confidence = min(0.99, max(0.25, float(choice.score)))
        return LocalizedMedication(
            generic=medication,
            local_product_name=choice.product_name,
            strength=choice.strength,
            dosage_form=choice.dosage_form,
            reimbursement_note=self.vei_mapper.get_note(choice.product_name),
            match_confidence=round(confidence, 3),
            localization_notes=notes,
            rejected_candidates=rejected_candidates,
        )

from __future__ import annotations

from services.domain.contracts import RouteDecision
from services.domain.utils import unique


class ClinicianReviewPolicy:
    def reasons_for(self, decision: RouteDecision) -> list[str]:
        reasons = []
        if decision.clinician_review_required:
            reasons.append("doctor_final_validation_required")
        reasons.extend(decision.block_reasons)
        reasons.extend(decision.missing_information.blocking)
        reasons.extend(decision.missing_information.informative)
        reasons.extend([f"forbidden:{x}" for x in decision.forbidden_ingredients])
        return unique(reasons)

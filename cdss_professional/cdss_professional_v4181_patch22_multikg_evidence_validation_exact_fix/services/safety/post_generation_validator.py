from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from services.normalization.dci_normalizer import canonicalize_dci, canonicalize_dci_list


class RemovedMedication(BaseModel):
    active_ingredient: str
    reason: str
    rule_id: str | None = None


class PostGenerationValidationResult(BaseModel):
    mode: str = "off"
    safe: bool = True
    blocked_route_has_prescription: bool = False
    removed_medications: list[RemovedMedication] = Field(default_factory=list)
    findings: list[str] = Field(default_factory=list)
    audit: dict[str, Any] = Field(default_factory=dict)


class PostGenerationSafetyValidator:
    """Second safety gate after LLM/fallback generation.

    In audit mode the validator only reports unsafe output.  In enforce mode it
    removes unsafe medications from the TherapeuticPlan.  It is intentionally
    conservative and active-ingredient based.
    """

    def validate(self, snapshot, plan, execution_plan, mode: str = "audit") -> tuple[Any, PostGenerationValidationResult]:
        mode = (mode or "off").lower()
        meds = list(getattr(plan, "medications", []) or [])
        forbidden = set(canonicalize_dci_list(getattr(execution_plan, "forbidden_ingredients", []) or []))
        route = getattr(execution_plan, "route", None) or getattr(snapshot, "route_recommendation", None)
        sub_route = getattr(execution_plan, "sub_route", None)

        result = PostGenerationValidationResult(mode=mode, safe=True)
        if mode == "off":
            return plan, result

        if route in {"review", "emergency", "non_pharma", "blocked"} and sub_route != "review_draft_allowed" and meds:
            result.safe = False
            result.blocked_route_has_prescription = True
            result.findings.append(f"Route {route} must not contain an authorized medication draft.")

        kept = []
        for med in meds:
            ing = str(getattr(med, "active_ingredient", "") or "").strip()
            ing_l = canonicalize_dci(ing)
            blocked_by_forbidden = ing_l in forbidden
            if blocked_by_forbidden:
                result.safe = False
                result.removed_medications.append(
                    RemovedMedication(active_ingredient=ing, reason="Ingredient is forbidden by ExecutionPlan/policy.", rule_id="forbidden_ingredient")
                )
                continue
            if route in {"review", "emergency", "non_pharma", "blocked"} and sub_route != "review_draft_allowed":
                result.removed_medications.append(
                    RemovedMedication(active_ingredient=ing, reason=f"Medication draft suppressed because route={route}.", rule_id="blocked_route_contains_prescription")
                )
                continue
            kept.append(med.model_copy(update={"active_ingredient": ing_l}) if ing_l else med)

        result.audit = {
            "route": route,
            "sub_route": sub_route,
            "forbidden_ingredients": sorted(forbidden),
            "input_medication_count": len(meds),
            "kept_medication_count": len(kept),
        }

        if mode == "enforce" and len(kept) != len(meds):
            notes = list(getattr(plan, "generation_notes", []) or [])
            notes.append("PostGenerationSafetyValidator removed unsafe or unauthorized medication draft entries.")
            plan = plan.model_copy(update={"medications": kept, "generation_notes": list(dict.fromkeys(notes))})

        return plan, result

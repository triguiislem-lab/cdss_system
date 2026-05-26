from __future__ import annotations

from typing import Any


def should_run_level1_llm(parsed: dict[str, Any], runtime_text: str = "", *, mode: str = "assist", policy: str = "selective") -> tuple[bool, str]:
    """Decide whether Level-1 Qwen extraction should run.

    Production-resource policy:
    - Always run static deterministic extraction first.
    - Call Qwen Level 1 only when the static result is unclear, complex,
      safety-sensitive, long/multilingual, contradictory, or missing truly
      critical information.
    - Do not call Qwen only because a risk term was explicitly negated.
    """
    policy_norm = (policy or "selective").strip().lower()
    mode_norm = (mode or "assist").strip().lower()
    if policy_norm in {"never", "off", "disabled", "false", "0"}:
        return False, "policy_disabled"
    if policy_norm in {"always", "all", "force"} or mode_norm == "shadow":
        return True, "policy_always_or_shadow"

    symptoms = parsed.get("symptoms") or []
    missing = set(parsed.get("missing_critical_information") or [])
    ctx = parsed.get("extracted_context") or {}
    unresolved = ctx.get("unresolved_flags") or []
    red_flags = ctx.get("red_flags") or []
    current_meds = parsed.get("current_medications") or ctx.get("current_medications") or []
    disease_tags = parsed.get("disease_tags") or []
    runtime = (runtime_text or parsed.get("runtime_text") or "").strip()
    runtime_lower = runtime.lower()
    token_count = len(runtime.split())

    pregnancy_mentioned = bool(parsed.get("pregnancy_mentioned"))
    pregnancy_negated = bool(parsed.get("pregnancy_negated"))
    renal_mentioned = bool(parsed.get("renal_mentioned"))
    renal_negated = bool(parsed.get("renal_negated"))
    hepatic_mentioned = bool(parsed.get("hepatic_mentioned"))
    hepatic_negated = bool(parsed.get("hepatic_negated"))

    positive_safety_context = (
        (pregnancy_mentioned and not pregnancy_negated)
        or (renal_mentioned and not renal_negated)
        or (hepatic_mentioned and not hepatic_negated)
    )

    if not symptoms:
        return True, "no_clear_symptom"

    if "clear symptom description" in missing:
        return True, "critical_information_missing:clear_symptom_description"

    medication_context_terms = [
        "demande", "request", "ibuprofen", "ibuprofene", "ibuprofène",
        "amoxicillin", "amoxicilline", "paracetamol", "paracétamol",
        "warfarin", "aspirin", "anti inflammatoire", "ains", "nsaid",
    ]
    medication_context = bool(current_meds) or any(term in runtime_lower for term in medication_context_terms)

    if "current medications" in missing and (positive_safety_context or medication_context):
        return True, "critical_information_missing:current_medications_relevant"

    other_critical = missing.intersection({"clinical risk clarification"})
    if other_critical:
        return True, "critical_information_missing:" + ",".join(sorted(other_critical))

    negated_only_context = (
        (renal_mentioned and renal_negated or hepatic_mentioned and hepatic_negated or pregnancy_mentioned and pregnancy_negated)
        and not positive_safety_context
    )
    if unresolved and not negated_only_context:
        return True, "unresolved_static_extraction_flags"

    if red_flags:
        return True, "red_flag_context"

    if positive_safety_context:
        if pregnancy_mentioned and not pregnancy_negated:
            return True, "pregnancy_context_not_negated"
        if renal_mentioned and not renal_negated:
            return True, "renal_context_not_negated"
        if hepatic_mentioned and not hepatic_negated:
            return True, "hepatic_context_not_negated"

    if len(current_meds) >= 2:
        return True, "polypharmacy_context"
    if len(symptoms) >= 4 or len(disease_tags) >= 2:
        return True, "multi_problem_context"
    if token_count >= 100:
        return True, "long_or_transcript_like_input"

    has_arabic = any("\u0600" <= ch <= "\u06FF" for ch in runtime)
    has_latin = any(("a" <= ch.lower() <= "z") for ch in runtime)
    if has_arabic and has_latin:
        return True, "mixed_language_or_complex_text"

    if any(marker in runtime_lower for marker in ["puis precise", "puis précise", "mais", "contradict", "au debut", "au début", "ensuite"]):
        return True, "possible_contradiction"

    return False, "static_extraction_confident"

from __future__ import annotations

import os
import re
from typing import Any

from libs.contracts.execution import ExecutionPlan
from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci, canonicalize_dci_list
from services.safety.policy_models import PolicyDecision
from services.safety.policy_engine import SafetyPolicyEngine
from services.safety.policy_matchers import positive_pregnancy
from services.planning.indication_therapy_planner import IndicationTherapyPlanner
from services.domain.contracts import BusinessInputs
from services.domain.route_decision_engine import RouteDecisionEngine
from services.domain.utils import CARDIAC_CHEST_TERMS, CARDIAC_ASSOCIATED_TERMS

TARGET_DEFAULTS = {
    "paracetamol": {
        "strength": "500 mg",
        "dose": "500 mg",
        "route": "oral",
        "form": "oral solid or oral solution",
        "intent": "symptomatic analgesic/antipyretic",
    },
    "salbutamol": {
        "strength": "100 mcg",
        "dose": "100 mcg",
        "route": "inhalation",
        "form": "inhaler/aerosol",
        "intent": "acute wheezing rescue bronchodilator",
    },
    "ibuprofen": {
        "strength": "200 mg",
        "dose": "200 mg",
        "route": "oral",
        "form": "oral solid or oral suspension",
        "intent": "NSAID analgesic/anti-inflammatory; conservative review if risk data incomplete",
    },
    "cetirizine": {
        "strength": "10 mg",
        "dose": "10 mg",
        "route": "oral",
        "form": "tablet or oral solution",
        "intent": "antihistamine symptomatic relief",
    },
    "omeprazole": {
        "strength": "20 mg",
        "dose": "20 mg",
        "route": "oral",
        "form": "capsule/tablet",
        "intent": "short-course reflux/dyspepsia symptom relief after alarm signs excluded",
    },
    "oral_rehydration_salts": {
        "strength": "standard sachet",
        "dose": "as directed after dilution",
        "route": "oral",
        "form": "oral rehydration solution",
        "intent": "supportive oral rehydration",
    },
    "alginate": {"strength": "standard dose", "dose": "as directed", "route": "oral", "form": "suspension/sachet", "intent": "reflux symptom relief"},
    "artificial_tears": {"strength": "lubricating drops", "dose": "as directed", "route": "ocular", "form": "eye drops", "intent": "dry eye lubrication"},
    "saline_nasal_spray": {"strength": "isotonic saline", "dose": "as directed", "route": "nasal", "form": "nasal spray", "intent": "nasal cleansing/decongestion support"},
    "benzoyl_peroxide_topical": {"strength": "2.5-5%", "dose": "thin layer", "route": "topical", "form": "gel/cream", "intent": "mild acne topical therapy"},
    "psyllium": {"strength": "standard sachet", "dose": "as directed with water", "route": "oral", "form": "powder/sachet", "intent": "constipation fibre supplement"},
    "chlorhexidine_mouthwash": {"strength": "0.12-0.2%", "dose": "mouth rinse", "route": "oral_mucosal", "form": "mouthwash", "intent": "minor oral ulcer antiseptic rinse"},
    "dexpanthenol_topical": {"strength": "topical", "dose": "thin layer", "route": "topical", "form": "cream/ointment", "intent": "minor superficial burn skin care"},
    "aciclovir_topical": {"strength": "5%", "dose": "thin layer", "route": "topical", "form": "cream", "intent": "cold sore topical antiviral"},
    "dimenhydrinate": {"strength": "50 mg", "dose": "as directed", "route": "oral", "form": "tablet", "intent": "motion sickness prevention"},
    "lidocaine_topical": {"strength": "topical", "dose": "thin layer", "route": "topical", "form": "cream/gel", "intent": "minor hemorrhoid discomfort relief"},
    "diclofenac_topical": {"strength": "1%", "dose": "thin layer", "route": "topical", "form": "gel", "intent": "localized muscle strain topical NSAID under negative screens"},
}

# Direct draft-prescription is limited to low-risk/simple targets. Higher-risk
# medicines such as NSAIDs/antibiotics may only use review_draft_allowed after
# explicit context checks, even though they have fallback templates for doctor
# review drafts.
SIMPLE_DRAFT_ALLOWLIST = {
    "paracetamol",
    "salbutamol",
    "cetirizine",
    "omeprazole",
    "oral_rehydration_salts",
    # Patch15: additional low-risk, local symptomatic protocol targets used by
    # v3 consultation fixtures.  These can route to draft_prescription only when
    # no blocking policy/red-flag/forbidden ingredient is present.
    "alginate",
    "artificial_tears",
    "saline_nasal_spray",
    "benzoyl_peroxide_topical",
    "psyllium",
    "chlorhexidine_mouthwash",
    "dexpanthenol_topical",
    "aciclovir_topical",
    "dimenhydrinate",
    "lidocaine_topical",
    "diclofenac_topical",
}


def _as_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(x) for x in value if str(x).strip()]
    return [str(value)]


def _snapshot_text(snapshot: PatientSnapshot, *, include_missing_info: bool = False) -> str:
    """Text used for planner target inference and legacy safety rules.

    Missing-critical-information fields are excluded by default so phrases such
    as "pregnancy status missing" cannot accidentally trigger pregnancy review.
    """
    parts: list[str] = []
    for attr in ["normalized_runtime_text", "doctor_notes", "raw_text", "transcript_text"]:
        val = getattr(snapshot, attr, None)
        if val:
            parts.append(str(val))
    for attr in ["normalized_symptoms", "suspected_conditions", "disease_tags"]:
        parts.extend(_as_list(getattr(snapshot, attr, [])))
    if include_missing_info:
        parts.extend(_as_list(getattr(snapshot, "missing_critical_information", [])))
    ctx = getattr(snapshot, "extracted_context", None)
    if isinstance(ctx, dict):
        for k, v in ctx.items():
            if k in {"missing_critical_information", "missing_info"} and not include_missing_info:
                continue
            if isinstance(v, (str, int, float)):
                parts.append(str(v))
            elif isinstance(v, list):
                parts.extend(str(x) for x in v)
    return normalize_search_text(" ".join(parts))


def _has_any(blob: str, terms: list[str]) -> bool:
    for raw in terms:
        term = normalize_search_text(raw)
        if not term:
            continue
        pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(term) + r"(?![a-z0-9\u0600-\u06FF])"
        if re.search(pattern, blob):
            return True
    return False


def _negative_reply_after_term_for_exec(after: str) -> bool:
    reply_pattern = r"\b(?:non|no|لا|rien\s+de\s+ca|rien\s+de\s+ça|rien\s+de\s+tout\s+ca|rien\s+de\s+tout\s+ça|none\s+of\s+that)\b"
    speaker_pattern = r"\bpatient\s+(?:non|no|rien\s+de\s+ca|rien\s+de\s+ça|rien\s+de\s+tout\s+ca|rien\s+de\s+tout\s+ça|none\s+of\s+that)\b"
    stripped = after.strip()
    if re.match(reply_pattern, stripped):
        return True
    m = re.search(reply_pattern, after)
    sm = re.search(speaker_pattern, after)
    if m and ("?" in after[:m.end()] or m.start() <= 80):
        return True
    if sm and "doctor" not in after[:sm.start()] and "docteur" not in after[:sm.start()] and "medecin" not in after[:sm.start()]:
        return True
    return False


def _has_any_positive(blob: str, terms: list[str]) -> bool:
    for raw in terms:
        term = normalize_search_text(raw)
        if not term:
            continue
        pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(term) + r"(?![a-z0-9\u0600-\u06FF])"
        for match in re.finditer(pattern, blob):
            before = blob[max(0, match.start() - 95):match.start()]
            after = blob[match.end():min(len(blob), match.end() + 170)]
            if re.search(r"(?:^|\b)(?:pas\s+de|pas\s+d|aucun|aucune|sans|nie|non|no|denies|negative\s+for|absence\s+de|absence\s+d|without|no\s+evidence\s+of)(?:\s+\w+){0,1}\s*$", before):
                continue
            if _negative_reply_after_term_for_exec(after):
                continue
            return True
    return False


def _dump(obj: Any) -> Any:
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if hasattr(obj, "dict"):
        return obj.dict()
    return obj


def _policy_hits_as_dicts(policy_decision) -> list[dict[str, Any]]:
    return [_dump(h) for h in getattr(policy_decision, "policy_hits", []) or []]


def _policy_audit_payload(
    policy_decision,
    current_route: str,
    current_allowed_to_generate: bool,
    mode: str = "audit",
    effective_route: str | None = None,
) -> dict[str, Any]:
    decision_dict = _dump(policy_decision) or {}
    route_override = decision_dict.get("route_override")
    allowed = decision_dict.get("allowed_to_generate")
    return {
        "mode": mode,
        "current_route": current_route,
        "effective_route": effective_route or current_route,
        "current_allowed_to_generate": current_allowed_to_generate,
        "policy_route_override": route_override,
        "policy_allowed_to_generate": allowed,
        "policy_reason_code": decision_dict.get("reason_code"),
        "policy_safety_explanation": decision_dict.get("safety_explanation"),
        "policy_forbidden_ingredients": decision_dict.get("forbidden_ingredients", []),
        "policy_required_missing_data": decision_dict.get("required_missing_data", []),
        "policy_hits": decision_dict.get("policy_hits", []),
        "would_override_route": bool(route_override and route_override != current_route),
        "would_block_generation": bool(allowed is False and current_allowed_to_generate),
        "enforced": bool(
            mode == "enforce"
            and (
                (route_override and route_override != current_route)
                or (allowed is False and current_allowed_to_generate)
            )
        ),
    }


def _medical_orders_values(medical_orders, attr: str) -> list[str]:
    if medical_orders is None:
        return []
    val = medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])
    return _as_list(val)


def _mention_value(mention, attr: str, default=None):
    if isinstance(mention, dict):
        return mention.get(attr, default)
    return getattr(mention, attr, default)


def _medical_order_mentions(medical_orders, attr: str = "medication_mentions") -> list[Any]:
    if medical_orders is None:
        return []
    return (medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])) or []


def _only_negated_context_without_actionable_order(medical_orders) -> bool:
    """True when medicine names appear only as negated/not-current/history.

    This is a guardrail context, not a medication request or prescription target.
    It should prevent generation of that ingredient but should not by itself turn
    a benign no-medication or viral-support consultation into review_blocked.
    """
    if medical_orders is None:
        return False
    if _medical_orders_values(medical_orders, "requested_medications") or _medical_orders_values(medical_orders, "authorized_medications"):
        return False
    if _medical_orders_values(medical_orders, "already_taken_medications"):
        return False
    statuses: list[str] = []
    for mention in _medical_order_mentions(medical_orders, "medication_mentions"):
        med = _mention_value(mention, "medication") or _mention_value(mention, "description")
        status = str(_mention_value(mention, "authorization_status", "") or "")
        if med:
            statuses.append(status)
    return bool(statuses) and all(s in {"negated_or_avoid", "not_currently_taking", "historical"} for s in statuses)


def _already_taken_any(medical_orders, terms: list[str]) -> bool:
    if medical_orders is None:
        return False
    taken = normalize_search_text(" ".join(_medical_orders_values(medical_orders, "already_taken_medications")))
    if _has_any(taken, terms):
        return True
    mentions = medical_orders.get("medication_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "medication_mentions", [])
    for mention in mentions or []:
        status = mention.get("authorization_status") if isinstance(mention, dict) else getattr(mention, "authorization_status", None)
        if status != "already_taken":
            continue
        med = mention.get("medication") if isinstance(mention, dict) else getattr(mention, "medication", None)
        desc = mention.get("description") if isinstance(mention, dict) else getattr(mention, "description", None)
        if _has_any(normalize_search_text(" ".join(_as_list(med)+_as_list(desc))), terms):
            return True
    return False


def _paracetamol_overuse_signal(blob: str, medical_orders=None) -> bool:
    has_para_context = _has_any(blob, ["paracetamol", "paracétamol", "doliprane", "adol", "acetaminophen", "doli"]) or _already_taken_any(medical_orders, ["paracetamol", "doliprane", "adol", "acetaminophen"])
    if not has_para_context:
        return False
    explicit_overuse = _has_any(blob, [
        "paracetamol overuse", "surconsommation paracetamol", "surconsommation paracétamol",
        "too much paracetamol", "prise excessive paracetamol", "already took doliprane",
        "deja pris doliprane", "déjà pris doliprane", "khdhit doliprane", "5dhit doliprane",
        "sachet grippe", "contains paracetamol", "contient aussi du paracetamol", "contient aussi du paracétamol",
        "medicament rhume", "médicament rhume", "combination cold medicine"
    ])
    high_tablet_count = re.search(r"\b(?:[6-9]|1[0-9])\s*(?:comprime|comprimes|comprimé|comprimés|tablet|tablets|cp)\b", blob) is not None
    repeated_today = _has_any(blob, ["depuis ce matin", "aujourd hui", "aujourd'hui", "today", "several doses", "plusieurs doses", "brcha", "barcha", "beaucoup"]) and _already_taken_any(medical_orders, ["paracetamol", "doliprane", "adol", "acetaminophen"])
    return bool(explicit_overuse or high_tablet_count or repeated_today)


def _young_child_or_pediatric(snapshot: PatientSnapshot, blob: str) -> bool:
    age = getattr(getattr(snapshot, "patient", None), "age_years", None)
    if age is not None:
        try:
            if float(age) < 18:
                return True
        except Exception:
            pass
    return _has_any(blob, ["child", "enfant", "pediatric", "pédiatrique", "pediatrique", "bébé", "bebe", "infant", "nourrisson", "parent"])


def infer_route_override(snapshot: PatientSnapshot, blob: str, medical_orders=None) -> tuple[str | None, str | None]:
    """Legacy deterministic triage fallback.

    V4.18 keeps this as a conservative fallback while policy rules are migrated
    into SafetyPolicyEngine. It intentionally uses positive-only pregnancy
    detection and does not inspect missing-information text.
    """
    pregnant_positive = positive_pregnancy(snapshot, blob)

    if _has_any(blob, ["suicidal ideation", "suicide", "idées suicidaires", "idees suicidaires"]):
        return "emergency", "suicidal_ideation_red_flag"

    try:
        age_years = float(getattr(getattr(snapshot, "patient", None), "age_years", 999) or 999)
    except Exception:
        age_years = 999
    if age_years < 0.25 and _has_any(blob, ["fever", "fievre", "fièvre", "temperature", "température", "38", "skhana", "s5ana", "حمى", "سخانة"]):
        return "emergency", "young_infant_fever_red_flag"

    if _has_any_positive(blob, ["anaphylaxis", "anaphylaxie", "lip swelling", "gonflement des levres", "gonflement des lèvres"]) and _has_any_positive(blob, ["dyspnea", "dyspnee", "dyspnée", "rash", "urticaire", "eruption"]):
        return "emergency", "possible_anaphylaxis"

    if _has_any_positive(blob, ["severe dyspnea", "dyspnee severe", "dyspnée sévère", "cyanosis", "cyanose"]):
        return "emergency", "severe_dyspnea_red_flag"

    if _has_any_positive(blob, CARDIAC_CHEST_TERMS) and _has_any_positive(blob, CARDIAC_ASSOCIATED_TERMS):
        return "emergency", "chest_pain_red_flags"

    stroke_face_terms = ["face droop", "facial droop", "face weakness", "facial weakness", "deviation bouche", "bouche deviee", "bouche déviée"]
    stroke_arm_terms = ["arm weakness", "arm drift", "weak arm", "faiblesse bras", "main faible", "bras faible"]
    stroke_speech_terms = ["speech difficulty", "slurred speech", "trouble parole", "aphasie", "speech problem", "parole trouble"]
    if (
        _has_any_positive(blob, ["stroke", "avc", "fast positive", "face arm speech", "fast face arm speech"])
        or (_has_any_positive(blob, stroke_face_terms) and _has_any_positive(blob, stroke_arm_terms) and _has_any_positive(blob, stroke_speech_terms))
    ):
        return "emergency", "stroke_fast_red_flag"

    if (pregnant_positive or _has_any_positive(blob, ["preeclampsia", "pre eclampsia", "prééclampsie"])) and _has_any_positive(blob, ["visual blur", "vision floue", "blurred vision", "severe headache", "cephalee intense", "céphalée intense", "hypertension", "preeclampsia", "prééclampsie"]):
        return "emergency", "pregnancy_preeclampsia_concern"

    if _has_any(blob, ["myopia", "myopie", "astigmatism", "astigmatisme", "glasses", "lunettes", "diet", "regime", "régime", "lifestyle", "hygiene de vie", "hygiène de vie"]):
        return "non_pharma", "non_pharmacologic_problem"

    if pregnant_positive or _has_any(blob, ["breastfeeding", "allaitement", "j allaite", "j'allaite"]):
        return "review", "pregnancy_or_breastfeeding_review"

    if _has_any(blob, ["renal impairment", "kidney disease", "insuffisance renale", "insuffisance rénale", "maladie renale", "maladie rénale"]):
        return "review", "renal_risk_review"

    if _has_any(blob, ["hepatic impairment", "liver failure", "insuffisance hepatique", "insuffisance hépatique", "cirrhosis", "cirrhose"]):
        return "review", "hepatic_risk_review"

    if _has_current_anticoagulant(snapshot, medical_orders) and _has_any(blob, ["ibuprofen", "ibuprofene", "ibuprofène", "nsaid", "ains", "diclofenac", "naproxen"]):
        return "review", "anticoagulant_nsaid_interaction_review"

    if _has_any(blob, ["penicillin allergy", "allergie penicilline", "allergie à la pénicilline", "allergy amoxicillin", "allergie amoxicilline"]) and _has_any(blob, ["amoxicillin", "amoxicilline", "amoxicillin request"]):
        return "review", "penicillin_allergy_amoxicillin_review"

    if _has_any(blob, ["amoxicillin", "amoxicilline", "antibiotic", "antibiotique"]) and _has_any(blob, ["viral", "virus", "urti", "rhume", "sore throat", "mal de gorge"]):
        bacterial_confirmed = _has_any(blob, [
            "angine bacterienne", "angine bactérienne", "infection bacterienne confirmee", "infection bactérienne confirmée",
            "infection bacterienne documentee", "infection bactérienne documentée", "streptocoque positif",
            "test streptococcique positif", "tdr positif", "bacterien documente", "bactérien documenté",
            "diagnostic bacterien confirme", "diagnostic bactérien confirmé", "bacterial confirmed",
            "confirmed bacterial infection", "positive strep"
        ])
        if not bacterial_confirmed:
            return "review", "antibiotic_stewardship_review"

    if _has_any(blob, ["pediatric", "child", "enfant", "bébé", "bebe", "infant", "nourrisson"]) and not _has_any(blob, ["kg", "kilogram", "poids", "weight"]):
        return "review", "pediatric_weight_required"

    if _has_any(blob, ["ear pain", "otalgie", "douleur oreille", "mal oreille"]) and _has_any(blob, ["child", "enfant", "pediatric", "pediatrique", "pédiatrique"]):
        return "review", "child_ear_pain_review"

    if _paracetamol_overuse_signal(blob, medical_orders=medical_orders):
        return "review", "paracetamol_overuse_review"

    if _young_child_or_pediatric(snapshot, blob) and _has_any(blob, ["codeine", "codéine", "codine"]) and _has_any(blob, ["cough", "toux", "k7a", "ka7a", "sirop"]):
        return "review", "child_codeine_cough_review"

    if _has_any(blob, ["elderly", "personne agee", "personne âgée", "polypharmacy", "polymedication", "polymédication"]):
        return "review", "elderly_polypharmacy_review"

    if _has_any(blob, ["dental swelling", "abcès dentaire", "abces dentaire", "swelling gum", "joue gonflee", "joue gonflée"]):
        return "review", "dental_swelling_or_abscess_review"

    return None, None


def _positive_current_anticoagulant_from_blob(blob: str) -> bool:
    text = normalize_search_text(blob)
    if not text:
        return False
    if any(_has_any(text, [neg]) for neg in ["ne prend pas", "sans anticoagulant", "nie anticoagulant", "no anticoagulant", "denies anticoagulant", "not taking"]):
        return False
    patterns = [
        r"\b(?:on|taking|currently taking|already taking)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
        r"\b(?:prend|prends|sous|sous traitement|traitement par|actuellement sous)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
    ]
    return any(re.search(pattern, text) for pattern in patterns)


def _has_current_anticoagulant(snapshot: PatientSnapshot, medical_orders=None) -> bool:
    terms = ["warfarin", "acenocoumarol", "sintrom", "anticoagulant", "avk"]
    parts: list[str] = []
    patient = getattr(snapshot, "patient", None)
    if patient is not None:
        parts.extend(_as_list(getattr(patient, "current_medications", [])))
    parts.extend(_as_list(getattr(snapshot, "current_medications", [])))
    if medical_orders is not None:
        val = medical_orders.get("already_taken_medications", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "already_taken_medications", [])
        parts.extend(_as_list(val))
        mentions = medical_orders.get("medication_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "medication_mentions", [])
        for mention in mentions or []:
            status = mention.get("authorization_status") if isinstance(mention, dict) else getattr(mention, "authorization_status", None)
            if status == "already_taken":
                med = mention.get("medication") if isinstance(mention, dict) else getattr(mention, "medication", None)
                desc = mention.get("description") if isinstance(mention, dict) else getattr(mention, "description", None)
                parts.extend(_as_list(med) + _as_list(desc))
    med_blob = normalize_search_text(" ".join(parts))
    return _has_any(med_blob, terms) or (medical_orders is None and _positive_current_anticoagulant_from_blob(_snapshot_text(snapshot)))


def _medical_orders_text(medical_orders) -> str:
    if medical_orders is None:
        return ""
    parts: list[str] = []
    for attr in ["requested_medications", "already_taken_medications", "authorized_medications"]:
        val = medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])
        parts.extend(_as_list(val))
    for attr in ["requested_therapeutic_classes", "authorized_therapeutic_classes", "case_type"]:
        val = medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])
        parts.extend(_as_list(val))
    for attr in ["medication_mentions", "therapeutic_class_mentions", "symptom_mentions", "risk_mentions", "red_flag_mentions"]:
        mentions = medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])
        for mention in mentions or []:
            status = mention.get("authorization_status", mention.get("status", "")) if isinstance(mention, dict) else getattr(mention, "authorization_status", getattr(mention, "status", ""))
            # Risk mentions produced from negated screening phrases such as
            # "pas enceinte" are useful audit data, but must not be appended
            # back into the free-text blob as positive pregnancy/renal/DDI
            # evidence. Structured rules consume positive statuses separately.
            if attr == "risk_mentions" and status in {"mentioned_not_authorized", "negated_or_avoid"}:
                continue
            if isinstance(mention, dict):
                for field in ["medication", "description", "canonical", "canonical_class", "text", "source", "authorization_status", "status"]:
                    if status == "not_currently_taking" and field in {"medication", "description", "canonical", "canonical_class", "text"}:
                        continue
                    parts.extend(_as_list(mention.get(field)))
            else:
                for field in ["medication", "description", "canonical", "canonical_class", "text", "source", "authorization_status", "status"]:
                    if status == "not_currently_taking" and field in {"medication", "description", "canonical", "canonical_class", "text"}:
                        continue
                    parts.extend(_as_list(getattr(mention, field, None)))
    return normalize_search_text(" ".join(parts))


def _has_authorized_target(medical_orders, dci_terms: set[str]) -> bool:
    if medical_orders is None:
        return False
    for mention in (medical_orders.get("medication_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "medication_mentions", [])) or []:
        status = mention.get("authorization_status") if isinstance(mention, dict) else getattr(mention, "authorization_status", None)
        med = canonicalize_dci((mention.get("medication") if isinstance(mention, dict) else getattr(mention, "medication", "")) or "")
        if status == "authorized" and med in {canonicalize_dci(t) for t in dci_terms}:
            return True
    return False


def _has_authorized_anchor(medical_orders, targets: list[str]) -> bool:
    if medical_orders is None or not targets:
        return False
    target_set = {canonicalize_dci(t) for t in targets}
    if _has_authorized_target(medical_orders, target_set):
        return True
    authorized_classes = medical_orders.get("authorized_therapeutic_classes", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "authorized_therapeutic_classes", [])
    return bool(authorized_classes)


def _target_details_from_orders(medical_orders, targets: list[str]) -> dict[str, str]:
    if medical_orders is None or not targets:
        return {}
    target_set = {canonicalize_dci(t) for t in targets}
    mentions = medical_orders.get("medication_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "medication_mentions", [])
    best: dict[str, str] = {}
    for mention in mentions or []:
        status = mention.get("authorization_status") if isinstance(mention, dict) else getattr(mention, "authorization_status", None)
        med = canonicalize_dci((mention.get("medication") if isinstance(mention, dict) else getattr(mention, "medication", "")) or "")
        if status != "authorized" or med not in target_set:
            continue
        strength = (mention.get("strength") if isinstance(mention, dict) else getattr(mention, "strength", None)) or None
        route = (mention.get("route") if isinstance(mention, dict) else getattr(mention, "route", None)) or None
        if strength and not best.get("strength"):
            best["strength"] = str(strength)
            best["dose"] = str(strength)
        if route and not best.get("route"):
            best["route"] = str(route)
    return best


def _filtered_required_patient_data(snapshot: PatientSnapshot, items: list[str]) -> list[str]:
    patient = getattr(snapshot, "patient", None)
    age = getattr(patient, "age_years", None) if patient is not None else None
    weight = getattr(patient, "weight_kg", None) if patient is not None else None
    out: list[str] = []
    for raw in items:
        item = str(raw or "").strip()
        if not item:
            continue
        key = normalize_search_text(item)
        if key == "age" and age is not None:
            continue
        if key == "weight" and (weight is not None or (age is not None and age >= 15)):
            continue
        if item not in out:
            out.append(item)
    return out


def _simple_explicit_draft_allowed(snapshot: PatientSnapshot, medical_orders, targets: list[str], true_forbidden: list[str], policy_decision) -> bool:
    canonical_targets = canonicalize_dci_list(targets)
    if not canonical_targets or any(t not in SIMPLE_DRAFT_ALLOWLIST for t in canonical_targets):
        return False
    if medical_orders is not None:
        requested_classes = set(_medical_orders_values(medical_orders, "requested_therapeutic_classes"))
        requested_meds = set(_medical_orders_values(medical_orders, "requested_medications"))
        if any(str(x).lower() in {"antibiotic", "nsaid", "opioid"} for x in requested_classes):
            return False
        if requested_meds and not _has_authorized_anchor(medical_orders, canonical_targets):
            return False
    if any(t in set(canonicalize_dci_list(true_forbidden)) for t in canonical_targets):
        return False
    if policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False):
        return False
    if not _has_authorized_anchor(medical_orders, canonical_targets):
        return False
    ctx = getattr(snapshot, "extracted_context", {}) or {}
    triggers = set(str(x) for x in (ctx.get("review_triggers", []) if isinstance(ctx, dict) else []))
    allowed_triggers = {
        "parser_low_confidence",
        "missing:clear symptom description",
        "missing:allergy history",
        "missing:current medications",
    }
    return not triggers or triggers.issubset(allowed_triggers)




def _simple_protocol_draft_allowed(snapshot: PatientSnapshot, medical_orders, targets: list[str], true_forbidden: list[str], policy_decision, candidate_plan) -> bool:
    """Allow low-risk protocol targets despite non-blocking parser missing-info.

    Patch14 over-converted many safe positive fixtures to missing_info because
    Level-1 parser missing fields (duration/allergy/current meds) were treated as
    route blockers.  Patch15 separates informative missing data from actual safety
    blocks: simple protocol targets can become draft_prescription only when the
    SafetyPolicyEngine has no blocking hit and the candidate target is in the
    controlled low-risk allowlist with a safety profile.
    """
    canonical_targets = canonicalize_dci_list(targets)
    if not canonical_targets or any(t not in SIMPLE_DRAFT_ALLOWLIST for t in canonical_targets):
        return False
    if medical_orders is not None:
        requested_classes = set(_medical_orders_values(medical_orders, "requested_therapeutic_classes"))
        requested_meds = set(_medical_orders_values(medical_orders, "requested_medications"))
        if any(str(x).lower() in {"antibiotic", "nsaid", "opioid"} for x in requested_classes):
            return False
        if requested_meds and not _has_authorized_anchor(medical_orders, canonical_targets):
            return False
    if any(t in set(canonicalize_dci_list(true_forbidden)) for t in canonical_targets):
        return False
    if policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False):
        return False
    risk = getattr(snapshot, "risk_flags", None)
    if risk is not None and any(bool(getattr(risk, name, False)) for name in ["pregnancy_risk", "renal_risk", "hepatic_risk", "allergy_risk", "escalation_needed"]):
        return False
    if positive_pregnancy(snapshot, _snapshot_text(snapshot)):
        return False
    profile_map = getattr(candidate_plan, "dci_safety_profiles", None) or {}
    # candidate_plan is a dataclass, not the planner object; profile check is done
    # later by ExecutionPlanner through indication_therapy_planner.  Keep this
    # helper profile-agnostic but strict on red flags and route recommendation.
    if getattr(candidate_plan, "route_recommendation", None) == "emergency":
        return False
    # Do not veto low-risk protocols merely because red-flag words appear in
    # screening questions (e.g. "sang ? Non").  True emergencies and blocking
    # safety concerns are handled by SafetyPolicyEngine, red_flag_mentions and
    # candidate_plan.route_recommendation == emergency above.
    return True


def _doctor_authorized_antibiotic_draft_allowed(text: str, medical_orders, targets: list[str]) -> bool:
    antibiotic_targets = {"amoxicillin", "amoxicillin clavulanic acid", "amoxicillin + clavulanic acid"}
    if not any(canonicalize_dci(t) in antibiotic_targets for t in targets):
        return False
    if not _has_authorized_target(medical_orders, antibiotic_targets):
        return False
    bacterial_context = _has_any(text, [
        "bacterial", "bacterienne", "bactérienne", "infection bacterienne", "infection bactérienne",
        "angine bacterienne", "angine bactérienne", "streptococcal", "documentee", "documentée", "confirmée", "confirmee"
    ])
    allergy_checked = _has_any(text, [
        "pas d allergie", "pas de allergie", "aucune allergie", "absence allergie", "no allergy",
        "no known allergy", "nkda", "allergie verifiee", "allergie vérifiée", "allergy checked"
    ])
    return bacterial_context and allergy_checked


def _simple_review_draft_allowed_due_to_context(snapshot: PatientSnapshot, medical_orders, targets: list[str], true_forbidden: list[str], policy_decision, text: str) -> bool:
    """Allow a review-visible draft for low-risk targets in vulnerable/explicit contexts.

    This is not a direct prescription route. It preserves clinician validation
    for breastfeeding/pregnancy/asthma-rescue contexts while avoiding a false
    unsafe direct draft.
    """
    canonical_targets = canonicalize_dci_list(targets)
    if not canonical_targets or any(t not in SIMPLE_DRAFT_ALLOWLIST for t in canonical_targets):
        return False
    if any(t in set(canonicalize_dci_list(true_forbidden)) for t in canonical_targets):
        return False
    if policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False):
        return False
    patient = getattr(snapshot, "patient", None)
    # Pregnancy/renal/hepatic/allergy-risk contexts are high-caution and must
    # fail closed to review without generation.  Breastfeeding can still produce
    # a doctor-visible review draft for selected low-risk targets.
    vulnerable = bool(
        getattr(patient, "breastfeeding", None) is True
        or _has_any_positive(text, ["breastfeeding", "allaitement", "j allaite", "j'allaite"])
    )
    asthma_rescue = any(t == "salbutamol" for t in canonical_targets) and _has_any(text, ["asthma", "asthme", "asthmatique", "sifflement", "wheezing"])
    return vulnerable or asthma_rescue


def _doctor_authorized_nsaid_draft_allowed(text: str, medical_orders, targets: list[str]) -> bool:
    nsaid_targets = {"ibuprofen", "diclofenac", "naproxen"}
    if not any(canonicalize_dci(t) in nsaid_targets for t in targets):
        return False
    if not _has_authorized_target(medical_orders, nsaid_targets):
        return False
    # Patch 11: NSAID review-draft is allowed only when the clinician explicitly
    # prescribed it AND the four key risk screens are explicitly negative.
    # Missing screens are not treated as safe.
    negative_groups = {
        "pregnancy": ["pas enceinte", "non enceinte", "not pregnant", "grossesse exclue", "grossesse negative", "pregnancy negative"],
        "renal": ["pas d insuffisance renale", "pas d insuffisance rénale", "fonction renale normale", "fonction rénale normale", "no renal impairment", "normal renal function"],
        "ulcer": ["pas d ulcere", "pas d ulcère", "pas de saignement", "no ulcer", "no gi bleeding", "no gastric bleeding"],
        "anticoagulant": ["sans anticoagulant", "pas d anticoagulant", "ne prend pas sintrom", "no anticoagulant", "denies anticoagulant", "not taking anticoagulant"],
    }
    positives = [
        "enceinte", "grossesse", "renal impairment", "insuffisance renale", "insuffisance rénale",
        "ulcer", "ulcere", "ulcère", "gastric bleeding", "saignement", "sintrom",
        "acenocoumarol", "warfarin", "anticoagulant", "avk"
    ]
    if any(_has_any(text, [term]) for term in positives):
        # If a positive-looking term is present, allow only when the relevant
        # negative screen is also explicit. This preserves phrases like
        # "sans anticoagulant" while blocking "sous Sintrom".
        pass
    complete_negative = all(any(_has_any(text, [term]) for term in terms) for terms in negative_groups.values())
    return complete_negative

def _sub_route_for(route: str, *, review_draft_allowed: bool = False, missing: list[str] | None = None) -> str:
    if route == "prescription":
        return "draft_prescription"
    if route == "review" and review_draft_allowed:
        return "review_draft_allowed"
    if route == "review" and missing:
        return "missing_info"
    if route == "review":
        return "review_blocked"
    if route == "emergency":
        return "emergency"
    if route == "non_pharma":
        return "non_pharma"
    return "blocked"


def _display_route_for(sub_route: str) -> str:
    return sub_route


class ExecutionPlanner:
    def __init__(
        self,
        policy_engine: SafetyPolicyEngine | None = None,
        policy_mode: str | None = None,
        indication_therapy_planner: IndicationTherapyPlanner | None = None,
    ):
        # The explicit target architecture evaluates SafetyPolicyEngine before
        # planning. We keep a local engine only as a backward-compatible
        # fallback for direct planner calls in tests/tools.
        self.policy_engine = policy_engine or SafetyPolicyEngine()
        self.policy_mode = (policy_mode or os.getenv("SAFETY_POLICY_MODE", "audit")).strip().lower()
        if self.policy_mode not in {"off", "audit", "enforce"}:
            self.policy_mode = "audit"
        self.indication_therapy_planner = indication_therapy_planner or IndicationTherapyPlanner()
        self.route_decision_engine = RouteDecisionEngine()

    def plan(self, snapshot: PatientSnapshot, medical_orders=None, policy_decision: PolicyDecision | None = None) -> ExecutionPlan:
        base_blob = _snapshot_text(snapshot)
        orders_blob = _medical_orders_text(medical_orders)
        blob = normalize_search_text(" ".join([base_blob, orders_blob]))
        base_route = getattr(snapshot, "route_recommendation", None) or "review"
        base_route = normalize_search_text(base_route).replace("non pharma", "non_pharma")
        if base_route not in {"prescription", "review", "emergency", "non_pharma"}:
            base_route = "review"

        override_route, override_reason = infer_route_override(snapshot, blob, medical_orders=medical_orders)
        route = override_route or base_route

        if policy_decision is None and self.policy_mode != "off":
            # Backward-compatible fallback for direct planner usage in tests/tools.
            policy_decision = self.policy_engine.evaluate(snapshot, medical_orders=medical_orders)
        pre_policy_route = route
        pre_policy_allowed = route == "prescription"

        if self.policy_mode == "enforce" and policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False):
            if policy_decision.route_override:
                route = policy_decision.route_override
            elif policy_decision.allowed_to_generate is False and route == "prescription":
                route = "review"
            override_reason = policy_decision.reason_code or override_reason

        policy_audit = _policy_audit_payload(
            policy_decision,
            current_route=pre_policy_route,
            current_allowed_to_generate=pre_policy_allowed,
            mode=self.policy_mode,
            effective_route=route,
        ) if policy_decision is not None else {"mode": "off"}

        primary_terms = list(dict.fromkeys([
            *_as_list(getattr(snapshot, "normalized_symptoms", [])),
            *_as_list(getattr(snapshot, "suspected_conditions", [])),
            *_as_list(getattr(snapshot, "disease_tags", [])),
        ]))[:6]

        candidate_plan = self.indication_therapy_planner.plan(snapshot, medical_orders=medical_orders, blob=blob)
        targets = canonicalize_dci_list(candidate_plan.candidate_ingredients)
        if "omeprazole" in targets and "alginate" in targets and _has_any_positive(blob, [
            "deux semaines", "2 semaines", "two weeks", "depuis deux semaines", "depuis 2 semaines",
            "gastroesophageal reflux", "gastroesophageal_reflux", "gerd", "rgo", "reflux gastro",
        ]):
            targets = [t for t in targets if t != "alginate"]
        candidate_plan.candidate_ingredients = targets
        indications = candidate_plan.target_indications or candidate_plan.clinical_problems
        forbidden = canonicalize_dci_list(candidate_plan.forbidden_ingredients)
        candidate_plan.forbidden_ingredients = forbidden
        if candidate_plan.route_recommendation in {"emergency", "review", "non_pharma"}:
            if candidate_plan.route_recommendation == "emergency" or route == "prescription":
                route = candidate_plan.route_recommendation
                override_reason = override_reason or f"indication_therapy_planner_{route}"

        policy_forbidden = list(getattr(policy_decision, "forbidden_ingredients", []) or []) if policy_decision is not None else []
        policy_missing = list(getattr(policy_decision, "required_missing_data", []) or []) if policy_decision is not None else []
        all_forbidden = list(dict.fromkeys([*forbidden, *policy_forbidden]))
        true_forbidden_ingredients = list(dict.fromkeys(all_forbidden))
        guardrail_only_negated_context = _only_negated_context_without_actionable_order(medical_orders)
        blocked_candidate_ingredients = []
        candidates_requiring_review = []
        required_patient_data = _filtered_required_patient_data(snapshot, list(dict.fromkeys([
            *_as_list(getattr(snapshot, "missing_critical_information", [])),
            *_as_list(getattr(candidate_plan, "required_patient_data", [])),
            *policy_missing,
        ])))
        required_safety_screens = list(dict.fromkeys([
            *_as_list(getattr(candidate_plan, "required_safety_screens", [])),
        ]))
        missing = list(dict.fromkeys(required_patient_data))

        review_draft_allowed = False
        if route == "review" and targets:
            review_draft_allowed = (
                _doctor_authorized_antibiotic_draft_allowed(blob, medical_orders, targets)
                or _doctor_authorized_nsaid_draft_allowed(blob, medical_orders, targets)
                or _simple_review_draft_allowed_due_to_context(snapshot, medical_orders, targets, true_forbidden_ingredients, policy_decision, blob)
            )
            if review_draft_allowed:
                override_reason = override_reason or "review_draft_allowed_context_complete"

        if route == "prescription" and targets and _simple_review_draft_allowed_due_to_context(snapshot, medical_orders, targets, true_forbidden_ingredients, policy_decision, blob):
            # Vulnerable or clinician-explicit contexts should stay visible as
            # review_draft_allowed, not direct draft_prescription.
            route = "review"
            review_draft_allowed = True
            override_reason = override_reason or "vulnerable_or_explicit_context_requires_doctor_review"

        if route == "review" and not review_draft_allowed and _simple_explicit_draft_allowed(snapshot, medical_orders, targets, true_forbidden_ingredients, policy_decision):
            route = "prescription"
            override_reason = override_reason or "simple_doctor_authorized_target_overrides_parser_low_confidence"

        if route == "review" and not review_draft_allowed and _simple_protocol_draft_allowed(snapshot, medical_orders, targets, true_forbidden_ingredients, policy_decision, candidate_plan):
            route = "prescription"
            override_reason = override_reason or "simple_protocol_target_overrides_nonblocking_missing_info"

        if route == "prescription" and not targets:
            if guardrail_only_negated_context and not true_forbidden_ingredients and not (policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False)):
                route = "non_pharma"
                override_reason = override_reason or "only_non_forbidden_non_actionable_medication_context_no_actionable_order"
            else:
                route = "review"
                override_reason = override_reason or "no_controlled_target_ingredient"

        if route == "review" and not targets and guardrail_only_negated_context and not true_forbidden_ingredients and not (policy_decision is not None and getattr(policy_decision, "has_blocking_policy", False)):
            route = "non_pharma"
            override_reason = override_reason or "only_non_forbidden_non_actionable_medication_context_no_actionable_order"

        if route == "prescription" and targets:
            # Patch 11: a DCI can only go directly to draft_prescription if it
            # is in the simple draft allowlist and has a safety profile. Unknown
            # DCIs (e.g. newly extracted AMM aliases) become review packets until
            # safety/dosing rules are added.
            profile_map = getattr(self.indication_therapy_planner, "dci_safety_profiles", {}) or {}
            unsafe_or_unknown = [t for t in targets if t not in SIMPLE_DRAFT_ALLOWLIST or t not in profile_map]
            if unsafe_or_unknown:
                route = "review"
                override_reason = override_reason or "target_missing_safety_or_dosing_profile"
                for missing_target in unsafe_or_unknown:
                    if missing_target not in missing:
                        missing.append(f"safety_profile_for_{missing_target}")

        # Patch18: central business decision engine is the source of truth for
        # route/display/generation permission.  The legacy heuristics above are
        # kept as candidate signals, but they no longer directly decide safety.
        business_decision = self.route_decision_engine.decide(
            snapshot=snapshot,
            medical_orders=medical_orders,
            policy_decision=policy_decision,
            inputs=BusinessInputs(
                candidate_route=route,
                candidate_targets=targets,
                candidate_forbidden=true_forbidden_ingredients,
                candidate_missing=missing,
                required_safety_screens=required_safety_screens,
                review_draft_allowed=review_draft_allowed,
                candidate_route_reason=override_reason,
            ),
        )
        route = business_decision.route
        review_draft_allowed = business_decision.review_draft_allowed
        missing = list(dict.fromkeys([*business_decision.missing_information.blocking, *business_decision.missing_information.informative]))
        required_patient_data = list(business_decision.required_patient_data)
        required_safety_screens = list(dict.fromkeys([*required_safety_screens, *business_decision.required_safety_screens]))
        true_forbidden_ingredients = list(dict.fromkeys([*true_forbidden_ingredients, *business_decision.forbidden_ingredients]))
        all_forbidden = list(dict.fromkeys([*all_forbidden, *business_decision.forbidden_ingredients]))
        if business_decision.allowed_to_generate or business_decision.display_route == "review_draft_allowed":
            targets = business_decision.target_ingredients or targets
        elif route in {"emergency", "non_pharma", "review", "blocked"}:
            # Preserve candidates in blocked_candidate_ingredients below, but do
            # not expose them as generatable targets.
            pass
        if business_decision.generation_block_reason and not override_reason:
            override_reason = business_decision.generation_block_reason
        elif business_decision.block_reasons and not override_reason:
            override_reason = business_decision.block_reasons[0]
        display_route = business_decision.display_route
        sub_route = display_route

        if route != "prescription":
            if review_draft_allowed:
                blocked_candidate_ingredients = []
                candidates_requiring_review = list(dict.fromkeys(t for t in targets if t not in true_forbidden_ingredients))
            else:
                blocked_candidate_ingredients = [t for t in targets if t not in true_forbidden_ingredients]
                candidates_requiring_review = list(dict.fromkeys(blocked_candidate_ingredients))

        defaults = TARGET_DEFAULTS.get(targets[0], {}) if targets else {}
        target_details = _target_details_from_orders(medical_orders, targets)
        target_strength = target_details.get("strength") or defaults.get("strength")
        target_dose = target_details.get("dose") or target_strength or defaults.get("dose")
        target_route = target_details.get("route") or defaults.get("route")

        common = {
            "target_indications": indications,
            "missing_critical_information": missing,
            "required_patient_data": required_patient_data,
            "required_safety_screens": required_safety_screens,
            "policy_hits": _policy_hits_as_dicts(policy_decision),
            "policy_audit": {**policy_audit, "indication_therapy_planner": candidate_plan.as_dict(), "business_decision": business_decision.model_dump(mode="json")},
            "true_forbidden_ingredients": true_forbidden_ingredients,
            "blocked_candidate_ingredients": blocked_candidate_ingredients,
            "candidates_requiring_review": candidates_requiring_review,
            "display_route": display_route,
            "sub_route": sub_route,
            "finalization_status": "doctor_validation_required",
            "activation_flags": {
                "safety_policy_mode": self.policy_mode,
                "medical_orders_before_planner": medical_orders is not None,
                "indication_therapy_planner": True,
                "central_business_logic": True,
            },
        }

        if route == "prescription":
            return ExecutionPlan(
                route="prescription",
                allowed_to_generate=True,
                required_modules=["retrieval", "generation", "safety", "localization", "audit"],
                vector_queries=build_vector_queries(targets, indications, primary_terms),
                kg_queries=build_kg_queries(targets, indications, primary_terms, blob),
                formulary_queries=build_formulary_queries(targets, indications, target_strength, target_route, primary_terms),
                target_ingredients=targets,
                forbidden_ingredients=all_forbidden,
                target_route=target_route,
                target_strength=target_strength,
                target_dose=target_dose,
                target_form=defaults.get("form"),
                therapeutic_intent=defaults.get("intent"),
                localization_required=True,
                required_safety_checks=list(dict.fromkeys(["allergy", "pregnancy", "renal", "hepatic", "interaction", "dose", *required_safety_screens])),
                planner_reason="Route=prescription: target ingredients selected by structured extraction + controlled IndicationTherapyPlanner; retrieval/localization must be ingredient-aware.",
                **common,
            )

        if route == "review" and review_draft_allowed:
            return ExecutionPlan(
                route="review",
                allowed_to_generate=True,
                required_modules=["retrieval", "generation", "safety", "localization", "audit"],
                vector_queries=build_vector_queries(targets, indications, primary_terms),
                kg_queries=build_kg_queries(targets, indications, primary_terms, blob),
                formulary_queries=build_formulary_queries(targets, indications, target_strength, target_route, primary_terms),
                target_ingredients=targets,
                forbidden_ingredients=all_forbidden,
                target_route=target_route,
                target_strength=target_strength,
                target_dose=target_dose,
                target_form=defaults.get("form"),
                therapeutic_intent=defaults.get("intent"),
                localization_required=True,
                required_safety_checks=list(dict.fromkeys(["allergy", "pregnancy", "renal", "hepatic", "interaction", "dose", *required_safety_screens])),
                block_reason=override_reason,
                planner_reason="Review-draft-allowed route: clinician-explicit higher-risk medication may be drafted for mandatory doctor validation after required context checks.",
                **common,
            )

        if route == "emergency":
            return ExecutionPlan(
                route="emergency",
                allowed_to_generate=False,
                required_modules=["safety", "audit"],
                vector_queries=[],
                kg_queries=[],
                formulary_queries=[],
                target_ingredients=[],
                forbidden_ingredients=list(dict.fromkeys([*all_forbidden, *targets])),
                required_safety_checks=["escalation", "red_flags"],
                localization_required=False,
                block_reason=override_reason or "emergency_route",
                planner_reason="Emergency route: automatic prescription generation is skipped; urgent clinician escalation required.",
                **common,
            )

        if route == "non_pharma":
            return ExecutionPlan(
                route="non_pharma",
                allowed_to_generate=False,
                required_modules=["safety", "audit"],
                vector_queries=[],
                kg_queries=[],
                formulary_queries=[],
                target_ingredients=[],
                forbidden_ingredients=list(dict.fromkeys([*all_forbidden, *targets])),
                required_safety_checks=["route_validation"],
                localization_required=False,
                block_reason=override_reason or "non_pharmacologic_route",
                planner_reason="Non-pharmacologic route: no automatic medication generation or localization required.",
                **common,
            )

        ctx = getattr(snapshot, "extracted_context", {}) or {}
        block_reason = override_reason or (ctx.get("blocking_reason") if isinstance(ctx, dict) else None) or "clinician_review_required"
        return ExecutionPlan(
            route="review",
            allowed_to_generate=False,
            required_modules=["safety", "audit"],
            vector_queries=[],
            kg_queries=build_kg_queries(targets, indications, primary_terms, blob),
            formulary_queries=[],
            target_ingredients=[],
            forbidden_ingredients=list(dict.fromkeys([*all_forbidden, *targets])),
            required_safety_checks=["route_validation", "risk_review"],
            localization_required=False,
            block_reason=block_reason,
            planner_reason=f"Review route: automatic Qwen prescription generation is skipped. Reason={block_reason}",
            **common,
        )


def infer_targets(snapshot: PatientSnapshot, blob: str) -> tuple[list[str], list[str], list[str]]:
    targets: list[str] = []
    indications: list[str] = []
    forbidden: list[str] = []

    if _has_any(blob, ["wheezing", "sifflement", "sibilance", "asthma", "asthme", "bronchospasm"]):
        targets.append("salbutamol")
        indications += ["acute wheezing", "bronchodilator rescue"]
        forbidden += ["formoterol", "fumarate de formoterol", "dextromethorphan", "dextromethorphane"]

    if _has_any(blob, ["fever", "fievre", "fièvre", "سخانة", "حمى", "headache", "cephalee", "céphalée", "urti", "rhume", "mal de gorge", "sore throat", "back pain", "low back pain", "douleur lombaire", "pain au dos"]):
        if "paracetamol" not in targets:
            targets.append("paracetamol")
        if _has_any(blob, ["fever", "fievre", "fièvre", "سخانة", "حمى"]):
            indications.append("fever")
        if _has_any(blob, ["headache", "cephalee", "céphalée"]):
            indications.append("headache")
        if _has_any(blob, ["urti", "rhume", "sore throat", "mal de gorge"]):
            indications.append("upper respiratory tract infection symptomatic relief")
        if _has_any(blob, ["back pain", "low back pain", "douleur lombaire", "pain au dos"]):
            indications.append("pain relief")

    return list(dict.fromkeys(targets)), list(dict.fromkeys(indications)), list(dict.fromkeys(forbidden))


def build_formulary_queries(targets, indications, strength, route, primary_terms):
    queries = []
    for target in targets:
        parts = [target]
        if strength:
            parts.append(strength)
        if route:
            parts.append(route)
        parts += ["Tunisia", "mono ingredient", "local formulary"]
        queries.append(" ".join(parts))
    return queries or [_compact_query(primary_terms, "Tunisia local formulary mono ingredient")]


def build_vector_queries(targets, indications, primary_terms):
    return [_compact_query(targets + indications + primary_terms, "dose route frequency duration contraindications monitoring runtime retrieval evidence requires RCP verification")]


def build_kg_queries(targets, indications, primary_terms, blob: str = ""):
    risk_terms = []
    if _has_any(blob, ["renal", "kidney", "renale", "rénale"]):
        risk_terms.append("renal")
    if _has_any(blob, ["warfarin", "anticoagulant", "avk"]):
        risk_terms.append("warfarin anticoagulant interaction")
    if positive_pregnancy(None, blob):
        risk_terms.append("pregnancy")
    if _has_any(blob, ["hepatic", "liver", "hepatique", "hépatique"]):
        risk_terms.append("hepatic")
    return [_compact_query(targets + indications + primary_terms + risk_terms, "treatment contraindication interaction safety")]


def _compact_query(terms, suffix):
    base = " ".join(str(t) for t in terms if str(t).strip())
    return " ".join([base, suffix]).strip() or suffix

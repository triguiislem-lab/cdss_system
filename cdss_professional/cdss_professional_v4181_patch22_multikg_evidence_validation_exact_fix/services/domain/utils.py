from __future__ import annotations

import re
from typing import Any
from libs.utils.medical_text import normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci, canonicalize_dci_list


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return [str(value).strip()] if str(value).strip() else []


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys([str(v).strip() for v in values if str(v).strip()]))


def canonical_list(values: list[str]) -> list[str]:
    return unique(canonicalize_dci_list(values))


def has_any_positive(blob: str, terms: list[str]) -> bool:
    """Positive term search with local negation / question-answer handling."""
    text = normalize_search_text(blob)
    for raw in terms:
        term = normalize_search_text(raw)
        if not term:
            continue
        pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(term) + r"(?![a-z0-9\u0600-\u06FF])"
        for match in re.finditer(pattern, text):
            before = text[max(0, match.start() - 110): match.start()]
            after = text[match.end(): min(len(text), match.end() + 180)]
            if re.search(r"(?:^|\b)(?:pas\s+de|pas\s+d|aucun|aucune|sans|nie|non|no|denies|negative\s+for|absence\s+de|absence\s+d|without|no\s+evidence\s+of)(?:\s+\w+){0,2}\s*$", before):
                continue
            if re.match(r"\s*(?:non|no|لا|rien\s+de\s+ca|rien\s+de\s+ça|none\s+of\s+that)\b", after):
                continue
            if re.search(r"\b(?:non\s*,?\s*)?(?:rien\s+de\s+(?:tout\s+)?ca|rien\s+de\s+(?:tout\s+)?ça|none\s+of\s+that)\b", after[:180]):
                continue
            # Normalized transcripts often look like: "doctor red flag, pregnancy patient non".
            # Treat a nearby patient negative response as negating the screened
            # red flags unless a new doctor turn intervenes first.
            pm = re.search(r"\bpatient\s+(?:non|no|rien\s+de\s+ca|rien\s+de\s+ça|rien\s+de\s+tout\s+ca|rien\s+de\s+tout\s+ça|none\s+of\s+that)\b", after[:180])
            if pm and "doctor" not in after[:pm.start()] and "docteur" not in after[:pm.start()] and "medecin" not in after[:pm.start()]:
                continue
            return True
    return False

# Patch23 safety-quality hardening: shared positive-only cardiac red-flag lexicon.
# These variants cover French, English, Arabic, and Tunisian Arabizi forms seen in
# the v3 smoke benchmark.  They are intentionally split into chest-location terms
# and associated ischemic-risk terms so isolated vague words such as "sder" do
# not trigger emergency routing unless accompanied by sweating, radiation, syncope,
# dyspnea, or left-arm/shoulder pain.
CARDIAC_CHEST_TERMS = [
    "chest pain", "chest discomfort", "chest pressure", "chest tightness",
    "douleur thoracique", "oppression thoracique", "douleur poitrine", "mal poitrine", "poitrine",
    "wja3 sder", "wja3 fi sder", "wja3 f sder", "wja3 fel sder", "wja3 sderi",
    "wje3 sder", "wje3 fi sder", "wje3 f sder", "wje3 fel sder", "wje3 sderi",
    "wji3 sder", "wji3a sder", "wji3a fi sder", "wji3a f sder", "wji3a fel sder",
    "wajaa sder", "wajaa fi sder", "wajaa f sder", "wajaa fel sder", "wajaa fi sderi",
    "sderi", "sder", "sdar", "sadri", "sadr", "waja3 sadr",
    "وجع صدر", "وجع في صدري", "وجيعة صدر", "وجيعة في صدري", "ألم صدر", "الم صدر", "صدر",
]

CARDIAC_ASSOCIATED_TERMS = [
    "sweating", "sweats", "diaphoresis", "sueurs", "sueur", "transpiration",
    "dyspnea", "dyspnee", "dyspnée", "essoufflement", "shortness of breath",
    "radiation", "radiating", "irradiation", "syncope", "malaise",
    "left arm", "left_arm", "left hand", "left shoulder",
    "bras gauche", "main gauche", "epaule gauche", "épaule gauche",
    "yed isar", "yedi isar", "yed ysar", "id isar", "yedi ysar", "yeddi ysar",
    "yed lisra", "yedi lisra", "yeddi lisra", "id lisra", "yed lissar", "yedi lissar", "yeddi lissar",
    "ketfi lisar", "ketfi lissar", "ktaf lisar", "ktaf lissar", "dra3i lisar", "dhra3i lisar",
    "t3arra9", "t3araq", "t3areq", "ta3raq", "ta3req", "3araq", "3ra9", "3are9", "3reg", "3rag",
    "netharra9", "net3arra9", "3are9 barcha", "barcha 3raq",
    "عرق", "تعرق", "تعرّق", "عرقان", "يدي اليسرى", "يد اليسرى", "اليد اليسرى",
    "ذراعي اليسرى", "ذراع اليسرى", "الذراع اليسرى", "كتفي اليسار", "الكتف اليسار",
]


def has_cardiac_chest_red_flag(blob: str) -> bool:
    """Return True for positive chest-pain plus ischemic-associated features.

    The helper is deliberately conservative: it requires one chest/localization
    signal and one associated risk signal, both positive under the local-negation
    rules used by the business safety layer.
    """
    return has_any_positive(blob, CARDIAC_CHEST_TERMS) and has_any_positive(blob, CARDIAC_ASSOCIATED_TERMS)


def snapshot_blob(snapshot, medical_orders=None) -> str:
    parts: list[str] = []
    for attr in ["normalized_runtime_text", "doctor_notes", "raw_text", "transcript_text"]:
        val = getattr(snapshot, attr, None)
        if val:
            parts.append(str(val))
    for attr in ["normalized_symptoms", "suspected_conditions", "disease_tags"]:
        parts.extend(as_list(getattr(snapshot, attr, [])))
    consultation = getattr(snapshot, "consultation", None)
    if consultation is not None:
        notes = getattr(consultation, "doctor_notes", None)
        if notes:
            parts.append(str(notes))
        for turn in getattr(consultation, "transcript", []) or []:
            parts.append(str(getattr(turn, "text", "") if not isinstance(turn, dict) else turn.get("text", "")))
    if medical_orders is not None:
        for attr in ["requested_medications", "already_taken_medications", "authorized_medications", "requested_therapeutic_classes", "authorized_therapeutic_classes", "forbidden_ingredients"]:
            parts.extend(as_list(medical_orders.get(attr, []) if isinstance(medical_orders, dict) else getattr(medical_orders, attr, [])))
    return normalize_search_text(" ".join(parts))


def patient_age_years(snapshot) -> float | None:
    patient = getattr(snapshot, "patient", None)
    years = getattr(patient, "age_years", None) if patient is not None else None
    try:
        if years is not None:
            return float(years)
    except Exception:
        pass
    months = getattr(patient, "age_months", None) if patient is not None else None
    try:
        if months is not None:
            return float(months) / 12.0
    except Exception:
        pass
    return None


def is_pediatric(snapshot) -> bool:
    age = patient_age_years(snapshot)
    return bool(age is not None and age < 18)


def is_young_infant(snapshot) -> bool:
    age = patient_age_years(snapshot)
    return bool(age is not None and age < 0.25)


def patient_context(snapshot) -> dict[str, Any]:
    patient = getattr(snapshot, "patient", None)
    risk = getattr(snapshot, "risk_flags", None)
    return {
        "pregnant": getattr(patient, "pregnant", None) is True or getattr(patient, "pregnancy_status", None) == "pregnant" or getattr(risk, "pregnancy_risk", False) is True,
        "pregnancy_uncertain": getattr(patient, "pregnancy_uncertain", None) is True or getattr(patient, "pregnancy_status", None) == "uncertain",
        "breastfeeding": getattr(patient, "breastfeeding", None) is True,
        "renal_impairment": getattr(patient, "renal_impairment", False) is True or getattr(risk, "renal_risk", False) is True or (getattr(patient, "egfr", None) is not None and getattr(patient, "egfr") < 60),
        "hepatic_impairment": getattr(patient, "hepatic_impairment", False) is True or getattr(risk, "hepatic_risk", False) is True,
        "allergy_risk": getattr(risk, "allergy_risk", False) is True,
        "escalation_needed": getattr(risk, "escalation_needed", False) is True,
        "age_years": patient_age_years(snapshot),
        "weight_kg": getattr(patient, "weight_kg", None) if patient is not None else None,
        "temperature_c": getattr(patient, "temperature_c", None) if patient is not None else None,
        "spo2": getattr(patient, "spo2", None) if patient is not None else None,
        "heart_rate": getattr(patient, "heart_rate", None) if patient is not None else None,
        "respiratory_rate": getattr(patient, "respiratory_rate", None) if patient is not None else None,
    }


def medication_mentions(medical_orders) -> list[Any]:
    if medical_orders is None:
        return []
    return (medical_orders.get("medication_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "medication_mentions", [])) or []


def mention_value(mention: Any, key: str, default: Any = None) -> Any:
    if isinstance(mention, dict):
        return mention.get(key, default)
    return getattr(mention, key, default)


def canonical_from_mention(mention: Any) -> str:
    return canonicalize_dci(str(mention_value(mention, "medication", "") or mention_value(mention, "description", "") or ""))

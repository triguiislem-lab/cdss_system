from __future__ import annotations
import re, unicodedata
from typing import Any


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("µ", "u")
    text = re.sub(r"[^a-z0-9\u0600-\u06FF]+", " ", text)
    return " ".join(text.split())


def _negative_reply_after_term(after: str) -> bool:
    reply_pattern = r"\b(?:non|no|لا|rien\s+de\s+ca|rien\s+de\s+ça|rien\s+de\s+tout\s+ca|rien\s+de\s+tout\s+ça|none\s+of\s+that)\b"
    speaker_pattern = r"\bpatient\s+(?:non|no|rien\s+de\s+ca|rien\s+de\s+ça|rien\s+de\s+tout\s+ca|rien\s+de\s+tout\s+ça|none\s+of\s+that)\b"
    stripped = after.strip()
    if re.match(reply_pattern, stripped):
        return True
    m = re.search(reply_pattern, after)
    speaker_m = re.search(speaker_pattern, after)
    if not m and not speaker_m:
        return False
    # Punctuation may be preserved in raw text: "symptom ? Non".
    if m and ("?" in after[: m.end()] or m.start() <= 80):
        return True
    # Normalized transcripts often lose punctuation but keep speaker tokens:
    # "doctor symptom patient non" is a negative screening answer unless a new
    # doctor turn intervenes before the patient response.
    sm = speaker_m
    if sm and "doctor" not in after[:sm.start()] and "docteur" not in after[:sm.start()] and "medecin" not in after[:sm.start()]:
        return True
    return False


def term_in_blob(term: str, blob: str) -> bool:
    t = normalize_text(term)
    if not t or t not in blob:
        return False
    pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(t) + r"(?![a-z0-9\u0600-\u06FF])"
    for match in re.finditer(pattern, blob):
        before = blob[max(0, match.start() - 95): match.start()]
        after = blob[match.end(): min(len(blob), match.end() + 170)]
        if re.search(r"(?:^|\b)(?:pas\s+de|pas\s+d|aucun|aucune|sans|nie|non|no|denies|negative\s+for|absence\s+de|absence\s+d|without|no\s+evidence\s+of)(?:\s+\w+){0,1}\s*$", before):
            continue
        if _negative_reply_after_term(after):
            continue
        return True
    return False


def terms_any(terms: list[str], blob: str) -> bool:
    return True if not terms else any(term_in_blob(t, blob) for t in terms)


def terms_all(terms: list[str], blob: str) -> bool:
    return True if not terms else all(term_in_blob(t, blob) for t in terms)


def groups_all(groups: list[list[str]], blob: str) -> bool:
    return True if not groups else all(terms_any(group, blob) for group in groups)


def matched_terms(terms: list[str], blob: str) -> list[str]:
    return [t for t in terms if term_in_blob(t, blob)]


def _as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x) for x in value if str(x).strip()]
    return [str(value)]


def _order_values(medical_orders, attr: str) -> list[str]:
    if medical_orders is None:
        return []
    if isinstance(medical_orders, dict):
        return _as_list(medical_orders.get(attr, []))
    return _as_list(getattr(medical_orders, attr, []))


def extract_text_blob(snapshot, medical_orders=None) -> str:
    parts = []
    for attr in ["normalized_runtime_text", "doctor_notes", "raw_text", "transcript_text"]:
        val = getattr(snapshot, attr, None)
        if val:
            parts.append(str(val))
    for attr in ["suspected_conditions", "disease_tags"]:
        parts.extend(_as_list(getattr(snapshot, attr, [])))
    consultation = getattr(snapshot, "consultation", None)
    if consultation is not None:
        notes = getattr(consultation, "doctor_notes", None)
        if notes:
            parts.append(str(notes))
        for turn in getattr(consultation, "transcript", None) or []:
            parts.append(str(turn.get("text", "") if isinstance(turn, dict) else getattr(turn, "text", "")))
    ctx = getattr(snapshot, "extracted_context", None)
    if isinstance(ctx, dict):
        for k, v in ctx.items():
            if k in {"missing_critical_information", "missing_info", "symptom_mentions", "current_medications"}:
                continue
            if isinstance(v, list):
                parts.extend(str(x) for x in v)
            elif v is not None:
                parts.append(str(v))
    # Include order extraction before policies so requested/current meds are visible to rules.
    if medical_orders is not None:
        parts.extend(_order_values(medical_orders, "requested_medications"))
        parts.extend(_order_values(medical_orders, "already_taken_medications"))
        parts.extend(_order_values(medical_orders, "authorized_medications"))
        mentions = getattr(medical_orders, "medication_mentions", None) if not isinstance(medical_orders, dict) else medical_orders.get("medication_mentions")
        for mention in mentions or []:
            if isinstance(mention, dict):
                parts.extend([mention.get("medication"), mention.get("description"), mention.get("source"), mention.get("authorization_status")])
            else:
                parts.extend([getattr(mention, "medication", None), getattr(mention, "description", None), getattr(mention, "source", None), getattr(mention, "authorization_status", None)])
    return normalize_text(" ".join(str(p) for p in parts if p is not None))


def _num(v):
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def patient_age(snapshot):
    patient = getattr(snapshot, "patient", None)
    years = _num(getattr(patient, "age_years", None))
    if years is not None:
        return years
    months = _num(getattr(patient, "age_months", None))
    return (months / 12.0) if months is not None else None


def patient_weight(snapshot):
    return _num(getattr(getattr(snapshot, "patient", None), "weight_kg", None))


def bool_attr(obj, name: str) -> bool:
    try:
        return getattr(obj, name, False) is True
    except Exception:
        return False


def positive_pregnancy(snapshot, blob: str) -> bool:
    patient = getattr(snapshot, "patient", None) if snapshot is not None else None
    risk = getattr(snapshot, "risk_flags", None) if snapshot is not None else None
    if patient is not None and bool_attr(patient, "pregnant"):
        return True
    if risk is not None and bool_attr(risk, "pregnancy_risk"):
        return True
    if terms_any(["not pregnant", "pas enceinte", "non enceinte", "denies pregnancy", "pregnancy status", "pregnancy unknown", "ask pregnancy", "missing pregnancy"], blob):
        return False
    return terms_any(["i am pregnant", "patient is pregnant", "pregnant patient", "femme enceinte", "je suis enceinte", "enceinte", "grossesse confirmee", "grossesse confirmée"], blob)


def positive_current_medication_terms_from_blob(blob: str) -> list[str]:
    text = normalize_text(blob)
    if not text:
        return []
    neg_patterns = [
        r"\bne\s+(?:\w+\s+){0,2}(?:prend|prends|prendre|prenait)\s+(?:pas|plus)\b",
        r"\bsans\s+anticoagulant\b",
        r"\bnie\s+anticoagulant\b",
        r"\bno\s+anticoagulant\b",
        r"\bdenies\s+anticoagulant\b",
        r"\bnot\s+(?:currently\s+)?taking\b",
    ]
    if any(re.search(p, text) for p in neg_patterns):
        return []
    out: list[str] = []
    positive_patterns = [
        r"\b(?:on|taking|currently taking|already taking)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
        r"\b(?:prend|prends|sous|sous traitement|traitement par|actuellement sous)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
        r"\b(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\s+(?:current|actuel|actuellement|already|pris)\b",
    ]
    for pattern in positive_patterns:
        for hit in re.finditer(pattern, text):
            out.append(hit.group(1))
    return out


def current_medication_blob(snapshot, medical_orders=None) -> str:
    """Current-medication context built only from structured positive evidence.

    Raw consultation text is intentionally excluded so negated phrases like
    "ne prend pas Sintrom" or "sans anticoagulant" do not trigger DDI rules.
    """
    parts: list[str] = []
    for src in [getattr(snapshot, "patient", None), snapshot, getattr(snapshot, "extracted_context", None)]:
        if src is None:
            continue
        for key in ["current_medications", "medications", "current_treatments"]:
            val = src.get(key) if isinstance(src, dict) else getattr(src, key, None)
            if isinstance(val, list):
                parts.extend(str(x) for x in val)
            elif val:
                parts.append(str(val))
    parts.extend(_order_values(medical_orders, "already_taken_medications"))
    # If structured extraction is unavailable, recover clear positive current
    # medication phrases from raw text without admitting negated contexts.
    if medical_orders is None:
        parts.extend(positive_current_medication_terms_from_blob(extract_text_blob(snapshot, medical_orders=None)))
    mentions = getattr(medical_orders, "medication_mentions", None) if not isinstance(medical_orders, dict) else medical_orders.get("medication_mentions")
    for mention in mentions or []:
        status = mention.get("authorization_status") if isinstance(mention, dict) else getattr(mention, "authorization_status", None)
        if status == "already_taken":
            med = mention.get("medication") if isinstance(mention, dict) else getattr(mention, "medication", None)
            desc = mention.get("description") if isinstance(mention, dict) else getattr(mention, "description", None)
            parts.extend([str(x) for x in [med, desc] if x])
    return normalize_text(" ".join(parts))


def structured_condition_ok(name: str, expected, snapshot, blob: str, medical_orders=None) -> bool:
    age = patient_age(snapshot)
    weight = patient_weight(snapshot)
    meds = current_medication_blob(snapshot, medical_orders=medical_orders)
    if name == "age_years_lt":
        return age is not None and age < float(expected)
    if name == "age_years_gte":
        return age is not None and age >= float(expected)
    if name == "weight_kg_missing":
        return (weight is None) is bool(expected)
    if name == "pregnant":
        return positive_pregnancy(snapshot, blob) is bool(expected)
    if name == "current_medications_any":
        return terms_any([str(x) for x in (expected if isinstance(expected, list) else [expected])], meds)
    if name == "chronic_conditions_any":
        patient = getattr(snapshot, "patient", None)
        conds = normalize_text(" ".join(str(x) for x in getattr(patient, "chronic_conditions", []) or []))
        return terms_any([str(x) for x in (expected if isinstance(expected, list) else [expected])], conds)
    if name == "requested_medications_any":
        req = normalize_text(" ".join(_order_values(medical_orders, "requested_medications")))
        return terms_any([str(x) for x in (expected if isinstance(expected, list) else [expected])], req)
    if name == "already_taken_medications_any":
        taken = normalize_text(" ".join(_order_values(medical_orders, "already_taken_medications")))
        return terms_any([str(x) for x in (expected if isinstance(expected, list) else [expected])], taken)
    return False


def structured_conditions_ok(conditions: dict, snapshot, blob: str, medical_orders=None) -> bool:
    return all(structured_condition_ok(k, v, snapshot, blob, medical_orders=medical_orders) for k, v in (conditions or {}).items())

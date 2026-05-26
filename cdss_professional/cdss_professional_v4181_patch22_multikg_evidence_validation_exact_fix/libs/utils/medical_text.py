from __future__ import annotations

import re
import unicodedata
from typing import Iterable

_DCI_ALIASES = {
    "ACETAMINOPHEN": "PARACETAMOL",
    "PARACETAMOL": "PARACETAMOL",
    "IBUPROFEN": "IBUPROFENE",
    "IBUPROFENE": "IBUPROFENE",
    "SALBUTAMOL SULFATE": "SALBUTAMOL",
    "AMOXICILLIN": "AMOXICILLINE",
    "METFORMIN": "METFORMINE",
    "DEXTROMETHORPHAN": "DEXTROMETHORPHANE",
}

_STOP_INGREDIENT_TOKENS = {
    "ACIDE", "BASE", "SEL", "SODIQUE", "SODIUM", "POTASSIQUE", "POTASSIUM",
    "CHLORHYDRATE", "HYDROCHLORIDE", "MONOHYDRATE", "DIHYDRATE", "ANHYDRE",
    "PHOSPHATE", "SULFATE", "MESILATE", "TARTRATE", "BESILATE", "MALEATE",
    "ET", "AVEC", "PLUS", "AND", "WITH",
}

_STOP_KEYWORDS = {
    "patient", "patiente", "traitement", "therapy", "prescrire", "prescription", "ordonnance",
    "mg", "ml", "cp", "gelule", "comprime", "jour", "jours", "mois", "ans", "year", "years",
    "need", "needed", "possible", "likely", "suspected",
}


_MOJIBAKE_REPLACEMENTS = {
    "Ã©": "é",
    "Ã¨": "è",
    "Ãª": "ê",
    "Ã«": "ë",
    "Ã ": "à",
    "Ã¢": "â",
    "Ã´": "ô",
    "Ã¶": "ö",
    "Ã®": "î",
    "Ã¯": "ï",
    "Ã¹": "ù",
    "Ã»": "û",
    "Ã§": "ç",
    "Ã‰": "É",
    "Ãˆ": "È",
    "ÃŠ": "Ê",
    "Ã‡": "Ç",
}


def repair_mojibake(text: str | None) -> str:
    text = "" if text is None else str(text)
    for broken, fixed in _MOJIBAKE_REPLACEMENTS.items():
        text = text.replace(broken, fixed)
    return text


def strip_accents(text: str | None) -> str:
    text = repair_mojibake(text)
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_medical_text(text: str | None) -> str:
    text = strip_accents(text).upper()
    for source, target in _DCI_ALIASES.items():
        text = text.replace(source, target)
    text = re.sub(r"[\[\]\(\)\{\},;:]", " ", text)
    text = text.replace("+", " + ").replace("/", " / ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_search_text(text: str | None) -> str:
    text = strip_accents(text).lower()
    text = re.sub(r"[^a-z0-9\u0600-\u06FF\s/\+\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def canonical_ingredient_text(text: str | None) -> str:
    return normalize_medical_text(text)


def ingredient_set(text: str | None) -> tuple[str, ...]:
    text = canonical_ingredient_text(text)
    text = re.sub(r"\b(?:AND|WITH)\b", " + ", text)
    parts = re.split(r"\s*\+\s*|\s*/\s*|\s*;\s*|\s*,\s*", text)
    tokens: list[str] = []
    for part in parts:
        words = [w for w in re.split(r"\s+", part.strip()) if w and w not in _STOP_INGREDIENT_TOKENS]
        if words:
            tokens.append(" ".join(words))
    out: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token not in seen:
            out.append(token)
            seen.add(token)
    return tuple(out)


def dose_tokens(text: str | None) -> set[str]:
    text = normalize_medical_text(text)
    found: set[str] = set()
    for number, unit in re.findall(r"(\d+(?:[\.,]\d+)?)\s*(MG|MCG|UG|G|ML|UI|IU|%)", text):
        found.add(f"{number.replace(',', '.')}{unit}")
    return found


def form_bucket(form_text: str | None) -> str:
    text = normalize_medical_text(form_text)
    if any(k in text for k in ["COMPRIME", "GELULE", "SIROP", "SUSPENSION ORALE", "SOLUTION BUVABLE", "SACHET", "ORODISPERSIBLE", "GRANULE", "PASTILLE", "TABLET"]):
        return "oral"
    if any(k in text for k in ["INJECTABLE", "PERFUSION", "PREP INJECTABLE", "AMP", "FLACON INJ"]):
        return "injectable"
    if any(k in text for k in ["CREME", "POMMADE", "GEL", "DERMIQUE", "CUTANEE", "LOTION"]):
        return "topical"
    if any(k in text for k in ["COLLYRE", "OPHTAL", "EYE"]):
        return "ophthalmic"
    if any(k in text for k in ["AURICULAIRE", "OTIQUE"]):
        return "otic"
    if any(k in text for k in ["NASAL", "SPRAY NASAL"]):
        return "nasal"
    if any(k in text for k in ["AEROSOL", "INHAL", "NEBULIS", "PUFF"]):
        return "inhaled"
    if "SUPPOSITOIRE" in text:
        return "rectal"
    return "other"


def route_bucket(route_text: str | None, dose_text: str | None = None, ingredient_text: str | None = None) -> str:
    text = normalize_medical_text(route_text)
    if any(k in text for k in ["PO", "ORAL", "PER OS"]):
        return "oral"
    if any(k in text for k in ["IV", "IM", "SC", "INTRAVEINEUX", "INTRAMUSCULAIRE", "SOUS CUTANE"]):
        return "injectable"
    if any(k in text for k in ["TOPIQUE", "TOPICAL", "CUTANEE", "CUTANEOUS"]):
        return "topical"
    if any(k in text for k in ["INHALED", "INHALATION", "INHALE", "NEB", "PUFF"]):
        return "inhaled"
    if any(k in text for k in ["OPHT", "EYE"]):
        return "ophthalmic"
    if any(k in text for k in ["NASAL"]):
        return "nasal"
    if any(k in text for k in ["RECTAL", "PR"]):
        return "rectal"
    fallback = normalize_medical_text(f"{dose_text or ''} {ingredient_text or ''}")
    if any(k in fallback for k in ["SPRAY", "PUFF", "INHAL", "MCG/DOSE"]):
        return "inhaled"
    return "unknown"


def tokenize_clinical_text(text: str | None, *, min_len: int = 3) -> list[str]:
    text = normalize_search_text(text)
    return [token for token in text.split() if len(token) >= min_len and token not in _STOP_KEYWORDS]


def query_keywords(*parts: str | None, max_terms: int = 10) -> list[str]:
    bag: list[str] = []
    for part in parts:
        bag.extend(tokenize_clinical_text(part, min_len=4))
    out: list[str] = []
    seen: set[str] = set()
    for token in bag:
        if token not in seen:
            seen.add(token)
            out.append(token)
        if len(out) >= max_terms:
            break
    return out


def term_overlap_score(a: Iterable[str], b: Iterable[str]) -> float:
    set_a = {str(x).strip().lower() for x in a if str(x).strip()}
    set_b = {str(x).strip().lower() for x in b if str(x).strip()}
    if not set_a or not set_b:
        return 0.0
    inter = len(set_a.intersection(set_b))
    return inter / max(len(set_a), len(set_b))


def contains_any(text: str | None, keywords: Iterable[str]) -> bool:
    hay = normalize_search_text(text)
    return any((term := normalize_search_text(keyword)) and term in hay for keyword in keywords)

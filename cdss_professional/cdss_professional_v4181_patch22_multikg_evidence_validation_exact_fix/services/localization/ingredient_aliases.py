from __future__ import annotations
import re, unicodedata
from typing import Any
from services.normalization.dci_normalizer import canonicalize_dci

def normalize_text(value: Any) -> str:
    text = str(value or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("µ", "u")
    text = re.sub(r"[^a-z0-9%+/.]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()

ALIASES = {
    "paracetamol": {"paracetamol","paracétamol","acetaminophen","adol","adoline","analgan","algesic","doliprane","doliprane tn","efferalgan","novadol"},
    "salbutamol": {"salbutamol","albuterol","sulfate de salbutamol","sulphate de salbutamol","salbutamol sulfate","aerol","ventol","ventoline","ventaxx","ventolin"},
    "ibuprofen": {"ibuprofen","ibuprofene","ibuprofène","nsaid","ains"},
    "amoxicillin": {"amoxicillin","amoxicilline"},
}

def canonical_active_ingredient(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    # Query strings often contain dose/route/context; detect known ingredient
    # aliases as tokens before applying exact DCI normalization.
    for preferred, aliases in ALIASES.items():
        for alias in aliases:
            alias_norm = normalize_text(alias)
            if alias_norm and re.search(r"(?<![a-z0-9])" + re.escape(alias_norm) + r"(?![a-z0-9])", text):
                return canonicalize_dci(preferred) or preferred
    canonical = canonicalize_dci(str(value or ""))
    if canonical and canonical != text:
        return canonical
    stripped = re.sub(r"\b(sulfate|sulphate|chlorhydrate|hydrochloride|hemihydrate|fumarate|maleate|sodium|de|du|des)\b", " ", text)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    canonical = canonicalize_dci(stripped)
    return canonical if canonical != stripped else stripped

def ingredient_matches(expected: Any, candidate: Any, candidate_name: Any = "") -> bool:
    exp = canonical_active_ingredient(expected)
    if not exp:
        return True
    candidate_text = normalize_text(candidate)
    candidate_ai = canonical_active_ingredient(candidate)
    if candidate_text and candidate_text not in {"unknown", "na", "n a"}:
        return exp == candidate_ai
    return exp == canonical_active_ingredient(candidate_name)

def is_combination(value: Any) -> bool:
    raw = str(value or "")
    text = normalize_text(raw)
    known = [
        "paracetamol", "amoxicill", "clavulan", "ibuprofen", "diclofen", "naprox",
        "dextromethorph", "doxylamine", "phenylephrine", "pseudoephed", "caffeine",
        "salbutamol", "cetiriz", "omepraz", "metformin", "aspirin", "codeine",
    ]
    hits = {token for token in known if token in text}
    return "+" in raw or "/" in raw or len(hits) >= 2 or any(t in text for t in ["association","associe","associes","combine"])

def strength_tokens(value: Any) -> set[str]:
    text = normalize_text(value)
    text = text.replace("microgrammes","mcg").replace("microgramme","mcg").replace("micrograms","mcg").replace("microgram","mcg")
    text = re.sub(r"\bug\b", "mcg", text).replace("mc g","mcg")
    return {n.replace(",", ".") + u.replace("ug", "mcg") for n, u in re.findall(r"(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ug|ui|iu|%)", text)}

def inhalation_form(value: Any) -> bool:
    text = normalize_text(value)
    return any(t in text for t in ["aerosol","inhal","nebul","spray","respirator"])

def oral_form(value: Any) -> bool:
    text = normalize_text(value)
    if inhalation_form(text) or any(t in text for t in ["inject","ampoule","iv","im","perfus"]):
        return False
    return any(t in text for t in ["comprime","tablet","gelule","capsule","sirop","syrup","buvable","oral","orale","cp"])

def route_compatible(requested_route: Any, product_form: Any, active_ingredient: Any = "", product_name: Any = "") -> bool:
    route = normalize_text(requested_route)
    blob = normalize_text(" ".join([str(product_form or ""), str(active_ingredient or ""), str(product_name or "")]))
    if not route or route == "unknown":
        return True
    if "inhal" in route:
        return any(t in blob for t in ["aerosol","inhal","nebul","spray","respirator"])
    if "inject" in route:
        return any(t in blob for t in ["inject","ampoule","iv","im","perfus"])
    if "oral" in route or "orale" in route:
        return oral_form(blob) or (blob and not inhalation_form(blob) and "inject" not in blob)
    return True

def requested_route_from_medication(medication: Any) -> str:
    ingredient = canonical_active_ingredient(getattr(medication, "active_ingredient", ""))
    route = normalize_text(getattr(medication, "route", ""))
    dose = normalize_text(getattr(medication, "dose", ""))
    if ingredient == "salbutamol" or "inhal" in route or "aerosol" in dose:
        return "inhalation"
    if "inject" in route:
        return "injectable"
    return "oral" if not route or "oral" in route or "orale" in route else route

def preferred_brand_bonus(product_name: Any, active_ingredient: Any) -> float:
    name = normalize_text(product_name)
    ai = canonical_active_ingredient(active_ingredient)
    if ai == "paracetamol":
        if any(t in name for t in ["adol","adoline","analgan","algesic","novadol"]): return 2.0
        if any(t in name for t in ["doliprane","efferalgan"]): return 1.0
    if ai == "salbutamol" and any(t in name for t in ["aerol","ventol","ventoline","ventaxx"]): return 2.0
    return 0.0

from __future__ import annotations

import re
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from libs.utils.medical_text import normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci
from services.domain.utils import as_list, unique


class EvidencePolarity(str, Enum):
    POSITIVE = "positive"      # e.g. allergy to amoxicillin
    NEGATED = "negated"        # e.g. no known allergy / NKDA
    UNKNOWN = "unknown"        # e.g. allergy status not mentioned / unknown


class AllergyEvidence(BaseModel):
    substance: str = ""
    polarity: EvidencePolarity = EvidencePolarity.UNKNOWN
    source: str = "unknown"
    raw_text: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


_NEGATED_ALLERGY_PATTERNS = [
    r"\bno\s+known\s+allerg(?:y|ies)\b",
    r"\bnkda\b",
    r"\bno\s+allerg(?:y|ies)\b",
    r"\bdenies\s+allerg(?:y|ies)\b",
    r"\bwithout\s+allerg(?:y|ies)\b",
    r"\bpas\s+d\s+allerg(?:ie|y)\b",
    r"\bpas\s+de\s+allerg(?:ie|y)\b",
    r"\baucune\s+allerg(?:ie|y)\b",
    r"\babsence\s+d?\s*allerg(?:ie|y)\b",
    r"\bsans\s+allerg(?:ie|y)\b",
]

_UNKNOWN_ALLERGY_PATTERNS = [
    r"\ballerg(?:y|ie|ies)\s+(?:status\s+)?(?:unknown|not\s+known|missing|non\s+renseign[eé])\b",
    r"\bunknown\s+allerg(?:y|ies)\b",
    r"\bmissing\s+allerg(?:y|ies|y\s+history)\b",
    r"\bant[eé]c[eé]dents?\s+allergiques?\s+(?:inconnus?|non\s+renseign[eé]s?)\b",
]

_POSITIVE_ALLERGY_PATTERNS = [
    r"\ballerg(?:y|ic|ie|ique|iques)\s+(?:to|a|à|au|aux|de|d)?\s*(?P<substance>[a-z0-9+\- ]{3,45})",
    r"\b(?P<substance>[a-z0-9+\- ]{3,45})\s+allerg(?:y|ie)\b",
    r"\bintolerance\s+(?:to|a|à|au|aux|de|d)?\s*(?P<substance>[a-z0-9+\- ]{3,45})",
    r"\bhypersensibilit[eé]\s+(?:to|a|à|au|aux|de|d)?\s*(?P<substance>[a-z0-9+\- ]{3,45})",
]

_ALLERGY_CLASS_MAP = {
    "penicillin": ["penicillin", "amoxicillin", "amoxicillin + clavulanic acid"],
    "penicilline": ["penicillin", "amoxicillin", "amoxicillin + clavulanic acid"],
    "beta lactam": ["penicillin", "amoxicillin", "amoxicillin + clavulanic acid"],
    "betalactam": ["penicillin", "amoxicillin", "amoxicillin + clavulanic acid"],
    "betalactamine": ["penicillin", "amoxicillin", "amoxicillin + clavulanic acid"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen"],
    "ains": ["ibuprofen", "diclofenac", "naproxen"],
    "anti inflammatoire": ["ibuprofen", "diclofenac", "naproxen"],
}


def _has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def _substance_from_positive_text(text: str) -> str:
    for pattern in _POSITIVE_ALLERGY_PATTERNS:
        for match in re.finditer(pattern, text):
            substance = normalize_search_text(match.groupdict().get("substance") or "")
            if not substance:
                continue
            # Stop at common separators so an entire clinical sentence does not
            # become the substance.
            substance = re.split(r"\b(?:and|avec|mais|pour|depuis|patient|doctor|medecin|docteur|prescrit|request|demande)\b", substance)[0].strip()
            if substance and substance not in {"known", "status", "history", "allergy", "allergie"}:
                return substance
    return ""


def classify_allergy_text(raw: str, *, source: str = "text") -> AllergyEvidence | None:
    text = normalize_search_text(raw)
    if not text:
        return None
    if _has_any_pattern(text, _NEGATED_ALLERGY_PATTERNS):
        return AllergyEvidence(substance="", polarity=EvidencePolarity.NEGATED, source=source, raw_text=raw)
    if _has_any_pattern(text, _UNKNOWN_ALLERGY_PATTERNS):
        return AllergyEvidence(substance="", polarity=EvidencePolarity.UNKNOWN, source=source, raw_text=raw)
    substance = _substance_from_positive_text(text)
    if substance:
        return AllergyEvidence(substance=substance, polarity=EvidencePolarity.POSITIVE, source=source, raw_text=raw)
    return None


def _iter_snapshot_allergy_sources(snapshot: Any) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    patient = getattr(snapshot, "patient", None)
    if patient is not None:
        for item in as_list(getattr(patient, "known_allergies", [])):
            out.append(("patient.known_allergies", item))
    ctx = getattr(snapshot, "extracted_context", None)
    if isinstance(ctx, dict):
        for key in ["allergies", "known_allergies", "allergy_history", "allergy_evidence"]:
            for item in as_list(ctx.get(key)):
                out.append((f"extracted_context.{key}", item))
    risk = getattr(snapshot, "risk_flags", None)
    if getattr(risk, "allergy_risk", False) is True:
        for note in as_list(getattr(risk, "notes", [])):
            if "allerg" in normalize_search_text(note):
                out.append(("risk_flags.notes", note))
    for attr in ["normalized_runtime_text", "doctor_notes", "raw_text", "transcript_text"]:
        val = getattr(snapshot, attr, None)
        if val:
            out.append((f"snapshot.{attr}", str(val)))
    consultation = getattr(snapshot, "consultation", None)
    if consultation is not None:
        notes = getattr(consultation, "doctor_notes", None)
        if notes:
            out.append(("consultation.doctor_notes", str(notes)))
        for idx, turn in enumerate(getattr(consultation, "transcript", []) or []):
            text = turn.get("text", "") if isinstance(turn, dict) else getattr(turn, "text", "")
            if text:
                out.append((f"consultation.transcript[{idx}]", str(text)))
    return out


def extract_allergy_evidence(snapshot: Any, medical_orders: Any | None = None) -> list[AllergyEvidence]:
    evidence: list[AllergyEvidence] = []
    for source, raw in _iter_snapshot_allergy_sources(snapshot):
        ev = classify_allergy_text(raw, source=source)
        if ev is not None:
            evidence.append(ev)

    if medical_orders is not None:
        mentions = medical_orders.get("risk_mentions", []) if isinstance(medical_orders, dict) else getattr(medical_orders, "risk_mentions", [])
        for mention in mentions or []:
            text = mention.get("text") if isinstance(mention, dict) else getattr(mention, "text", None)
            canonical = mention.get("canonical") if isinstance(mention, dict) else getattr(mention, "canonical", None)
            status = mention.get("status") if isinstance(mention, dict) else getattr(mention, "status", None)
            raw = " ".join(str(x) for x in [text, canonical, status] if x)
            ev = classify_allergy_text(raw, source="medical_orders.risk_mentions")
            if ev is not None:
                evidence.append(ev)

    # Deduplicate while preserving polarity. Positive evidence remains separate
    # from negated/unknown evidence so absence of allergy never becomes a block.
    seen = set()
    unique_evidence: list[AllergyEvidence] = []
    for ev in evidence:
        key = (ev.polarity.value, normalize_search_text(ev.substance), ev.source, normalize_search_text(ev.raw_text)[:160])
        if key not in seen:
            seen.add(key)
            unique_evidence.append(ev)
    return unique_evidence


def _class_members(substance: str) -> list[str]:
    norm = normalize_search_text(substance)
    for key, members in _ALLERGY_CLASS_MAP.items():
        if key in norm:
            return members
    return []


def compute_forbidden_ingredients(allergy_evidence: list[AllergyEvidence]) -> list[str]:
    forbidden: list[str] = []
    for allergy in allergy_evidence:
        if allergy.polarity != EvidencePolarity.POSITIVE:
            continue
        substance = normalize_search_text(allergy.substance)
        if not substance:
            continue
        members = _class_members(substance)
        if members:
            forbidden.extend(members)
            continue
        canonical = canonicalize_dci(substance)
        if canonical:
            forbidden.append(canonical)
    return unique(forbidden)

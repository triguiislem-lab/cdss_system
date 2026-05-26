from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from libs.contracts.patient import ConsultationInput
from libs.utils.medical_text import normalize_search_text
from services.generation.llm_router import LLMRouter


LEVEL1_EXTRACTION_SYSTEM_PROMPT = (
    Path(__file__).resolve().parents[1] / "prompts" / "level1_extraction_system.txt"
).read_text(encoding="utf-8")

LEVEL1_EXTRACTION_SCHEMA_HINT = {
    "explicit_symptoms": [],
    "negated_symptoms": [],
    "explicit_conditions": [],
    "current_medications": [],
    "medication_mentions": [],
    "therapeutic_class_mentions": [],
    "allergies": [],
    "no_known_allergy": None,
    "pregnancy_status": "unknown",  # pregnant | not_pregnant | unknown
    "breastfeeding": "unknown",     # yes | no | unknown
    "renal_impairment": "unknown",  # yes | no | unknown
    "hepatic_impairment": "unknown",# yes | no | unknown
    "duration_days": None,
    "red_flags": [],
    "source_spans": {},
    "confidence": 0.0,
}


class Level1Extractor(Protocol):
    def extract(self, consultation: ConsultationInput, *, runtime_text: str = "") -> dict[str, Any]:
        ...


@dataclass
class QwenClinicalExtractor:
    """Optional Qwen-assisted Level-1 extractor.

    This extractor is deliberately constrained to explicit information extraction.
    It should never infer prescriptions or diagnoses. The deterministic parser
    remains the baseline; this component only produces a candidate structured
    extraction that is reconciled with the static parser output.
    """

    llm_router: LLMRouter
    confidence_threshold: float = 0.65
    max_preview_chars: int = 1200

    def extract(self, consultation: ConsultationInput, *, runtime_text: str = "") -> dict[str, Any]:
        prompt = self._build_prompt(consultation, runtime_text=runtime_text)
        try:
            raw = self.llm_router.generate_structured_text(prompt, system_prompt_override=LEVEL1_EXTRACTION_SYSTEM_PROMPT)
        except TypeError:  # backward-compatible test doubles
            raw = self.llm_router.generate_structured_text(prompt)
        parsed = _parse_json_object(raw)
        normalized = self._normalize_payload(parsed)
        normalized["raw_llm_output_length"] = len(raw or "")
        normalized["raw_llm_output_preview"] = (raw or "")[: self.max_preview_chars]
        normalized["llm_extractor_model_used"] = "llm_model_used=true" in (raw or "")
        normalized["confidence_threshold"] = self.confidence_threshold
        return normalized

    def _build_prompt(self, consultation: ConsultationInput, *, runtime_text: str) -> str:
        transcript = "\n".join(f"{turn.speaker}: {turn.text}" for turn in consultation.transcript)
        return "\n".join(
            [
                "User content for Level-1 extraction. Follow the system prompt exactly.",
                "Return JSON only, with this schema:",
                json.dumps(LEVEL1_EXTRACTION_SCHEMA_HINT, ensure_ascii=False),
                "Doctor notes:",
                consultation.doctor_notes or "",
                "Transcript:",
                transcript,
                "Normalized runtime text:",
                runtime_text,
            ]
        )

    def _normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        def list_of_strings(*keys: str) -> list[str]:
            values: list[str] = []
            for key in keys:
                raw = payload.get(key)
                if isinstance(raw, str):
                    values.append(raw)
                elif isinstance(raw, list):
                    values.extend(str(item) for item in raw if item is not None)
            return _dedup_norm(values)

        confidence = _safe_float(payload.get("confidence"), default=0.0)
        return {
            "explicit_symptoms": list_of_strings("explicit_symptoms", "symptoms", "symptomes", "symptômes"),
            "negated_symptoms": list_of_strings("negated_symptoms", "symptoms_negated", "symptomes_negatifs"),
            "explicit_conditions": list_of_strings("explicit_conditions", "conditions", "antecedents", "antécédents"),
            "current_medications": list_of_strings("current_medications", "medications", "medicaments", "médicaments", "traitements"),
            "medication_mentions": _normalize_mention_list(payload.get("medication_mentions", payload.get("mentions_medicaments", []))),
            "therapeutic_class_mentions": _normalize_mention_list(payload.get("therapeutic_class_mentions", payload.get("classes_therapeutiques", []))),
            "allergies": list_of_strings("allergies", "allergies_connues"),
            "red_flags": list_of_strings("red_flags", "signes_gravite", "signes_de_gravite"),
            "no_known_allergy": _to_bool_or_none(payload.get("no_known_allergy", payload.get("pas_allergie_connue"))),
            "pregnancy_status": _normalize_status(payload.get("pregnancy_status", payload.get("grossesse")), yes="pregnant", no="not_pregnant"),
            "breastfeeding": _normalize_status(payload.get("breastfeeding", payload.get("allaitement")), yes="yes", no="no"),
            "renal_impairment": _normalize_status(payload.get("renal_impairment", payload.get("insuffisance_renale")), yes="yes", no="no"),
            "hepatic_impairment": _normalize_status(payload.get("hepatic_impairment", payload.get("insuffisance_hepatique")), yes="yes", no="no"),
            "duration_days": _safe_int(payload.get("duration_days", payload.get("duree_jours"))),
            "source_spans": payload.get("source_spans", {}) if isinstance(payload.get("source_spans"), dict) else {},
            "confidence": confidence,
            "accepted_by_confidence": confidence >= self.confidence_threshold,
        }


@dataclass
class ExtractionReconciliationResult:
    parsed: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)


class Level1ExtractionReconciler:
    """Reconcile deterministic Level-1 extraction with optional Qwen extraction.

    Safety principle:
    - Static extraction remains the baseline.
    - Qwen can add explicit low-risk facts when confidence is sufficient.
    - For safety-critical fields, positive risk is kept or added conservatively.
    - Contradictions are recorded and trigger review via unresolved_flags.
    """

    safety_fields = {
        "pregnancy_mentioned": "pregnancy_status",
        "renal_mentioned": "renal_impairment",
        "hepatic_mentioned": "hepatic_impairment",
    }

    def reconcile(self, parsed: dict[str, Any], llm_payload: dict[str, Any] | None, *, mode: str = "assist") -> ExtractionReconciliationResult:
        base = _deep_copy_jsonable(parsed)
        metadata = {
            "enabled": bool(llm_payload),
            "mode": mode,
            "status": "not_configured" if not llm_payload else "available",
            "accepted": False,
            "added_symptoms": [],
            "added_conditions": [],
            "added_medications": [],
            "added_therapeutic_classes": [],
            "added_allergies": [],
            "conflicts": [],
            "raw_llm_output_length": 0,
            "raw_llm_output_preview": "",
        }
        if not llm_payload:
            return ExtractionReconciliationResult(parsed=base, metadata=metadata)

        metadata.update({
            "confidence": llm_payload.get("confidence", 0.0),
            "accepted_by_confidence": bool(llm_payload.get("accepted_by_confidence")),
            "raw_llm_output_length": llm_payload.get("raw_llm_output_length", 0),
            "raw_llm_output_preview": llm_payload.get("raw_llm_output_preview", ""),
            "llm_extractor_model_used": llm_payload.get("llm_extractor_model_used", False),
        })
        if mode == "shadow":
            metadata["status"] = "shadow_only"
            return ExtractionReconciliationResult(parsed=base, metadata=metadata)
        if not llm_payload.get("accepted_by_confidence"):
            metadata["status"] = "low_confidence_ignored"
            return ExtractionReconciliationResult(parsed=base, metadata=metadata)

        metadata["accepted"] = True
        metadata["status"] = "accepted"

        # Add explicit symptoms/conditions/meds/allergies that the static parser missed.
        metadata["added_symptoms"] = _merge_list_field(base, "symptoms", llm_payload.get("explicit_symptoms", []))
        metadata["added_conditions"] = _merge_list_field(base, "disease_tags", llm_payload.get("explicit_conditions", []))
        metadata["added_medications"] = _merge_list_field(base, "current_medications", llm_payload.get("current_medications", []))
        metadata["added_allergies"] = _merge_list_field(base, "allergies", llm_payload.get("allergies", []))

        extracted_context = dict(base.get("extracted_context", {}) or {})
        therapeutic_class_mentions = _dedup_mention_payloads(
            list(extracted_context.get("therapeutic_class_mentions", []) or [])
            + list(llm_payload.get("therapeutic_class_mentions", []) or [])
        )
        medication_mentions = _dedup_mention_payloads(
            list(extracted_context.get("medication_mentions", []) or [])
            + list(llm_payload.get("medication_mentions", []) or [])
        )
        extracted_context["therapeutic_class_mentions"] = therapeutic_class_mentions
        extracted_context["medication_mentions"] = medication_mentions
        metadata["added_therapeutic_classes"] = [m.get("canonical") or m.get("canonical_class") or m.get("text") for m in llm_payload.get("therapeutic_class_mentions", []) or []]
        extracted_context["current_medications"] = list(base.get("current_medications", []) or [])
        extracted_context["allergies"] = list(base.get("allergies", []) or [])
        if llm_payload.get("duration_days") is not None and not extracted_context.get("duration_days"):
            extracted_context["duration_days"] = llm_payload.get("duration_days")
            metadata["duration_days_added"] = llm_payload.get("duration_days")

        if llm_payload.get("no_known_allergy") is True and not base.get("allergies"):
            extracted_context["no_known_allergy"] = True

        # Conservative safety-critical merge.
        conflicts: list[str] = []
        self._merge_status_field(base, extracted_context, llm_payload, "pregnancy_mentioned", "pregnancy_status", "pregnant", "not_pregnant", conflicts)
        self._merge_status_field(base, extracted_context, llm_payload, "renal_mentioned", "renal_impairment", "yes", "no", conflicts)
        self._merge_status_field(base, extracted_context, llm_payload, "hepatic_mentioned", "hepatic_impairment", "yes", "no", conflicts)

        red_flags = list(extracted_context.get("red_flags", []) or [])
        for flag in llm_payload.get("red_flags", []) or []:
            label = normalize_search_text(str(flag))
            if label and label not in red_flags:
                red_flags.append(label)
        extracted_context["red_flags"] = red_flags
        base["emergency_detected"] = bool(red_flags or base.get("emergency_detected"))

        unresolved_flags = list(extracted_context.get("unresolved_flags", []) or [])
        for conflict in conflicts:
            token = f"llm_static_extraction_conflict:{conflict}"
            if token not in unresolved_flags:
                unresolved_flags.append(token)
        extracted_context["unresolved_flags"] = unresolved_flags
        metadata["conflicts"] = conflicts

        base["extracted_context"] = extracted_context
        base["vulnerable_flags"] = _dedup_norm(list(base.get("vulnerable_flags", []) or []) + self._vulnerable_from_status(base))
        base["suspected_conditions"] = _dedup_norm(list(base.get("suspected_conditions", []) or []) + _basic_inferred_conditions(base))
        base["missing_critical_information"] = self._remove_resolved_missing(base)
        return ExtractionReconciliationResult(parsed=base, metadata=metadata)

    def _merge_status_field(
        self,
        base: dict[str, Any],
        extracted_context: dict[str, Any],
        llm_payload: dict[str, Any],
        parsed_key: str,
        llm_key: str,
        positive_value: str,
        negative_value: str,
        conflicts: list[str],
    ) -> None:
        llm_value = llm_payload.get(llm_key, "unknown")
        static_positive = bool(base.get(parsed_key))
        if llm_value == positive_value and not static_positive:
            base[parsed_key] = True
            extracted_context[parsed_key] = True
        elif llm_value == negative_value and static_positive:
            # Keep safer positive value, but mark a conflict for review.
            conflicts.append(parsed_key)

    def _vulnerable_from_status(self, parsed: dict[str, Any]) -> list[str]:
        flags: list[str] = []
        if parsed.get("pregnancy_mentioned"):
            flags.append("pregnancy")
        if parsed.get("renal_mentioned"):
            flags.append("renal")
        if parsed.get("hepatic_mentioned"):
            flags.append("hepatic")
        return flags

    def _remove_resolved_missing(self, parsed: dict[str, Any]) -> list[str]:
        missing = list(parsed.get("missing_critical_information", []) or [])
        ctx = parsed.get("extracted_context", {}) or {}
        if parsed.get("symptoms"):
            missing = [item for item in missing if item != "clear symptom description"]
        if ctx.get("duration_days") is not None:
            missing = [item for item in missing if item != "symptom duration"]
        if ctx.get("no_known_allergy") or parsed.get("allergies"):
            missing = [item for item in missing if item != "allergy history"]
        if parsed.get("current_medications"):
            missing = [item for item in missing if item != "current medications"]
        return list(dict.fromkeys(missing))


def _normalize_mention_list(raw) -> list[dict[str, Any]]:
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    out: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, str):
            text = item.strip()
            if text:
                out.append({"text": text, "canonical": normalize_search_text(text), "confidence": 0.65})
            continue
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("span") or item.get("mention") or "").strip()
        canonical = str(item.get("canonical") or item.get("canonical_class") or item.get("dci") or text).strip()
        if not text and not canonical:
            continue
        status = str(item.get("status") or item.get("authorization_status") or "unknown").strip()
        speaker = str(item.get("speaker") or item.get("source") or "unknown").strip()
        out.append({
            "text": text or canonical,
            "canonical": normalize_search_text(canonical or text),
            "canonical_class": normalize_search_text(str(item.get("canonical_class") or canonical or text)),
            "status": normalize_search_text(status) or "unknown",
            "source": normalize_search_text(speaker) or "unknown",
            "confidence": _safe_float(item.get("confidence"), default=0.65),
        })
    return _dedup_mention_payloads(out)


def _dedup_mention_payloads(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = (
            normalize_search_text(str(item.get("canonical") or item.get("canonical_class") or item.get("text") or "")),
            normalize_search_text(str(item.get("status") or "")),
            normalize_search_text(str(item.get("source") or "")),
        )
        if not key[0] or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _parse_json_object(raw: str | None) -> dict[str, Any]:
    text = raw or ""
    # Remove model-use note if appended by LLMRouter.
    text_no_notes = re.sub(r"\nnote:\s*llm_model_used=.*$", "", text, flags=re.S).strip()
    candidates = [text_no_notes]
    fenced = re.findall(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text_no_notes, flags=re.S | re.I)
    candidates.extend(fenced)
    brace = re.search(r"(\{.*\})", text_no_notes, flags=re.S)
    if brace:
        candidates.append(brace.group(1))
    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        try:
            value = json.loads(candidate)
        except Exception:
            continue
        if isinstance(value, dict):
            return value
        if isinstance(value, list):
            return {"explicit_symptoms": value}
    return {}


def _merge_list_field(base: dict[str, Any], key: str, additions: Any) -> list[str]:
    existing = list(base.get(key, []) or [])
    added: list[str] = []
    for item in additions or []:
        norm = normalize_search_text(str(item))
        if norm and norm not in existing:
            existing.append(norm)
            added.append(norm)
    base[key] = list(dict.fromkeys(existing))
    return added


def _basic_inferred_conditions(parsed: dict[str, Any]) -> list[str]:
    symptoms = set(parsed.get("symptoms", []) or [])
    inferred: list[str] = []
    if {"fever", "cough"}.issubset(symptoms):
        inferred.append("respiratory infection")
    if {"fever", "sore throat"}.issubset(symptoms):
        inferred.append("upper respiratory tract infection")
    if {"dyspnea", "wheezing"}.issubset(symptoms):
        inferred.append("asthma exacerbation")
    return inferred


def _dedup_norm(values: list[Any]) -> list[str]:
    out: list[str] = []
    for item in values:
        norm = normalize_search_text(str(item))
        if norm and norm not in out:
            out.append(norm)
    return out


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except Exception:
        match = re.search(r"\d+", str(value))
        return int(match.group(0)) if match else None


def _to_bool_or_none(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    norm = normalize_search_text(str(value))
    if norm in {"yes", "true", "oui", "1", "present", "known"}:
        return True
    if norm in {"no", "false", "non", "0", "absent", "none", "unknown"}:
        return False if norm != "unknown" else None
    return None


def _normalize_status(value: Any, *, yes: str, no: str) -> str:
    if isinstance(value, bool):
        return yes if value else no
    norm = normalize_search_text(str(value or ""))
    if not norm or norm in {"unknown", "inconnu", "na", "none", "null"}:
        return "unknown"
    positive = {"yes", "true", "oui", "present", "pregnant", "enceinte", "grossesse", "renal", "hepatic", "insuffisance", "maladie"}
    negative = {"no", "false", "non", "absent", "not pregnant", "pas enceinte", "pas", "sans", "aucun", "aucune"}
    if any(token in norm for token in negative):
        return no
    if any(token in norm for token in positive):
        return yes
    return "unknown"


def _deep_copy_jsonable(value: dict[str, Any]) -> dict[str, Any]:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return dict(value)

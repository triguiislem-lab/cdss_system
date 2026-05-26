from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from libs.contracts.patient import ConsultationInput, PatientSnapshot
from services.generation.llm_router import LLMRouter
from services.normalization.dci_normalizer import canonicalize_dci
from services.order_extraction.contracts import ClinicalMention, MedicalOrder, TherapeuticClassMention


MEDIQA_OE_SYSTEM_PROMPT = (
    Path(__file__).resolve().parents[1] / "prompts" / "medical_order_extraction_system.txt"
).read_text(encoding="utf-8")


MEDIQA_OE_SCHEMA = {
    "medication_events": [
        {
            "description": "string mention as stated",
            "ingredient": "canonical active ingredient if known, otherwise empty",
            "brand": "brand/product if stated, otherwise empty",
            "status": "doctor_ordered | doctor_authorized | patient_requested_not_authorized | already_taken | not_currently_taking | historical | negated_or_avoid | mentioned_only | unknown",
            "source": "doctor | patient | record | unknown",
            "doctor_authorized": False,
            "quantity": None,
            "unit": "tablet | puff | sachet | ml | unknown",
            "strength": "e.g. 500 mg, 100 ug/dose",
            "frequency": "string or empty",
            "time_window": "today | since_morning | previous | unknown",
            "reason": "clinical reason explicitly stated",
            "provenance_turns": [1],
            "include_as_order": False,
            "confidence": 0.0,
        }
    ],
    "orders": [
        {
            "description": "order description",
            "order_type": "medication | lab | imaging | followup | other",
            "reason": "why the order was made, from dialogue only",
            "provenance_turns": [1],
            "authorization_status": "doctor_ordered | doctor_authorized | patient_requested_not_authorized | mentioned_only | unknown",
            "include_as_order": True,
            "confidence": 0.0,
        }
    ],
    "clinical_facts": {
        "symptoms": [
            {"text": "string", "canonical": "string", "provenance_turns": [1], "confidence": 0.0}
        ],
        "red_flags": [
            {"text": "string", "canonical": "string", "provenance_turns": [1], "confidence": 0.0}
        ],
        "risks": [
            {"text": "string", "canonical": "pregnancy | renal_impairment | hepatic_impairment | allergy | anticoagulant | pediatric | other", "provenance_turns": [1], "confidence": 0.0}
        ],
        "missing_information": ["string"],
    },
    "excluded_mentions": [
        {"text": "string", "reason": "why excluded", "provenance_turns": [1]}
    ],
    "self_check": {
        "patient_requests_not_orders_checked": True,
        "already_taken_not_prescribed_checked": True,
        "historical_not_renewed_checked": True,
        "negation_checked": True,
        "provenance_complete": True,
    },
    "confidence": 0.0,
}


@dataclass
class MediqaOeExtractionPayload:
    medication_mentions: list[MedicalOrder] = field(default_factory=list)
    orders: list[MedicalOrder] = field(default_factory=list)
    symptom_mentions: list[ClinicalMention] = field(default_factory=list)
    risk_mentions: list[ClinicalMention] = field(default_factory=list)
    red_flag_mentions: list[ClinicalMention] = field(default_factory=list)
    missing_critical_information: list[str] = field(default_factory=list)
    excluded_mentions: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class QwenMediqaOeExtractor:
    """MEDIQA-OE style Qwen extractor for medical orders and clinical events.

    This component uses Qwen for the hard language-understanding step:
    who mentioned a medication, whether it was ordered by the doctor, merely
    requested by the patient, already taken, historical, or negated/avoid.

    It does not decide safety. Downstream deterministic policy/planner still
    makes the final route/generation decision.
    """

    llm_router: LLMRouter
    confidence_threshold: float = 0.60
    max_preview_chars: int = 1200

    def extract(self, item: ConsultationInput | PatientSnapshot, *, runtime_text: str = "") -> MediqaOeExtractionPayload:
        prompt = self._build_prompt(item, runtime_text=runtime_text)
        try:
            raw = self.llm_router.generate_structured_text(prompt, system_prompt_override=MEDIQA_OE_SYSTEM_PROMPT)
        except TypeError:  # backward-compatible test doubles
            raw = self.llm_router.generate_structured_text(prompt)
        parsed = _parse_json_object(raw)
        payload = self._normalize_payload(parsed)
        payload.metadata.update(
            {
                "enabled": True,
                "mode": "mediqa_oe_qwen",
                "raw_llm_output_length": len(raw or ""),
                "raw_llm_output_preview": (raw or "")[: self.max_preview_chars],
                "llm_extractor_model_used": "llm_model_used=true" in (raw or ""),
                "confidence_threshold": self.confidence_threshold,
                "accepted_by_confidence": float(payload.metadata.get("confidence", 0.0) or 0.0) >= self.confidence_threshold,
            }
        )
        return payload

    def _build_prompt(self, item: ConsultationInput | PatientSnapshot, *, runtime_text: str = "") -> str:
        consultation = item.consultation if isinstance(item, PatientSnapshot) else item
        patient_json: dict[str, Any] = {}
        if isinstance(item, PatientSnapshot):
            patient_json = item.patient.model_dump(mode="json")
        transcript_lines = []
        for idx, turn in enumerate(consultation.transcript or [], start=1):
            transcript_lines.append(f"[{idx}] {turn.speaker}: {turn.text}")
        if consultation.doctor_notes:
            transcript_lines.insert(0, f"[0] doctor_note: {consultation.doctor_notes}")

        example_1 = {
            "input": "[1] doctor: Je prescris salbutamol inhalateur. [2] patient: D'accord.",
            "output": {
                "medication_events": [
                    {
                        "description": "salbutamol inhalateur",
                        "ingredient": "salbutamol",
                        "brand": "",
                        "status": "doctor_ordered",
                        "source": "doctor",
                        "doctor_authorized": True,
                        "quantity": None,
                        "unit": "unknown",
                        "strength": "",
                        "frequency": "",
                        "time_window": "unknown",
                        "reason": "asthma/wheezing treatment explicitly ordered by doctor",
                        "provenance_turns": [1],
                        "include_as_order": True,
                        "confidence": 0.95,
                    }
                ],
                "orders": [
                    {
                        "description": "salbutamol inhalateur",
                        "order_type": "medication",
                        "reason": "doctor explicitly prescribed it",
                        "provenance_turns": [1],
                        "authorization_status": "doctor_ordered",
                        "include_as_order": True,
                        "confidence": 0.95,
                    }
                ],
                "clinical_facts": {"symptoms": [], "red_flags": [], "risks": [], "missing_information": []},
                "excluded_mentions": [],
                "self_check": {
                    "patient_requests_not_orders_checked": True,
                    "already_taken_not_prescribed_checked": True,
                    "historical_not_renewed_checked": True,
                    "negation_checked": True,
                    "provenance_complete": True,
                },
                "confidence": 0.95,
            },
        }
        example_2 = {
            "input": "[1] patient: Je veux Augmentin. [2] doctor: Je n'ai pas indiqué d'antibiotique. [3] patient: J'ai déjà pris Doliprane 500 mg huit fois aujourd'hui.",
            "output": {
                "medication_events": [
                    {
                        "description": "Augmentin",
                        "ingredient": "amoxicillin + clavulanic acid",
                        "brand": "Augmentin",
                        "status": "patient_requested_not_authorized",
                        "source": "patient",
                        "doctor_authorized": False,
                        "quantity": None,
                        "unit": "unknown",
                        "strength": "",
                        "frequency": "",
                        "time_window": "unknown",
                        "reason": "patient requested it, doctor explicitly did not indicate antibiotic",
                        "provenance_turns": [1, 2],
                        "include_as_order": False,
                        "confidence": 0.96,
                    },
                    {
                        "description": "Doliprane 500 mg huit fois aujourd'hui",
                        "ingredient": "paracetamol",
                        "brand": "Doliprane",
                        "status": "already_taken",
                        "source": "patient",
                        "doctor_authorized": False,
                        "quantity": 8,
                        "unit": "tablet",
                        "strength": "500 mg",
                        "frequency": "",
                        "time_window": "today",
                        "reason": "patient says medication was already taken repeatedly today",
                        "provenance_turns": [3],
                        "include_as_order": False,
                        "confidence": 0.97,
                    },
                ],
                "orders": [],
                "clinical_facts": {"symptoms": [], "red_flags": [], "risks": [], "missing_information": []},
                "excluded_mentions": [
                    {"text": "Augmentin", "reason": "patient request, not doctor order", "provenance_turns": [1, 2]},
                    {"text": "Doliprane", "reason": "already taken, not newly prescribed", "provenance_turns": [3]},
                ],
                "self_check": {
                    "patient_requests_not_orders_checked": True,
                    "already_taken_not_prescribed_checked": True,
                    "historical_not_renewed_checked": True,
                    "negation_checked": True,
                    "provenance_complete": True,
                },
                "confidence": 0.97,
            },
        }
        example_3 = {
            "input": "[1] patient: Fièvre 39.4 et mal de tête très fort. [2] doctor: Raideur de nuque ou taches ? [3] patient: Oui, nuque raide et taches violettes qui ne blanchissent pas.",
            "output": {
                "medication_events": [],
                "orders": [],
                "clinical_facts": {
                    "symptoms": [
                        {"text": "Fièvre 39.4", "canonical": "fever", "provenance_turns": [1], "confidence": 0.95},
                        {"text": "mal de tête très fort", "canonical": "severe_headache", "provenance_turns": [1], "confidence": 0.92}
                    ],
                    "red_flags": [
                        {"text": "nuque raide", "canonical": "neck_stiffness", "provenance_turns": [3], "confidence": 0.96},
                        {"text": "taches violettes qui ne blanchissent pas", "canonical": "non_blanching_petechial_rash", "provenance_turns": [3], "confidence": 0.96}
                    ],
                    "risks": [],
                    "missing_information": []
                },
                "excluded_mentions": [],
                "self_check": {
                    "patient_requests_not_orders_checked": True,
                    "already_taken_not_prescribed_checked": True,
                    "historical_not_renewed_checked": True,
                    "negation_checked": True,
                    "provenance_complete": True
                },
                "confidence": 0.96
            },
        }

        return "\n".join(
            [
                "MEDIQA-OE STYLE MEDICAL ORDER AND CLINICAL EVENT EXTRACTION.",
                "Extract only explicit information from the doctor-patient consultation.",
                "Important inclusion/exclusion rules:",
                "- A medication is an included medication order only if the doctor explicitly orders, prescribes, recommends, authorizes, or renews it.",
                "- Patient-requested medication without doctor authorization is NOT an order; extract it as medication_event with patient_requested_not_authorized and include_as_order=false.",
                "- Already-taken, current, historical, negated, refused, or avoid medications are NOT new orders; extract them as events for safety.",
                "- If an old treatment is mentioned but not explicitly renewed, exclude it from orders and explain why.",
                "- Extract provenance_turns using the bracketed turn numbers. Use [0] for doctor notes if needed.",
                "- Extract red_flags and risks even when there is no medication order; this drives downstream safety policy.",
                "- For medication_events, set status/source/doctor_authorized using speaker roles and explicit wording, not drug name alone.",
                "- Keep the reason grounded in the dialogue. Do not infer unsupported diagnoses.",
                "- Use null/empty fields when unknown; do not fabricate dose, frequency, diagnosis, or order intent.",
                "- Return JSON only with exactly the requested top-level shape.",
                "JSON schema/template:",
                json.dumps(MEDIQA_OE_SCHEMA, ensure_ascii=False),
                "Few-shot example 1:",
                json.dumps(example_1, ensure_ascii=False),
                "Few-shot example 2:",
                json.dumps(example_2, ensure_ascii=False),
                "Few-shot example 3:",
                json.dumps(example_3, ensure_ascii=False),
                "Patient profile JSON:",
                json.dumps(patient_json, ensure_ascii=False),
                "Consultation language:",
                consultation.language or "unknown",
                "Consultation transcript with turn IDs:",
                "\n".join(transcript_lines) or runtime_text or "",
                "Normalized runtime text for fallback context:",
                runtime_text or "",
                "Return the extraction JSON now:",
            ]
        )

    def _normalize_payload(self, payload: dict[str, Any]) -> MediqaOeExtractionPayload:
        out = MediqaOeExtractionPayload()
        confidence = _safe_float(payload.get("confidence"), default=0.0)
        out.metadata["confidence"] = confidence
        out.metadata["self_check"] = payload.get("self_check", {}) if isinstance(payload.get("self_check"), dict) else {}
        out.excluded_mentions = payload.get("excluded_mentions", []) if isinstance(payload.get("excluded_mentions"), list) else []

        for event in _as_list(payload.get("medication_events")):
            if not isinstance(event, dict):
                continue
            order = _event_to_medical_order(event)
            if order is not None:
                out.medication_mentions.append(order)
                # Keep all medication events in orders audit; downstream target selection
                # only treats doctor-authorized/ordered medications as generation targets.
                out.orders.append(order)

        for order_payload in _as_list(payload.get("orders")):
            if not isinstance(order_payload, dict):
                continue
            order = _order_payload_to_order(order_payload)
            if order is not None:
                out.orders.append(order)
                if order.order_type == "medication":
                    out.medication_mentions.append(order)

        facts = payload.get("clinical_facts", {}) if isinstance(payload.get("clinical_facts"), dict) else {}
        for item in _as_list(facts.get("symptoms")):
            mention = _fact_to_mention(item, category="symptom")
            if mention is not None:
                out.symptom_mentions.append(mention)
        for item in _as_list(facts.get("risks")):
            mention = _fact_to_mention(item, category="risk")
            if mention is not None:
                out.risk_mentions.append(mention)
        for item in _as_list(facts.get("red_flags")):
            mention = _fact_to_mention(item, category="red_flag")
            if mention is not None:
                out.red_flag_mentions.append(mention)
        out.missing_critical_information = [str(x) for x in _as_list(facts.get("missing_information")) if str(x).strip()]
        return out


def _parse_json_object(raw: str | None) -> dict[str, Any]:
    text = str(raw or "").strip()
    # Remove marker appended by LLMRouter.
    text = re.sub(r"\nnote: llm_model_used=true.*$", "", text, flags=re.S).strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text.strip(), flags=re.I).strip()
        text = re.sub(r"```$", "", text.strip()).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        pass
    match = re.search(r"\{.*\}", text, flags=re.S)
    if match:
        try:
            obj = json.loads(match.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
    return {}


def _event_to_medical_order(event: dict[str, Any]) -> MedicalOrder | None:
    description = str(event.get("description") or event.get("text") or event.get("brand") or event.get("ingredient") or "").strip()
    ingredient = canonicalize_dci(str(event.get("ingredient") or event.get("medication") or event.get("canonical") or description))
    if not description and not ingredient:
        return None
    status = _map_authorization_status(str(event.get("status") or event.get("authorization_status") or "unknown"), include_as_order=bool(event.get("include_as_order")))
    source = _map_source(str(event.get("source") or "unknown"), status=status)
    return MedicalOrder(
        description=description or ingredient,
        order_type="medication",
        medication=ingredient or None,
        product_name=str(event.get("brand") or event.get("product_name") or "").strip() or None,
        strength=str(event.get("strength") or "").strip() or None,
        route=str(event.get("route") or "").strip() or None,
        source=source,
        authorization_status=status,
        reason=str(event.get("reason") or "MEDIQA-OE Qwen medication event.").strip(),
        provenance=_provenance(event.get("provenance_turns", event.get("provenance", []))),
        confidence=_bounded_float(event.get("confidence"), default=0.65),
        source_text=description or None,
    )


def _order_payload_to_order(item: dict[str, Any]) -> MedicalOrder | None:
    order_type = str(item.get("order_type") or "other").strip().lower()
    if order_type == "follow-up":
        order_type = "followup"
    if order_type not in {"medication", "lab", "imaging", "followup", "other"}:
        order_type = "other"
    description = str(item.get("description") or "").strip()
    if not description:
        return None
    status = _map_authorization_status(str(item.get("authorization_status") or item.get("status") or "unknown"), include_as_order=bool(item.get("include_as_order", True)))
    medication = canonicalize_dci(str(item.get("ingredient") or item.get("medication") or description)) if order_type == "medication" else None
    return MedicalOrder(
        description=description,
        order_type=order_type,  # type: ignore[arg-type]
        medication=medication or None,
        source=_map_source(str(item.get("source") or "doctor"), status=status),
        authorization_status=status,
        reason=str(item.get("reason") or "MEDIQA-OE Qwen order.").strip(),
        provenance=_provenance(item.get("provenance_turns", item.get("provenance", []))),
        confidence=_bounded_float(item.get("confidence"), default=0.65),
        source_text=description,
    )


def _fact_to_mention(item: Any, *, category: str) -> ClinicalMention | None:
    if isinstance(item, str):
        text = item
        canonical = item
        provenance = []
        confidence = 0.65
    elif isinstance(item, dict):
        text = str(item.get("text") or item.get("description") or item.get("canonical") or "").strip()
        canonical = str(item.get("canonical") or text).strip()
        provenance = _provenance(item.get("provenance_turns", item.get("provenance", [])))
        confidence = _bounded_float(item.get("confidence"), default=0.65)
    else:
        return None
    if not text and not canonical:
        return None
    return ClinicalMention(
        text=text or canonical,
        canonical=_normalize_canonical(canonical or text),
        category=category,
        status="mentioned_not_authorized",
        source="doctor_mentioned",
        source_text=text or canonical,
        confidence=confidence,
    )


def _map_authorization_status(value: str, *, include_as_order: bool = False) -> str:
    v = _normalize_canonical(value)
    if v in {"doctor_ordered", "doctor_authorized", "doctor_prescribed", "ordered", "prescribed", "renewed", "recommended"}:
        return "authorized"
    if "patient_requested" in v or "requested_not_authorized" in v or ("request" in v and "doctor" not in v):
        return "requested_not_authorized"
    if "already" in v or "taken" in v or "current" == v:
        return "already_taken"
    if "not_current" in v or "not_taking" in v or "not_currently_taking" in v:
        return "not_currently_taking"
    if "historical" in v or "previous" in v or "old" in v:
        return "historical"
    if "avoid" in v or "negated" in v or "contra" in v or "stop" in v:
        return "negated_or_avoid"
    if include_as_order:
        return "authorized"
    if "mention" in v:
        return "mentioned_not_authorized"
    return "unknown"


def _map_source(value: str, *, status: str) -> str:
    v = _normalize_canonical(value)
    if status == "already_taken":
        return "already_taken"
    if status == "not_currently_taking":
        return "not_currently_taking"
    if status == "historical":
        return "historical_medication"
    if status == "negated_or_avoid":
        return "negated_or_avoid"
    if "doctor" in v or "medecin" in v:
        return "doctor_authorized" if status == "authorized" else "doctor_mentioned"
    if "patient" in v:
        return "patient_request"
    if status == "authorized":
        return "doctor_authorized"
    return "unknown"


def _provenance(value: Any) -> list[int]:
    out: list[int] = []
    for item in _as_list(value):
        try:
            out.append(int(item))
        except Exception:
            continue
    return list(dict.fromkeys(out))


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _safe_float(value: Any, *, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _bounded_float(value: Any, *, default: float = 0.65) -> float:
    val = _safe_float(value, default=default)
    if val < 0:
        return 0.0
    if val > 1:
        return 1.0
    return val


def _normalize_canonical(value: str) -> str:
    value = str(value or "").lower().strip()
    value = re.sub(r"[^a-z0-9+]+", "_", value)
    return value.strip("_")

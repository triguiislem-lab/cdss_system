from __future__ import annotations

import csv
import os
import sqlite3
import re
import unicodedata
from pathlib import Path
from typing import Iterable

from libs.contracts.patient import ConsultationInput, PatientSnapshot
from libs.utils.medical_text import normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci
from services.domain.utils import CARDIAC_CHEST_TERMS, CARDIAC_ASSOCIATED_TERMS
from services.order_extraction.llm_mediqa_oe_extractor import QwenMediqaOeExtractor, MediqaOeExtractionPayload
from services.order_extraction.contracts import (
    ClinicalMention,
    MedicalOrder,
    MedicalOrderExtractionResult,
    TherapeuticClassMention,
)


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = Path(os.environ.get("CDSS_RUNTIME_DATA_ROOT") or ROOT_DIR / "data" / "runtime")

_FALLBACK_MEDICATION_ALIASES: dict[str, list[str]] = {
    "paracetamol": ["paracetamol", "paracétamol", "acetaminophen", "doliprane", "adol", "novadol", "doli", "doleprane"],
    "amoxicillin": ["amoxicillin", "amoxicilline", "augmentin", "augmenten", "ogmentin"],
    "ibuprofen": ["ibuprofen", "ibuprofene", "ibuprofène", "brufen"],
    "diclofenac": ["diclofenac", "diclofénac", "voltaren"],
    "naproxen": ["naproxen"],
    "salbutamol": ["salbutamol", "albuterol", "ventoline", "ventolin", "ventaxx", "aerol"],
    "warfarin": ["warfarin", "coumadin"],
    "acenocoumarol": ["acenocoumarol", "acénocoumarol", "sintrom", "avk"],
    "codeine": ["codeine", "codéine", "codeina", "codine"],
}

ARABIZI_ALREADY_CUES = ["khdhit", "kdhit", "khdit", "kdhitou", "chrebt", "chrabt", "klit", "5dhit", "5dhitou", "deja khdhit"]
ARABIZI_REQUEST_CUES = ["nheb", "n7eb", "nhebou", "7abbit", "habbit", "a3tini", "atini", "3tini", "najjem nekhou", "najem ne5ou", "ne5ou"]


LAB_TERMS = ["nfs", "crp", "glycemie", "glycémie", "creatinine", "créatinine", "bilan", "blood test"]
IMAGING_TERMS = ["radio", "xray", "x-ray", "echographie", "échographie", "scanner", "irm"]
FOLLOWUP_TERMS = ["controle", "contrôle", "suivi", "follow up", "rendez-vous", "review"]

SYMPTOM_TERMS: dict[str, list[str]] = {
    "fever": ["fever", "fievre", "fièvre", "حمى", "سخانة", "سخونه", "skhana", "s5ana", "sakhan", "sokhana", "sakhana", "7ami", "hami"],
    "headache": ["headache", "cephalee", "céphalée", "mal de tete", "mal de tête"],
    "severe_headache": ["worst headache", "pire mal de tete", "pire mal de tête", "thunderclap", "céphalée brutale", "cephalee brutale"],
    "pain": ["pain", "douleur", "back pain", "douleur lombaire", "low back pain", "pain au dos", "وجيعة", "وجع", "ألم"],
    "flank_pain": ["flank pain", "douleur au flanc", "douleur flanc", "flanc droit", "flanc gauche"],
    "dysuria": ["dysuria", "brulures urinaires", "brûlures urinaires", "brulure mictionnelle", "brûlure mictionnelle"],
    "cough": ["cough", "toux", "كحة", "سعال", "k7a", "ka7a", "ko7a", "kouha"],
    "sore_throat": ["sore throat", "mal de gorge", "gorge irritée", "gorge irritee"],
    "wheezing": ["wheezing", "sifflement", "sibilance", "bronchospasm"],
    "chest_pain": ["chest pain", "douleur thoracique", "oppression thoracique"] + CARDIAC_CHEST_TERMS,
    "nausea": ["nausea", "nausée", "nausee"],
    "vomiting": ["vomiting", "vomissements", "vomi"],
    "trismus": ["trismus", "difficile ouvrir bouche", "ouvrir la bouche", "bouche difficile"],
}

RISK_TERMS: dict[str, list[str]] = {
    "pregnancy": ["pregnant", "grossesse", "enceinte"],
    "breastfeeding": ["breastfeeding", "allaitement", "j allaite", "j'allaite"],
    "renal_impairment": ["renal impairment", "kidney disease", "insuffisance renale", "insuffisance rénale", "maladie renale", "maladie rénale"],
    "hepatic_impairment": ["hepatic impairment", "liver failure", "insuffisance hepatique", "insuffisance hépatique", "cirrhosis", "cirrhose"],
    "allergy": ["allergy", "allergie", "allergique", "حساسية", "حساسيه"],
    "anticoagulant": ["warfarin", "acenocoumarol", "sintrom", "anticoagulant", "avk"],
}

RED_FLAG_TERMS: dict[str, list[str]] = {
    "severe_dyspnea": ["severe dyspnea", "dyspnee severe", "dyspnée sévère", "cyanosis", "cyanose", "silent chest"],
    "chest_pain_red_flags": ["sueurs", "sweating", "syncope", "radiation"] + CARDIAC_ASSOCIATED_TERMS,
    "anaphylaxis": ["anaphylaxis", "anaphylaxie", "lip swelling", "gonflement des levres", "gonflement des lèvres", "throat tightness", "serre dans la gorge"],
    "neurologic_red_flag": ["neck stiffness", "raideur nuque", "nuque raide", "neurologic deficit", "deficit neurologique", "déficit neurologique", "main faible", "arm weakness", "speech problem", "vision floue", "blurred vision"],
    "pyelonephritis_red_flag": ["flank pain", "douleur au flanc", "flanc droit", "flanc gauche", "rigors", "frissons"],
    "meningitis_red_flag": ["neck stiffness", "nuque raide", "raideur nuque", "petechiae", "pétéchies", "purpura", "taches violettes", "ne blanchissent pas"],
    "dental_deep_infection_red_flag": ["trismus", "difficile ouvrir bouche", "joue gonflée", "joue gonflee", "difficulté à avaler", "difficulte a avaler"],
}

REQUEST_PATTERNS = [
    r"(?:demande|requests?|wants?|souhaite|طلب|يريد|نحب|je veux|donnez|give me|can i take|nheb|n7eb|7abbit|habbit|a3tini|atini|3tini|najjem nekhou|ne5ou).{{0,65}}\b{term}\b",
    r"\b{term}\b.{{0,65}}(?:demande|requested|souhait[eé]|souhaite|request|asks?|wants?)",
]
ALREADY_TAKEN_PATTERNS = [
    r"(?:already took|already taking|took|taking|prend|a pris|prise|deja pris|déjà pris|currently taking|actuellement|traitement par|sous|khdhit|kdhit|khdit|chrebt|chrabt|5dhit).{{0,65}}\b{term}\b",
    r"\b{term}\b.{{0,65}}(?:already|pris|prise|taking|actuellement|current|today|aujourdhui|aujourd hui|aujourd'hui)",
]
AUTHORIZED_PATTERNS = [
    r"(?:prescribe|prescrire|prescrit|ordonner|ordonnance|proposer|donner|start|commencer|je prescris|i prescribe).{{0,65}}\b{term}\b",
    r"\b{term}\b.{{0,65}}(?:prescribed|autorise|autorisé|authorized|ordonnance|propos[eé]|propose|a prendre)",
]
HISTORICAL_PATTERNS = [
    r"(?:ancien|ancienne|history of|historique|previously|avant|ancien traitement).{{0,65}}\b{term}\b",
    r"\b{term}\b.{{0,65}}(?:ancien|historique|previously|avant)",
]
AVOID_PATTERNS = [
    r"(?:avoid|eviter|éviter|ne pas|stop|arreter|arrêter|contre indique|contre-indique|contre-indiqué).{{0,65}}\b{term}\b",
    r"\b{term}\b.{{0,65}}(?:avoid|eviter|éviter|ne pas|stop|arreter|arrêter|contre indique|contre-indique|contre-indiqué)",
]


def normalize_text(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("µ", "u")
    text = re.sub(r"[^a-z0-9\u0600-\u06FF]+", " ", text)
    return " ".join(text.split())


class MedicalOrderExtractionService:
    """Hybrid-ready structured medical-order and clinical fact extraction.

    The service remains deterministic by default, but it now produces the
    structured layer needed by the planner: medication mentions, therapeutic
    class mentions, symptom/risk/red-flag facts, and a three-case classifier.
    Optional Qwen Level-1 output can be passed indirectly through the snapshot's
    extracted context; rules still validate and normalize the final result.
    """

    def __init__(
        self,
        runtime_dir: Path | None = None,
        llm_mediqa_oe_extractor: QwenMediqaOeExtractor | None = None,
        llm_mediqa_oe_mode: str = "assist",
        llm_mediqa_oe_policy: str = "selective",
    ) -> None:
        self.runtime_dir = runtime_dir or RUNTIME_DIR
        self.llm_mediqa_oe_extractor = llm_mediqa_oe_extractor
        self.llm_mediqa_oe_mode = (llm_mediqa_oe_mode or "assist").lower()
        self.llm_mediqa_oe_policy = (llm_mediqa_oe_policy or "selective").lower()
        self.medication_alias_rows = _load_medication_alias_rows(Path(os.environ.get("MEDICATION_ALIASES_PATH") or self.runtime_dir / "tn_medication_aliases.csv"))
        self.therapeutic_class_rows = _load_therapeutic_class_rows(Path(os.environ.get("THERAPEUTIC_CLASS_ALIASES_PATH") or self.runtime_dir / "tn_therapeutic_class_aliases.csv"))
        self._all_entity_terms = _build_entity_terms(self.medication_alias_rows, self.therapeutic_class_rows)

    def extract(self, consultation: ConsultationInput | PatientSnapshot) -> MedicalOrderExtractionResult:
        if isinstance(consultation, PatientSnapshot):
            text = _snapshot_text(consultation)
            snapshot_context = getattr(consultation, "extracted_context", {}) or {}
        else:
            text = _consultation_text(consultation)
            snapshot_context = {}
        low = normalize_text(text)

        orders: list[MedicalOrder] = []
        medication_mentions: list[MedicalOrder] = []
        therapeutic_class_mentions: list[TherapeuticClassMention] = []
        symptom_mentions: list[ClinicalMention] = []
        risk_mentions: list[ClinicalMention] = []
        red_flag_mentions: list[ClinicalMention] = []
        conflicts: list[str] = []
        mediqa_oe_metadata: dict = {"enabled": bool(self.llm_mediqa_oe_extractor), "status": "not_configured"}

        for row in self.medication_alias_rows:
            alias_norm = row.get("_alias_norm") or normalize_text(row["alias"])
            if not alias_norm or alias_norm not in low:
                continue
            for match in _iter_term_matches(alias_norm, low, normalized=True):
                term_start, term_end = _term_span(match)
                if row.get("_quality_action") == "requires_med_context" and not _has_medication_context(low, term_start, term_end):
                    continue
                source, status = self._classify_mention(row["alias"], low, match_start=term_start, match_end=term_end)
                strength = _extract_strength_near(low, term_start, term_end, self._entity_terms_for_local_classification(exclude=alias_norm))
                route = _infer_route_near(low, term_start, term_end)
                order = MedicalOrder(
                    description=row["alias"],
                    order_type="medication",
                    medication=canonicalize_dci(row["canonical_dci"]),
                    product_name=row.get("product_name") or None,
                    strength=strength,
                    route=route,
                    source=source,
                    authorization_status=status,
                    source_text=low[term_start:term_end],
                    start=term_start,
                    end=term_end,
                    reason=f"Medication mention classified locally as {status}; canonical={canonicalize_dci(row['canonical_dci'])}.",
                    confidence=float(row.get("confidence") or 0.78) if status != "mentioned_not_authorized" else 0.62,
                )
                medication_mentions.append(order)
                orders.append(order)

        for row in self.therapeutic_class_rows:
            alias_norm = row.get("_alias_norm") or normalize_text(row["alias"])
            if not alias_norm or alias_norm not in low:
                continue
            for match in _iter_term_matches(alias_norm, low, normalized=True):
                term_start, term_end = _term_span(match)
                if row.get("_quality_action") == "requires_med_context" and not _has_medication_context(low, term_start, term_end):
                    continue
                source, status = self._classify_mention(row["alias"], low, match_start=term_start, match_end=term_end)
                mention = TherapeuticClassMention(
                    text=row["alias"],
                    canonical=row["canonical_class"],
                    canonical_class=row["canonical_class"],
                    category="therapeutic_class",
                    candidate_policy=row.get("candidate_policy") or "planner_required",
                    default_strategy=row.get("default_strategy") or None,
                    source=source,
                    status=status,
                    source_text=low[term_start:term_end],
                    start=term_start,
                    end=term_end,
                    confidence=float(row.get("confidence") or 0.8),
                )
                therapeutic_class_mentions.append(mention)

        symptom_mentions.extend(_extract_dictionary_mentions(low, SYMPTOM_TERMS, "symptom"))
        risk_mentions.extend(_extract_dictionary_mentions(low, RISK_TERMS, "risk"))
        red_flag_mentions.extend(_extract_dictionary_mentions(low, RED_FLAG_TERMS, "red_flag"))
        red_flag_mentions.extend(_compound_red_flags(low))

        # Pull in validated Level-1 Qwen facts if ClinicalUnderstanding accepted them.
        self._merge_snapshot_context_mentions(
            snapshot_context,
            medication_mentions,
            symptom_mentions,
            risk_mentions,
            therapeutic_class_mentions,
            conflicts,
        )

        # MEDIQA-OE style Qwen extraction: structured medical events and orders.
        # This replaces fragile mention-window heuristics for difficult language
        # understanding cases (patient request vs doctor order, already-taken,
        # historical, negated/avoid), while keeping downstream safety decisions
        # deterministic and auditable.
        if self.llm_mediqa_oe_extractor is not None and self._should_run_mediqa_oe(item=consultation, low=low, snapshot_context=snapshot_context):
            try:
                qwen_payload = self.llm_mediqa_oe_extractor.extract(consultation, runtime_text=low)
                mediqa_oe_metadata = dict(qwen_payload.metadata)
                if self.llm_mediqa_oe_mode == "shadow":
                    mediqa_oe_metadata["status"] = "shadow_only"
                elif not mediqa_oe_metadata.get("accepted_by_confidence"):
                    mediqa_oe_metadata["status"] = "low_confidence_ignored"
                else:
                    mediqa_oe_metadata["status"] = "accepted"
                    self._merge_mediqa_oe_payload(
                        qwen_payload,
                        orders,
                        medication_mentions,
                        symptom_mentions,
                        risk_mentions,
                        red_flag_mentions,
                        conflicts,
                    )
            except Exception as exc:  # fail closed to deterministic extraction
                mediqa_oe_metadata = {"enabled": True, "status": "error", "error_type": type(exc).__name__, "error": str(exc)[:300]}
                conflicts.append(f"mediqa_oe_qwen_extraction_error:{type(exc).__name__}")
        elif self.llm_mediqa_oe_extractor is not None:
            mediqa_oe_metadata = {"enabled": True, "status": "skipped_by_policy", "policy": self.llm_mediqa_oe_policy}

        for term in LAB_TERMS:
            if _term_in_blob(term, low):
                orders.append(MedicalOrder(description=term, order_type="lab", reason="Laboratory order term mentioned.", confidence=0.65))
        for term in IMAGING_TERMS:
            if _term_in_blob(term, low):
                orders.append(MedicalOrder(description=term, order_type="imaging", reason="Imaging order term mentioned.", confidence=0.65))
        for term in FOLLOWUP_TERMS:
            if _term_in_blob(term, low):
                orders.append(MedicalOrder(description=term, order_type="followup", reason="Follow-up term mentioned.", confidence=0.65))

        orders = _dedupe_orders([*orders, *medication_mentions])
        medication_mentions = [o for o in orders if o.order_type == "medication"]
        therapeutic_class_mentions = _dedupe_mentions(therapeutic_class_mentions)
        symptom_mentions = _dedupe_mentions(symptom_mentions)
        risk_mentions = _dedupe_mentions(risk_mentions)
        red_flag_mentions = _dedupe_mentions(red_flag_mentions)

        conflicts.extend(_medication_conflicts(medication_mentions))
        conflicts.extend(_therapeutic_class_conflicts(therapeutic_class_mentions))
        forbidden_ingredients = _forbidden_ingredients_from_mentions(medication_mentions)
        forbidden_classes = _forbidden_classes_from_mentions(therapeutic_class_mentions)
        forbidden_set = {normalize_search_text(x) for x in forbidden_ingredients}
        forbidden_class_set = {_normalize_canonical_id(x) for x in forbidden_classes}

        requested_medications = [
            o.medication or o.description
            for o in medication_mentions
            if o.authorization_status == "requested_not_authorized" and normalize_search_text(o.medication or o.description) not in forbidden_set
        ]
        already_taken_medications = [o.medication or o.description for o in medication_mentions if o.authorization_status == "already_taken"]
        authorized_medications = [
            o.medication or o.description
            for o in medication_mentions
            if o.authorization_status == "authorized" and normalize_search_text(o.medication or o.description) not in forbidden_set
        ]
        requested_classes = [
            m.canonical_class
            for m in therapeutic_class_mentions
            if m.status == "requested_not_authorized" and _normalize_canonical_id(m.canonical_class) not in forbidden_class_set
        ]
        authorized_classes = [
            m.canonical_class
            for m in therapeutic_class_mentions
            if m.status == "authorized" and _normalize_canonical_id(m.canonical_class) not in forbidden_class_set
        ]

        case_type = _classify_case_type(medication_mentions, therapeutic_class_mentions, symptom_mentions, red_flag_mentions)
        required_patient_data = _required_patient_data(case_type, symptom_mentions, risk_mentions)
        required_safety_screens = _required_safety_screens(medication_mentions, therapeutic_class_mentions, symptom_mentions, risk_mentions)

        return MedicalOrderExtractionResult(
            orders=orders,
            medication_mentions=medication_mentions,
            therapeutic_class_mentions=therapeutic_class_mentions,
            symptom_mentions=symptom_mentions,
            risk_mentions=risk_mentions,
            red_flag_mentions=red_flag_mentions,
            requested_medications=list(dict.fromkeys(requested_medications)),
            already_taken_medications=list(dict.fromkeys(already_taken_medications)),
            authorized_medications=list(dict.fromkeys(authorized_medications)),
            requested_therapeutic_classes=list(dict.fromkeys(requested_classes)),
            authorized_therapeutic_classes=list(dict.fromkeys(authorized_classes)),
            case_type=case_type,
            extraction_conflicts=list(dict.fromkeys(conflicts)),
            missing_critical_information=required_patient_data,
            required_patient_data=required_patient_data,
            required_safety_screens=required_safety_screens,
            forbidden_ingredients=forbidden_ingredients,
            notes=[
                "Hybrid-ready structured extraction. Rules normalize explicit medicines/classes and accepted Qwen Level-1 facts can enrich symptoms/risks.",
                "Qwen MEDIQA-OE extraction enriches medical events and clinical facts; therapeutic DCI selection remains delegated to the controlled planner.",
            ],
            diagnostics={
                "text_length": len(text),
                "medication_mention_count": len(medication_mentions),
                "therapeutic_class_mention_count": len(therapeutic_class_mentions),
                "symptom_mention_count": len(symptom_mentions),
                "risk_mention_count": len(risk_mentions),
                "red_flag_mention_count": len(red_flag_mentions),
                "requested_medication_count": len(requested_medications),
                "already_taken_medication_count": len(already_taken_medications),
                "case_type": case_type,
                "mediqa_oe_qwen_extraction": mediqa_oe_metadata,
            },
        )


    def _should_run_mediqa_oe(self, *, item: ConsultationInput | PatientSnapshot, low: str, snapshot_context: dict) -> bool:
        if self.llm_mediqa_oe_policy == "never" or self.llm_mediqa_oe_mode == "off":
            return False
        if self.llm_mediqa_oe_policy == "always":
            return True
        # Selective policy: call Qwen for cases where static extraction is most fragile.
        high_value_terms = [
            "doliprane", "adol", "paracetamol", "augmentin", "amoxicillin", "antibiotique", "azithro",
            "ibuprofen", "ibuprofene", "brufen", "codeine", "codéine", "ventoline", "salbutamol",
            "nheb", "n7eb", "3tini", "a3tini", "khdhit", "khdit", "chrebt", "s5ana", "skhana",
            "deja pris", "déjà pris", "je veux", "demande", "autorise", "prescris", "eviter", "éviter",
            "allergie", "enceinte", "grossesse", "nourrisson", "bébé", "bebe",
            "sinus", "ulcere", "ulcère", "aspirine", "aspirin", "gi bleed",
            "diabetic", "diabete", "diabète", "plaie", "foot", "pied",
            "neck stiffness", "raideur", "nuque raide", "petech", "pétéch", "purpura",
            "artificial tears", "yeux secs", "spray", "alginate", "psyllium",
            "chlorhexidine", "dexpanthenol", "aciclovir", "dimenhydrinate", "lidocaine",
            "flanc", "brulures urinaires", "brûlures urinaires", "frissons", "rigors", "pyelonephritis",
            "pire mal de tete", "pire mal de tête", "thunderclap", "main faible", "deficit neurologique",
            "trismus", "joue gonflee", "joue gonflée", "difficulte a avaler", "difficulté à avaler",
        ]
        if any(term in low for term in high_value_terms):
            return True
        if isinstance(item, PatientSnapshot):
            p = item.patient
            if (p.age_years is not None and p.age_years < 12) or (p.age_months is not None and p.age_months < 36):
                return True
            if p.pregnant is True or p.renal_impairment or p.hepatic_impairment or p.known_allergies:
                return True
        llm_meta = snapshot_context.get("llm_level1_extraction", {}) if isinstance(snapshot_context, dict) else {}
        if llm_meta.get("status") in {"accepted", "low_confidence_ignored"}:
            return True
        return False

    def _merge_mediqa_oe_payload(
        self,
        payload: MediqaOeExtractionPayload,
        orders: list[MedicalOrder],
        medication_mentions: list[MedicalOrder],
        symptom_mentions: list[ClinicalMention],
        risk_mentions: list[ClinicalMention],
        red_flag_mentions: list[ClinicalMention],
        conflicts: list[str],
    ) -> None:
        for order in payload.orders:
            orders.append(order)
        for mention in payload.medication_mentions:
            medication_mentions.append(mention)
        for mention in payload.symptom_mentions:
            symptom_mentions.append(mention)
        for mention in payload.risk_mentions:
            risk_mentions.append(mention)
        for mention in payload.red_flag_mentions:
            red_flag_mentions.append(mention)
        for item in payload.missing_critical_information:
            conflicts.append(f"mediqa_oe_missing_info:{item}")
        for item in payload.excluded_mentions:
            if isinstance(item, dict):
                text = str(item.get("text") or "").strip()
                reason = str(item.get("reason") or "excluded").strip()
                if text:
                    conflicts.append(f"mediqa_oe_excluded:{text}:{reason[:80]}")

    def _classify_mention(self, alias: str, text: str, *, match_start: int | None = None, match_end: int | None = None):
        """Classify mention status from a local mention window.

        The previous implementation matched verbs against the entire consultation.
        That allowed cues like "prend" for Sintrom to leak onto a later
        Doliprane mention. This method scores nearby cues around the actual
        match and ignores cues separated from the mention by another known
        medication/class alias.
        """
        term = normalize_text(alias)
        if not term:
            return "unknown", "unknown"
        if match_start is None or match_end is None:
            match = next(iter(_iter_term_matches(alias, text)), None)
            if match is None:
                return "doctor_mentioned", "mentioned_not_authorized"
            match_start, match_end = _term_span(match)

        entity_terms = self._entity_terms_for_local_classification(exclude=term)
        cue = _best_local_cue(text, match_start, match_end, entity_terms)
        if cue == "not_current":
            return "not_currently_taking", "not_currently_taking"
        if cue == "avoid":
            return "negated_or_avoid", "negated_or_avoid"
        if cue == "already":
            return "already_taken", "already_taken"
        if cue == "request":
            return "patient_request", "requested_not_authorized"
        if cue == "authorized":
            return "doctor_authorized", "authorized"
        if cue == "historical":
            return "historical_medication", "historical"
        return "doctor_mentioned", "mentioned_not_authorized"

    def _entity_terms_for_local_classification(self, *, exclude: str) -> list[str]:
        return [term for term in self._all_entity_terms if term != exclude]

    def _merge_snapshot_context_mentions(
        self,
        snapshot_context: dict,
        medication_mentions: list[MedicalOrder],
        symptom_mentions: list[ClinicalMention],
        risk_mentions: list[ClinicalMention],
        therapeutic_class_mentions: list[TherapeuticClassMention],
        conflicts: list[str],
    ) -> None:
        if not isinstance(snapshot_context, dict):
            return
        llm_meta = snapshot_context.get("llm_level1_extraction", {}) or {}
        for conflict in llm_meta.get("conflicts", []) or []:
            conflicts.append(f"llm_static_extraction_conflict:{conflict}")
        # Parser symptom_mentions are useful diagnostics but may include doctor
        # screening questions as positive facts.  The order-extraction layer uses
        # its own negation-aware dictionary and Qwen MEDIQA-OE facts instead.
        for symptom in snapshot_context.get("symptom_mentions", []) or []:
            if isinstance(symptom, dict) and symptom.get("label"):
                reason = "negated" if symptom.get("negated") is True else "parser_context_not_consumed"
                conflicts.append(f"snapshot_symptom_skipped:{symptom.get('label')}:{reason}")
        for allergy in snapshot_context.get("allergies", []) or []:
            risk_mentions.append(ClinicalMention(
                text=str(allergy), canonical=normalize_search_text(str(allergy)), category="risk", status="mentioned_not_authorized", source="doctor_mentioned", confidence=0.75
            ))

        allowed_meds = {canonicalize_dci(row.get("canonical_dci") or ""): row for row in self.medication_alias_rows}
        for item in snapshot_context.get("medication_mentions", []) or []:
            if not isinstance(item, dict):
                continue
            med = canonicalize_dci(str(item.get("canonical_dci") or item.get("canonical") or item.get("medication") or item.get("text") or ""))
            if not med or med not in allowed_meds:
                conflicts.append(f"llm_unknown_medication:{med or 'empty'}")
                continue
            medication_mentions.append(MedicalOrder(
                description=str(item.get("text") or med),
                order_type="medication",
                medication=med,
                source=_map_llm_source(str(item.get("source") or "unknown")),
                authorization_status=_map_llm_status(str(item.get("status") or item.get("authorization_status") or "unknown")),
                reason="Validated Qwen Level-1 medication mention consumed by structured order extraction.",
                source_text=str(item.get("source_text") or item.get("span") or item.get("text") or ""),
                confidence=float(item.get("confidence") or 0.65),
            ))

        allowed_classes = {_normalize_canonical_id(row.get("canonical_class") or "") for row in self.therapeutic_class_rows}
        for item in snapshot_context.get("therapeutic_class_mentions", []) or []:
            if not isinstance(item, dict):
                continue
            canonical_class = _normalize_canonical_id(str(item.get("canonical_class") or item.get("canonical") or item.get("text") or ""))
            if not canonical_class or canonical_class not in allowed_classes:
                conflicts.append(f"llm_unknown_therapeutic_class:{canonical_class or 'empty'}")
                continue
            therapeutic_class_mentions.append(TherapeuticClassMention(
                text=str(item.get("text") or canonical_class),
                canonical=canonical_class,
                canonical_class=canonical_class,
                category="therapeutic_class",
                status=_map_llm_status(str(item.get("status") or "unknown")),
                source=_map_llm_source(str(item.get("source") or "unknown")),
                candidate_policy="planner_required",
                confidence=float(item.get("confidence") or 0.65),
            ))


def _load_medication_alias_rows_from_sqlite() -> list[dict[str, str]]:
    db = Path(os.environ.get("LOCALIZATION_DB_PATH") or os.environ.get("TN_LOCALIZATION_SQLITE_PATH") or "")
    if not db.exists():
        return []
    out: list[dict[str, str]] = []
    try:
        con = sqlite3.connect(str(db))
        con.row_factory = sqlite3.Row
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        for table in ["medicine_aliases", "medicines"]:
            if table not in tables:
                continue
            cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
            alias_cols = [c for c in cols if c.lower() in {"alias", "alias_text", "normalized_alias", "name", "product_name", "local_product_name", "brand_name", "trade_name"}]
            dci_cols = [c for c in cols if c.lower() in {"dci", "canonical_dci", "active_ingredient", "active_ingredient_raw", "active_ingredient_canonical", "ingredient", "substance"}]
            product_cols = [c for c in cols if c.lower() in {"product_name", "local_product_name", "brand_name", "trade_name", "name"}]
            if not alias_cols:
                alias_cols = [c for c in cols if any(k in c.lower() for k in ["alias", "name", "product", "brand", "trade"])]
            if not dci_cols:
                dci_cols = [c for c in cols if any(k in c.lower() for k in ["dci", "ingredient", "substance"])]
            if not alias_cols or not dci_cols:
                continue
            for row in con.execute(f"SELECT * FROM {table}"):
                data = dict(row)
                canonical = next((str(data.get(c) or "") for c in dci_cols if str(data.get(c) or "").strip()), "")
                if not canonical:
                    continue
                product = next((str(data.get(c) or "") for c in product_cols if str(data.get(c) or "").strip()), "")
                for c in alias_cols + dci_cols:
                    alias = str(data.get(c) or "").strip()
                    if alias:
                        out.append({
                            "alias": alias,
                            "canonical_dci": canonical,
                            "product_name": product,
                            "confidence": "0.86",
                            "source": f"kaggle_sqlite:{table}",
                        })
        con.close()
    except Exception:
        return []
    return out


def _load_medication_alias_rows(path: Path) -> list[dict[str, str]]:
    if path.exists():
        rows = _read_csv_rows(path)
    else:
        rows = _load_medication_alias_rows_from_sqlite()
        if not rows:
            rows = []
            for canonical, aliases in _FALLBACK_MEDICATION_ALIASES.items():
                for alias in aliases:
                    rows.append({"alias": alias, "canonical_dci": canonical, "product_name": "", "confidence": "0.78", "source": "fallback"})
    synonym_path = Path(os.environ.get("DCI_SYNONYMS_PATH") or path.parent / "tn_dci_synonyms.csv")
    rows.extend(_load_dci_synonym_rows(synonym_path))
    overrides = _load_alias_quality_overrides(Path(os.environ.get("ALIAS_QUALITY_OVERRIDES_PATH") or path.parent / "tn_alias_quality_overrides.csv"))
    rows = _apply_alias_quality(rows, overrides)
    for row in rows:
        row["canonical_dci"] = canonicalize_dci(row.get("canonical_dci") or "")
        row["_alias_norm"] = normalize_text(row.get("alias") or "")
    return [row for row in rows if row.get("_alias_norm")]


def _load_dci_synonym_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    out: list[dict[str, str]] = []
    for row in _read_csv_rows(path):
        canonical = canonicalize_dci(row.get("canonical_dci") or row.get("dci") or "")
        for alias in [row.get("alias"), row.get("synonym"), canonical]:
            alias = str(alias or "").strip()
            if alias and canonical:
                out.append({
                    "alias": alias,
                    "canonical_dci": canonical,
                    "product_name": "",
                    "confidence": row.get("confidence") or "0.9",
                    "source": "dci_synonym",
                })
    return out


def _load_alias_quality_overrides(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    out: dict[str, dict[str, str]] = {}
    for row in _read_csv_rows(path):
        alias = normalize_text(row.get("alias") or "")
        if alias:
            out[alias] = row
    return out


def _apply_alias_quality(rows: list[dict[str, str]], overrides: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    # Generated AMM aliases provide wide coverage, but short or ambiguous aliases
    # can create unsafe false positives. Keep seed/allowlisted aliases, block
    # explicit overrides, and remove ambiguous aliases unless a preferred DCI is
    # declared.
    by_alias: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        alias_norm = normalize_text(row.get("alias") or "")
        if alias_norm:
            by_alias.setdefault(alias_norm, []).append(row)
    filtered: list[dict[str, str]] = []
    for alias_norm, alias_rows in by_alias.items():
        override = overrides.get(alias_norm, {})
        action = normalize_search_text(override.get("action") or "").replace(" ", "_")
        preferred = canonicalize_dci(override.get("preferred_dci") or "")
        if action == "block":
            continue
        for _row in alias_rows:
            _row["_quality_action"] = action
            if override.get("required_context"):
                _row["_required_context"] = override.get("required_context")
        source_values = {normalize_text(row.get("source") or "") for row in alias_rows}
        dci_values = {canonicalize_dci(row.get("canonical_dci") or "") for row in alias_rows if canonicalize_dci(row.get("canonical_dci") or "")}
        if len(alias_norm) <= 3 and action not in {"allow", "requires_med_context"}:
            # Keep hand-curated seed aliases like AVK; block generated short aliases
            # such as fer/val/fsh unless explicitly allowlisted.
            if not any(src in {"seed", "fallback"} for src in source_values):
                continue
        if len(dci_values) > 1:
            if preferred:
                alias_rows = [row for row in alias_rows if canonicalize_dci(row.get("canonical_dci") or "") == preferred]
            else:
                continue
        filtered.extend(alias_rows)
    return filtered


def _load_therapeutic_class_rows(path: Path) -> list[dict[str, str]]:
    if path.exists():
        rows = _read_csv_rows(path)
    else:
        rows = [
            {"alias": "antalgique", "canonical_class": "analgesic_antipyretic", "candidate_policy": "planner_required", "default_strategy": "symptomatic", "confidence": "0.9"},
            {"alias": "anti inflammatoire", "canonical_class": "nsaid", "candidate_policy": "planner_required", "default_strategy": "review_if_risk", "confidence": "0.9"},
            {"alias": "antibiotique", "canonical_class": "antibiotic", "candidate_policy": "review_required", "default_strategy": "antibiotic_stewardship", "confidence": "0.95"},
        ]
    for row in rows:
        row["canonical_dci"] = canonicalize_dci(row.get("canonical_dci") or "")
        row["_alias_norm"] = normalize_text(row.get("alias") or "")
    return [row for row in rows if row.get("_alias_norm")]


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return [{str(k): str(v or "") for k, v in row.items()} for row in csv.DictReader(fh)]


def _build_entity_terms(medication_rows: list[dict[str, str]], class_rows: list[dict[str, str]]) -> list[str]:
    terms = {row.get("_alias_norm") or normalize_text(row.get("alias") or "") for row in [*medication_rows, *class_rows]}
    return sorted((term for term in terms if term), key=len, reverse=True)


def _term_in_blob(term: str, blob: str) -> bool:
    t = normalize_text(term)
    return bool(t) and re.search(r"(^|\s)" + re.escape(t) + r"(\s|$)", blob) is not None


def _iter_term_matches(term: str, blob: str, *, normalized: bool = False):
    t = str(term or "") if normalized else normalize_text(term)
    if not t:
        return []
    return list(re.finditer(r"(^|\s)(" + re.escape(t) + r")(?=\s|$)", blob))


def _matches_any(patterns: Iterable[str], escaped_term: str, text: str) -> bool:
    if not escaped_term:
        return False
    return any(re.search(pattern.format(term=escaped_term), text, flags=re.IGNORECASE | re.DOTALL) for pattern in patterns)


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


def _is_locally_negated(blob: str, start: int, end: int) -> bool:
    """Detect local negation and doctor-screening negative answers."""
    before = blob[max(0, start - 95):start]
    after = blob[end:min(len(blob), end + 170)]
    if re.search(r"(?:^|\b)(?:pas\s+de|pas\s+d|aucun|aucune|sans|nie|non|no|denies|negative\s+for|absence\s+de|absence\s+d|without|no\s+evidence\s+of)(?:\s+\w+){0,1}\s*$", before):
        return True
    if _negative_reply_after_term(after):
        return True
    return False


def _extract_dictionary_mentions(blob: str, dictionary: dict[str, list[str]], category: str) -> list[ClinicalMention]:
    out: list[ClinicalMention] = []
    for canonical, terms in dictionary.items():
        for term in terms:
            matches = _iter_term_matches(term, blob)
            if not matches:
                continue
            positive = None
            for match in matches:
                start, end = _term_span(match)
                if not _is_locally_negated(blob, start, end):
                    positive = match
                    break
            if positive is None:
                continue
            match = positive
            start, end = _term_span(match)
            out.append(ClinicalMention(
                text=term,
                canonical=canonical,
                category=category,
                status="mentioned_not_authorized",
                source="doctor_mentioned",
                source_text=match.group(0).strip(),
                start=start,
                end=end,
                confidence=0.76 if category == "red_flag" else 0.72,
            ))
            break
    return out


def _compound_red_flags(blob: str) -> list[ClinicalMention]:
    out: list[ClinicalMention] = []

    def pos(term: str) -> bool:
        for match in _iter_term_matches(term, blob):
            start, end = _term_span(match)
            if not _is_locally_negated(blob, start, end):
                return True
        return False

    if any(pos(t) for t in CARDIAC_CHEST_TERMS):
        if any(pos(term) for term in CARDIAC_ASSOCIATED_TERMS):
            out.append(ClinicalMention(text="chest pain with red flags", canonical="chest_pain_red_flags", category="red_flag", confidence=0.9))
    if any(pos(term) for term in ["severe dyspnea", "dyspnee severe", "dyspnée sévère", "cyanosis", "cyanose"]):
        out.append(ClinicalMention(text="severe dyspnea", canonical="severe_dyspnea", category="red_flag", confidence=0.9))
    if any(pos(t) for t in ["brulures urinaires", "brûlures urinaires", "dysuria", "urinary"]):
        if any(pos(t) for t in ["flank pain", "douleur au flanc", "flanc droit", "flanc gauche"]):
            if any(pos(t) for t in ["fever", "fievre", "fièvre", "vomiting", "vomissements", "frissons", "rigors"]):
                out.append(ClinicalMention(text="urinary symptoms with flank pain/systemic features", canonical="possible_pyelonephritis_red_flag", category="red_flag", confidence=0.93))
    if any(pos(t) for t in ["pire mal de tete", "pire mal de tête", "worst headache", "thunderclap", "d un coup", "d'un coup"]):
        if any(pos(t) for t in ["main faible", "arm weakness", "deficit neurologique", "déficit neurologique", "vomiting", "vomissements", "vomi", "speech", "vision floue"]):
            out.append(ClinicalMention(text="sudden worst headache with neurologic/systemic features", canonical="thunderclap_headache_red_flag", category="red_flag", confidence=0.94))
    if any(pos(t) for t in ["joue gonflee", "joue gonflée", "dental swelling", "gonflement dentaire"]):
        if any(pos(t) for t in ["fever", "fievre", "fièvre", "trismus", "ouvrir la bouche", "difficulte a avaler", "difficulté à avaler"]):
            out.append(ClinicalMention(text="dental swelling with fever/trismus/swallowing difficulty", canonical="dental_deep_infection_red_flag", category="red_flag", confidence=0.92))
    if any(pos(t) for t in ["lip swelling", "gonflement des levres", "gonflement des lèvres", "urticaire"]):
        if any(pos(t) for t in ["wheezing", "sifflement", "throat tightness", "serre dans la gorge", "dyspnea", "dyspnee", "dyspnée"]):
            out.append(ClinicalMention(text="allergic reaction with airway/respiratory features", canonical="anaphylaxis_red_flag", category="red_flag", confidence=0.94))
    return out


def _extract_strength_near(blob: str, start: int, end: int, entity_terms: list[str] | None = None) -> str | None:
    """Attach strength to the nearest mention without crossing sentence/entity boundaries."""
    entity_terms = entity_terms or []

    def clipped_segment(left: int, right: int) -> str:
        segment = blob[left:right]
        # Stop at another medication/class alias between the mention and strength.
        return segment

    # Prefer forward strengths in the same sentence/segment: "BRUFEN 400 mg".
    forward_limit = min(len(blob), end + 60)
    for sep in [" . ", " ; ", " : ", " ? ", " ! ", " patient ", " medecin ", " doctor "]:
        idx = blob.find(sep, end, forward_limit)
        if idx != -1:
            forward_limit = min(forward_limit, idx)
    forward = clipped_segment(end, forward_limit)
    for match in re.finditer(r"\b(\d+(?:[\.,]\d+)?)\s*(mg|mcg|ug|g|ml|ui|iu|%)\b", forward):
        between = forward[:match.start()]
        if _contains_other_entity(between, entity_terms):
            break
        return f"{match.group(1).replace(',', '.')} {match.group(2)}"

    # Backward form: "500 mg de Doliprane", but do not cross boundaries or entities.
    backward_limit = max(0, start - 60)
    for sep in [" . ", " ; ", " : ", " ? ", " ! ", " patient ", " medecin ", " doctor "]:
        idx = blob.rfind(sep, backward_limit, start)
        if idx != -1:
            backward_limit = max(backward_limit, idx + len(sep))
    backward = clipped_segment(backward_limit, start)
    matches = list(re.finditer(r"\b(\d+(?:[\.,]\d+)?)\s*(mg|mcg|ug|g|ml|ui|iu|%)\b", backward))
    for match in reversed(matches):
        between = backward[match.end():]
        if _contains_other_entity(between, entity_terms):
            continue
        return f"{match.group(1).replace(',', '.')} {match.group(2)}"
    return None


def _infer_route_near(blob: str, start: int, end: int) -> str | None:
    window = blob[max(0, start - 85): min(len(blob), end + 160)]
    if any(term in window for term in ["inhalation", "inhalateur", "aerosol", "aérosol", "puff", "spray"]):
        return "inhalation"
    if any(term in window for term in ["oral", "per os", "comprime", "comprimé", "gelule", "gélule", "sirop", "sachet"]):
        return "oral"
    if any(term in window for term in ["iv", "im", "injectable", "injection"]):
        return "injectable"
    return None


def _consultation_text(consultation: ConsultationInput) -> str:
    return " ".join([consultation.doctor_notes or ""] + [f"{turn.speaker}: {turn.text}" for turn in consultation.transcript])


def _snapshot_text(snapshot: PatientSnapshot) -> str:
    parts: list[str] = []

    def add(value) -> None:
        text = str(value or "").strip()
        if not text:
            return
        normalized = normalize_text(text)
        if normalized and normalized not in {normalize_text(existing) for existing in parts}:
            parts.append(text)

    add(getattr(snapshot, "normalized_runtime_text", "") or "")
    consultation = getattr(snapshot, "consultation", None)
    if consultation is not None:
        add(_consultation_text(consultation))
    ctx = getattr(snapshot, "extracted_context", None)
    if isinstance(ctx, dict):
        for key, value in ctx.items():
            if key in {"missing_critical_information", "missing_info", "section_map", "current_medications", "symptom_mentions"}:
                continue
            if isinstance(value, str):
                add(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        for k in ["label", "span", "text"]:
                            add(item.get(k, ""))
                    else:
                        add(item)
    patient = getattr(snapshot, "patient", None)
    if patient is not None:
        current = getattr(patient, "current_medications", None)
        if isinstance(current, list):
            for item in current:
                add(item)
        allergies = getattr(patient, "known_allergies", None)
        if isinstance(allergies, list):
            for item in allergies:
                add(item)
    return " ".join(parts)


def _dedupe_orders(orders: list[MedicalOrder]) -> list[MedicalOrder]:
    seen = set()
    out = []
    for order in orders:
        # Preserve repeated clinically meaningful mentions, especially same DCI
        # with different strengths or different local spans. The extraction loop
        # adds each mention to both orders and medication_mentions, so exact
        # duplicate span/status rows are still collapsed.
        key = (
            str(order.medication or order.description).lower(),
            order.order_type,
            order.authorization_status,
            order.strength or "",
            order.route or "",
            order.start,
            order.end,
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(order)
    return out


def _dedupe_mentions(mentions):
    seen = set()
    out = []
    for mention in mentions:
        key = (
            getattr(mention, "canonical", ""),
            getattr(mention, "category", ""),
            getattr(mention, "status", ""),
            getattr(mention, "start", None),
            getattr(mention, "end", None),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(mention)
    return out


def _map_llm_status(value: str) -> str:
    value = normalize_search_text(value)
    mapping = {
        "authorized": "authorized",
        "doctor authorized": "authorized",
        "requested": "requested_not_authorized",
        "requested not authorized": "requested_not_authorized",
        "already taken": "already_taken",
        "current": "already_taken",
        "not current": "not_currently_taking",
        "not currently taking": "not_currently_taking",
        "not taking": "not_currently_taking",
        "avoid": "negated_or_avoid",
        "negated": "negated_or_avoid",
    }
    return mapping.get(value, "mentioned_not_authorized")


def _map_llm_source(value: str) -> str:
    value = normalize_search_text(value)
    if "doctor" in value or "medecin" in value or "médecin" in value:
        return "doctor_mentioned"
    if "not_current" in value or "not currently" in value or "not taking" in value:
        return "not_currently_taking"
    if "patient" in value:
        return "patient_request"
    return "unknown"


def _classify_case_type(medications, classes, symptoms, red_flags) -> str:
    if red_flags:
        return "emergency"
    blocked_statuses = {"already_taken", "not_currently_taking", "historical", "negated_or_avoid"}
    # Patch 5: plain medication mentions and patient-only requests are not
    # prescription targets. They remain in the audit, but only authorized
    # medications trigger the explicit-medicine workflow. Therapeutic classes
    # keep requested_not_authorized as a case signal because class requests are
    # resolved by the controlled planner and usually route to review.
    target_medications = [m for m in medications if m.authorization_status == "authorized"]
    target_classes = [c for c in classes if c.status not in blocked_statuses]
    if target_medications and target_classes:
        return "mixed"
    if target_medications:
        return "explicit_medicine"
    if target_classes:
        return "therapeutic_class_only"
    if symptoms:
        return "symptom_only"
    return "unclear"


def _required_patient_data(case_type: str, symptoms: list[ClinicalMention], risks: list[ClinicalMention]) -> list[str]:
    missing: list[str] = []
    if case_type in {"symptom_only", "therapeutic_class_only", "mixed"} and symptoms:
        missing.append("symptom duration")
        if not any(r.canonical == "allergy" for r in risks):
            missing.append("allergy history")
        if not any(r.canonical in {"pregnancy", "breastfeeding"} for r in risks):
            missing.append("pregnancy/breastfeeding status when applicable")
    return list(dict.fromkeys(missing))

def _required_safety_screens(medications, classes, symptoms, risks) -> list[str]:
    screens: list[str] = []
    meds = {
        normalize_search_text(getattr(m, "medication", None) or getattr(m, "description", ""))
        for m in medications or []
        if getattr(m, "authorization_status", None) not in {"not_currently_taking", "historical"}
    }
    class_ids = {_normalize_canonical_id(getattr(c, "canonical_class", None) or getattr(c, "canonical", "")) for c in classes or []}
    symptom_ids = {normalize_search_text(getattr(s, "canonical", "")) for s in symptoms or []}

    if "paracetamol" in meds or class_ids & {"analgesic_antipyretic"} or symptom_ids & {"fever", "headache", "pain"}:
        screens.extend(["hepatic_impairment", "overdose_risk", "duplicate_paracetamol"])
    if meds & {"ibuprofen", "diclofenac", "naproxen"} or "nsaid" in class_ids:
        screens.extend(["renal_impairment", "pregnancy", "gastric_ulcer_bleeding", "anticoagulant_interaction"])
    if "salbutamol" in meds or "saba" in class_ids or "wheezing" in symptom_ids:
        screens.extend(["severe_asthma_attack", "tachycardia", "cardiac_disease"])
    if any("amoxicillin" in med for med in meds) or "antibiotic" in class_ids:
        screens.extend(["allergy", "antibiotic_stewardship", "bacterial_infection_criteria"])
    return list(dict.fromkeys(x for x in screens if x))


def _forbidden_ingredients_from_mentions(medications) -> list[str]:
    forbidden: list[str] = []
    for mention in medications or []:
        if getattr(mention, "authorization_status", None) == "negated_or_avoid" and getattr(mention, "medication", None):
            forbidden.append(normalize_search_text(mention.medication))
    return list(dict.fromkeys(x for x in forbidden if x))


def _forbidden_classes_from_mentions(classes) -> list[str]:
    forbidden: list[str] = []
    for mention in classes or []:
        if getattr(mention, "status", None) == "negated_or_avoid" and getattr(mention, "canonical_class", None):
            forbidden.append(_normalize_canonical_id(mention.canonical_class))
    return list(dict.fromkeys(x for x in forbidden if x))


def _medication_conflicts(medications) -> list[str]:
    statuses_by_med: dict[str, set[str]] = {}
    for mention in medications or []:
        med = normalize_search_text(getattr(mention, "medication", None) or getattr(mention, "description", ""))
        status = getattr(mention, "authorization_status", "unknown")
        if med:
            statuses_by_med.setdefault(med, set()).add(status)
    conflicts: list[str] = []
    target_statuses = {"authorized", "requested_not_authorized", "mentioned_not_authorized"}
    for med, statuses in statuses_by_med.items():
        if "negated_or_avoid" in statuses and statuses & target_statuses:
            conflicts.append(f"medication_conflict:{med}:avoid_overrides_target")
        if "not_currently_taking" in statuses and "already_taken" in statuses:
            conflicts.append(f"medication_conflict:{med}:current_status_contradiction")
    return conflicts


def _therapeutic_class_conflicts(classes) -> list[str]:
    statuses_by_class: dict[str, set[str]] = {}
    for mention in classes or []:
        class_id = _normalize_canonical_id(getattr(mention, "canonical_class", None) or getattr(mention, "canonical", ""))
        status = getattr(mention, "status", "unknown")
        if class_id:
            statuses_by_class.setdefault(class_id, set()).add(status)
    conflicts: list[str] = []
    target_statuses = {"authorized", "requested_not_authorized", "mentioned_not_authorized"}
    for class_id, statuses in statuses_by_class.items():
        if "negated_or_avoid" in statuses and statuses & target_statuses:
            conflicts.append(f"therapeutic_class_conflict:{class_id}:avoid_overrides_target")
    return conflicts


def _term_span(match) -> tuple[int, int]:
    try:
        return match.start(2), match.end(2)
    except IndexError:
        return match.start(), match.end()


_CUE_GROUPS: dict[str, list[str]] = {
    # Avoid/negation cues are clinically dominant. Patch 4 expands allergy,
    # refusal and intolerance language while explicitly exempting negative
    # allergy statements such as "pas d allergie au X".
    "avoid": [
        "avoid", "do not", "dont give", "don t give", "not give", "not prescribe",
        "doesn t prescribe", "don t prescribe", "isn t recommended", "isn t authorized",
        "eviter", "ne pas", "ما نعطيش", "ما يتعطاش", "ما ياخذش", "ما يكتبش", "ممنوع", "تجنب", "a ne pas", "il ne faut pas",
        "deconseille", "deconseiller", "non recommande", "non recommandee", "pas recommande",
        "stop", "stopper", "stoppe",
        "stopped", "discontinue", "discontinued", "arreter", "arrete", "arret",
        "interrompre", "interrompt", "interrompu", "suspend", "suspendre",
        "suspendu", "retire", "retirer", "a arreter", "a stopper",
        "contre indique", "contre indiquee", "contre indication", "interdit",
        "refuse", "refus", "refuser", "rejette", "rejeter",
        "allergie", "allergique", "allergie a", "allergique a", "allergie au",
        "allergique au", "intolerance", "intolerant", "reaction", "reaction a",
        "effet indesirable grave",
    ],
    "already": [
        *ARABIZI_ALREADY_CUES,
        "already took", "already taking", "took", "taking", "current medication",
        "prend", "prends", "prenant", "prenait", "prendre", "a pris", "pris", "prise",
        "deja pris", "currently taking", "actuellement", "traitement par",
        "traitement actuel", "sous traitement", "actuellement sous", "sous", "ياخذ", "قاعد ياخذ", "يتداوى",
    ],
    "request": [
        *ARABIZI_REQUEST_CUES,
        "demande", "demander", "request", "requests", "requested", "ask", "asks", "wants",
        "souhaite", "veut", "voudrait", "je veux", "donnez", "give me", "can i take",
        "طلب", "يطلب", "طالب", "يريد", "نحب", "حاب", "يحب", "قال يحب",
    ],
    "authorized": [
        "prescribe", "prescribes", "prescribed", "prescribing", "prescrire", "prescrit", "prescris", "prescrits", "prescrite", "ordonnance",
        "ordonner", "proposer", "propose", "donner", "donne", "start", "commencer",
        "recommend", "recommends", "recommended", "recommande", "recommandes", "recommandee", "recommander", "conseille", "conseilles", "autorise", "autoriser",
        "valide", "valider", "ok pour", "accord pour", "je prescris", "i prescribe", "doctor prescribes", "طبيب وصف", "وصف", "كتب", "عطى", "ينصح",
    ],
    "historical": ["ancien", "ancienne", "history of", "historique", "previously", "avant", "ancien traitement"],
}
_CUE_PRIORITY = {"avoid": 0, "already": 1, "authorized": 2, "request": 3, "historical": 4}
_SPEAKER_BOUNDARY_RE = re.compile(r"(?<!\w)(patient|patiente|doctor|docteur|medecin|medecin|dr)(?!\w)")
_ALLERGY_CUES = {"allergie", "allergique", "allergie a", "allergique a", "allergie au", "allergique au", "intolerance", "intolerant", "reaction", "reaction a"}


def _best_local_cue(text: str, match_start: int, match_end: int, entity_terms: list[str]) -> str | None:
    segment_start, segment_end = _local_segment_bounds(text, match_start, match_end)
    candidates: list[tuple[int, int, str, str]] = []
    segment = text[segment_start:segment_end]
    rel_match_start = match_start - segment_start
    rel_match_end = match_end - segment_start

    if _is_not_current_medication_context(segment, rel_match_start, rel_match_end):
        return "not_current"

    # A local "aucun/no/pas de <entity>" means the entity is context-only and
    # must not be promoted to current/already-taken even if another unrelated
    # negative allergy phrase appears in the same segment.
    if _is_no_entity_context(segment, rel_match_start, rel_match_end):
        after_no_entity = segment[rel_match_end:min(len(segment), rel_match_end + 70)]
        before_no_entity = segment[max(0, rel_match_start - 70):rel_match_start]
        if re.search(r"\b(?:deja\s+pris|deja\s+prise|pris|prise|taken|already\s+taken|current|actuel)\b", after_no_entity) or re.search(r"\b(?:aucun(?:e)?|no)\s+(?:medicament|medicine|drug|traitement)\b", before_no_entity):
            return "not_current"
        return "avoid"
    negative_allergy_context = _is_negative_allergy_context(segment, rel_match_start, rel_match_end)
    drug_allergy_context = _is_drug_allergy_context(segment, rel_match_start, rel_match_end)
    if _is_negated_authorization_context(segment, rel_match_start, rel_match_end):
        return "avoid"
    if _is_discontinuation_context(segment, rel_match_start, rel_match_end):
        return "avoid"
    if _is_postposed_authorization_context(segment, rel_match_start, rel_match_end):
        return "authorized"

    for cue_type, cue_terms in _CUE_GROUPS.items():
        for cue in cue_terms:
            cue_norm = normalize_text(cue)
            if not cue_norm:
                continue
            pattern = r"(?<!\w)" + re.escape(cue_norm) + r"(?!\w)"
            for hit in re.finditer(pattern, segment):
                if hit.end() <= rel_match_start:
                    between = segment[hit.end():rel_match_start]
                    distance = rel_match_start - hit.end()
                elif hit.start() >= rel_match_end:
                    between = segment[rel_match_end:hit.start()]
                    distance = hit.start() - rel_match_end
                else:
                    between = ""
                    distance = 0
                if distance > 90:
                    continue
                if _contains_other_entity(between, entity_terms):
                    continue
                if cue_type == "avoid" and cue_norm in _ALLERGY_CUES and not drug_allergy_context:
                    # Do not treat indication phrases like "rhinite allergique"
                    # as allergy to the nearby drug/class. Allergy cues only
                    # count when syntactically attached to the entity.
                    continue
                if negative_allergy_context and cue_type == "avoid" and (cue_norm in _ALLERGY_CUES or cue_norm in {"pas de", "pas d"}):
                    continue
                candidates.append((distance, _CUE_PRIORITY.get(cue_type, 9), cue_type, cue_norm))
    if not candidates:
        return None
    # Safety rule: explicit negation/avoid wins over permissive verbs in the
    # same local segment, regardless of distance. This prevents "ne pas donner X"
    # from being interpreted as authorized merely because "donner" is closer.
    avoid_candidates = [item for item in candidates if item[2] == "avoid"]
    if avoid_candidates:
        avoid_candidates.sort()
        return "avoid"
    candidates.sort()
    return candidates[0][2]


def _is_postposed_authorization_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    after = segment[rel_match_end:min(len(segment), rel_match_end + 120)]
    # Handles list-style prescriptions: "Doliprane 500 mg et Brufen 400 mg prescrits".
    # We allow another entity between the current entity and the final plural verb,
    # but stay inside the local punctuation/speaker segment and let avoid/negation
    # checks above dominate first.
    post_auth = r"(?:prescrit|prescrits|prescrite|prescrites|recommande|recommandes|recommandee|recommandees|propose|proposes|autorise|autorises|valide|valides|donne|donnes)"
    if re.search(r"\b(?:refuse|evite|eviter|ne\s+pas|pas\s+de|deconseille|non\s+recommande)\b", after):
        return False
    return re.search(rf"\b{post_auth}\b", after) is not None


def _has_medication_context(blob: str, start: int, end: int) -> bool:
    window = blob[max(0, start - 70):min(len(blob), end + 70)]
    if re.search(r"\b\d+(?:[\.,]\d+)?\s*(mg|mcg|ug|g|ml|ui|iu|%)\b", window):
        return True
    return any(_term_in_blob(term, window) for term in [
        "prescrit", "prescrits", "ordonnance", "traitement", "comprime", "comprimé",
        "gelule", "gélule", "sirop", "ampoule", "anemie", "anémie", "carence",
    ])


def _is_negated_authorization_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    """Detect negated prescribing/recommending verbs near the entity.

    These constructions must dominate positive authorization cues such as
    "prescrit" or "recommande". The text is already normalized, so accented
    French forms are ASCII here.
    """
    before = segment[max(0, rel_match_start - 120):rel_match_start]
    after = segment[rel_match_end:min(len(segment), rel_match_end + 80)]
    auth_verbs = (
        "prescrit|prescrire|prescris|recommande|recommander|conseille|conseiller|"
        "donne|donner|propose|proposer|valide|valider|autorise|autoriser|"
        "ordonne|ordonner|start|commencer|recommend|prescribe|prescribes|give|gives|"
        "authorize|authorizes|validate|validates|advise|advises"
    )
    before_patterns = [
        rf"\bne\s+(?:\w+\s+){{0,3}}(?:{auth_verbs})\s+(?:pas|plus|jamais)\b",
        rf"\bn\s+(?:\w+\s+){{0,3}}(?:{auth_verbs})\s+(?:pas|plus|jamais)\b",
        rf"\b(?:il\s+)?ne\s+faut\s+(?:surtout\s+)?pas\s+(?:\w+\s+){{0,2}}(?:{auth_verbs})\b",
        rf"\b(?:il\s+)?ne\s+doit\s+(?:surtout\s+)?pas\s+(?:\w+\s+){{0,2}}(?:{auth_verbs})\b",
        rf"\ba\s+ne\s+pas\s+(?:\w+\s+){{0,2}}(?:{auth_verbs})\b",
        rf"\b(?:not|never)\s+(?:\w+\s+){{0,2}}(?:{auth_verbs})\b",
        rf"\b(?:does\s+not|do\s+not|dont|don\s+t|doesn\s+t)\s+(?:\w+\s+){{0,2}}(?:{auth_verbs})\b",
        rf"\b(?:deconseille|deconseiller|non\s+recommande|non\s+recommandee|pas\s+recommande|pas\s+recommandee)\b",
        rf"\b(?:is\s+not|isn\s+t|are\s+not|aren\s+t)\s+(?:recommended|authorized|indicated)\b",
    ]
    after_patterns = [
        rf"\b(?:pas|plus|jamais)\s+(?:recommande|recommandee|indique|indiquee|autorise)\b",
        rf"\bnot\s+(?:recommended|authorized|indicated)\b",
        rf"\b(?:non\s+recommande|non\s+recommandee|pas\s+recommande|pas\s+recommandee)\b",
    ]
    return any(re.search(p, before) for p in before_patterns) or any(re.search(p, after) for p in after_patterns)


def _is_discontinuation_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    """Detect explicit stop/discontinue orders near the entity."""
    before = segment[max(0, rel_match_start - 120):rel_match_start]
    after = segment[rel_match_end:min(len(segment), rel_match_end + 80)]
    stop_verbs = (
        "arrete|arreter|arret|stoppe|stopper|stop|interrompt|interrompre|"
        "interrompu|suspend|suspendre|suspendu|retire|retirer|discontinue|"
        "discontinued|stop|stops|stoppe"
    )
    before_patterns = [
        rf"\b(?:{stop_verbs})\b",
        rf"\ba\s+(?:arreter|stopper|interrompre|suspendre|retirer)\b",
    ]
    after_patterns = [
        rf"\b(?:a\s+arreter|a\s+stopper|a\s+interrompre|a\s+suspendre)\b",
        rf"\b(?:stopped|discontinued|suspended|withdrawn)\b",
    ]
    return any(re.search(p, before) for p in before_patterns) or any(re.search(p, after) for p in after_patterns)


def _is_not_current_medication_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    before = segment[max(0, rel_match_start - 110):rel_match_start]
    after = segment[rel_match_end:min(len(segment), rel_match_end + 80)]
    before_patterns = [
        r"\bne\s+(?:\w+\s+){0,2}(?:prend|prends|prenait|prenant|prendre)\s+(?:pas|plus)\b",
        r"\bn\s+(?:\w+\s+){0,2}(?:prend|prends|prenait|prenant|prendre)\s+(?:pas|plus)\b",
        r"\bpas\s+(?:actuellement\s+)?(?:sous|sous traitement|de traitement par)\b",
        r"\bn\s+est\s+(?:pas|plus)\s+(?:sous|sous traitement)\b",
        r"\bnot\s+(?:currently\s+)?(?:taking|on|using)\b",
        r"\bdoes\s+not\s+(?:take|use)\b",
        r"\bno\s+longer\s+(?:takes|taking|on|uses)\b",
        r"\baucun(?:e)?\s+(?:\w+\s+){0,3}(?:pris|prise|medicament|medicament|traitement)\b",
        r"\b(?:n|ne)\s+(?:\w+\s+){0,5}pris\s+aucun(?:e)?\b",
        r"ما\s+ياخذش",
        r"موش\s+ياخذ",
    ]
    after_patterns = [
        r"\bne\s+le\s+prend\s+(?:pas|plus)\b",
        r"\bne\s+la\s+prend\s+(?:pas|plus)\b",
        r"\bnot\s+(?:currently\s+)?taking\b",
    ]
    return any(re.search(p, before) for p in before_patterns) or any(re.search(p, after) for p in after_patterns)


def _is_no_entity_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    """Detect short English/French no/avoid markers immediately attached to the entity.

    This intentionally stays narrow so unrelated text like "no fever, give X"
    does not forbid X. Allergy-negation is handled before this function.
    """
    before = segment[max(0, rel_match_start - 45):rel_match_start]
    after = segment[rel_match_end:min(len(segment), rel_match_end + 45)]
    before_patterns = [
        r"\bno\s*$",
        r"\bno\s+(?:medication|medicine|drug|treatment)\s*$",
        r"\bpas\s+de\s*$",
        r"\bpas\s+d\s*$",
        r"\baucun(?:e)?\s*$",
    ]
    after_patterns = [
        r"^\s*(?:not\s+recommended|not\s+authorized|non\s+recommande|non\s+recommandee)\b",
    ]
    return any(re.search(p, before) for p in before_patterns) or any(re.search(p, after) for p in after_patterns)


def _is_negative_allergy_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    window = segment[max(0, rel_match_start - 90):min(len(segment), rel_match_end + 40)]
    patterns = [
        r"\bpas\s+d\s+allergie\b",
        r"\bpas\s+de\s+allergie\b",
        r"\bpas\s+d\s+allergy\b",
        r"\bpas\s+de\s+allergy\b",
        r"\baucune\s+allergie\b",
        r"\babsence\s+d?\s*allergie\b",
        r"\babsence\s+d?\s*allergy\b",
        r"\bpas\s+d\s+antecedent\s+allergique\b",
        r"\bras\s+allergie\b",
        r"\bnkda\b",
        r"\bnie\s+allergie\b",
        r"\bno\s+allergy\b",
        r"\bnot\s+allergic\b",
    ]
    return any(re.search(p, window) for p in patterns)


def _is_drug_allergy_context(segment: str, rel_match_start: int, rel_match_end: int) -> bool:
    before = segment[max(0, rel_match_start - 80):rel_match_start]
    after = segment[rel_match_end:min(len(segment), rel_match_end + 50)]
    # Positive attachment to the entity: allergie/allergique/intolerance/reaction
    # immediately before the drug, with optional prepositions.
    before_patterns = [
        r"\b(?:allergie|allergique|intolerance|intolerant|reaction)\s+(?:a|au|aux|de|d)?\s*$",
        r"\b(?:allergy|allergic|intolerance|reaction)\s+(?:to)?\s*$",
    ]
    after_patterns = [
        r"^\s*(?:allergy|allergie|intolerance)\b",
    ]
    # Explicit indication phrases are not drug allergies.
    indication_patterns = [
        r"\b(?:rhinite|conjonctivite|asthme|urticaire|dermatite|reaction|terrain)\s+allergique\b",
        r"\ballergic\s+(?:rhinitis|conjunctivitis|asthma|dermatitis)\b",
    ]
    window = segment[max(0, rel_match_start - 90):min(len(segment), rel_match_end + 90)]
    if any(re.search(p, window) for p in indication_patterns):
        return False
    return any(re.search(p, before) for p in before_patterns) or any(re.search(p, after) for p in after_patterns)


def _local_segment_bounds(text: str, match_start: int, match_end: int) -> tuple[int, int]:
    left_limit = max(0, match_start - 140)
    right_limit = min(len(text), match_end + 140)
    segment_start = left_limit
    segment_end = right_limit
    for hit in _SPEAKER_BOUNDARY_RE.finditer(text, left_limit, match_start):
        segment_start = hit.start()
    next_hit = _SPEAKER_BOUNDARY_RE.search(text, match_end, right_limit)
    if next_hit:
        segment_end = next_hit.start()
    return segment_start, segment_end


def _normalize_canonical_id(value: str | None) -> str:
    text = normalize_search_text(str(value or "").replace("_", " "))
    return text.replace(" ", "_")


def _contains_other_entity(segment: str, entity_terms: list[str]) -> bool:
    if not segment.strip():
        return False
    for term in entity_terms:
        if term and re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", segment):
            return True
    return False

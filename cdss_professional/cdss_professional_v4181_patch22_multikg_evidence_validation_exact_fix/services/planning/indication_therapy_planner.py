from __future__ import annotations

import csv
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_RUNTIME_ROOT = Path(os.environ.get("CDSS_RUNTIME_DATA_ROOT") or ROOT_DIR / "data" / "runtime")
DEFAULT_MAP_PATH = Path(os.environ.get("INDICATION_THERAPY_MAP_PATH") or DEFAULT_RUNTIME_ROOT / "tn_indication_therapy_map.csv")
DEFAULT_CLASS_MAP_PATH = Path(os.environ.get("CLASS_TO_DCI_MAP_PATH") or DEFAULT_RUNTIME_ROOT / "tn_class_to_dci_map.csv")
DEFAULT_DCI_SAFETY_PATH = Path(os.environ.get("DCI_SAFETY_PROFILES_PATH") or DEFAULT_RUNTIME_ROOT / "tn_dci_safety_profiles.csv")


@dataclass
class TherapyCandidatePlan:
    clinical_problems: list[str] = field(default_factory=list)
    strategy: list[str] = field(default_factory=list)
    therapeutic_classes: list[str] = field(default_factory=list)
    candidate_ingredients: list[str] = field(default_factory=list)
    avoid_classes: list[str] = field(default_factory=list)
    forbidden_ingredients: list[str] = field(default_factory=list)
    # Backward-compatible legacy union of required_patient_data + required_safety_screens.
    required_missing_data: list[str] = field(default_factory=list)
    required_patient_data: list[str] = field(default_factory=list)
    required_safety_screens: list[str] = field(default_factory=list)
    target_indications: list[str] = field(default_factory=list)
    evidence_queries: list[str] = field(default_factory=list)
    route_recommendation: str | None = None
    route_if_uncertain: str | None = None
    localization_required: bool = False
    confidence: str = "low"
    planner_notes: list[str] = field(default_factory=list)
    source: str = "indication_therapy_planner"

    def as_dict(self) -> dict[str, Any]:
        return {
            "clinical_problems": self.clinical_problems,
            "strategy": self.strategy,
            "therapeutic_classes": self.therapeutic_classes,
            "candidate_ingredients": self.candidate_ingredients,
            "avoid_classes": self.avoid_classes,
            "forbidden_ingredients": self.forbidden_ingredients,
            "required_missing_data": self.required_missing_data,
            "required_patient_data": self.required_patient_data,
            "required_safety_screens": self.required_safety_screens,
            "target_indications": self.target_indications,
            "evidence_queries": self.evidence_queries,
            "route_recommendation": self.route_recommendation,
            "route_if_uncertain": self.route_if_uncertain,
            "localization_required": self.localization_required,
            "confidence": self.confidence,
            "planner_notes": self.planner_notes,
            "source": self.source,
        }




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


def _term_present_without_local_negation(text: str, term: str) -> bool:
    """Return True only for positive clinical mentions.

    Patch16 uses local, question-aware negation. A later unrelated "non" no
    longer suppresses an earlier positive symptom, but a screened entity such
    as "douleur thoracique ? Non" remains negative.
    """
    norm_text = normalize_search_text(text)
    norm_term = normalize_search_text(term)
    if not norm_text or not norm_term:
        return False
    pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(norm_term) + r"(?![a-z0-9\u0600-\u06FF])"
    for match in re.finditer(pattern, norm_text):
        before = norm_text[max(0, match.start() - 95): match.start()]
        after = norm_text[match.end(): min(len(norm_text), match.end() + 170)]
        if re.search(r"(?:^|\b)(?:pas\s+de|pas\s+d|aucun|aucune|sans|nie|non|no|denies|negative\s+for|absence\s+de|absence\s+d|without|no\s+evidence\s+of)(?:\s+\w+){0,1}\s*$", before):
            continue
        if _negative_reply_after_term(after):
            continue
        return True
    return False

class IndicationTherapyPlanner:
    """Controlled indication/class-to-DCI candidate planner.

    This is deliberately not an LLM. It consumes the structured extraction layer
    and an auditable CSV map, then outputs allowed candidate ingredients and
    safety constraints. It supports the three cases:
    - explicit medicine: keep only authorized medicine targets; patient requests and plain mentions require review or independent symptom/class support;
    - therapeutic class only: map class to conservative DCI candidates;
    - symptom only: map symptoms/conditions to indication rows.
    """

    CLASS_TO_DCI: dict[str, dict[str, Any]] = {
        "analgesic_antipyretic": {
            "candidate_dci": ["paracetamol"],
            "strategy": "symptomatic",
            "indication": "mild pain or fever",
            "avoid_classes": ["nsaid_if_renal_gastric_pregnancy_or_anticoagulant_risk"],
            "evidence_query": "paracetamol analgesic antipyretic dosage warning contraindication",
            "required_safety_screens": ["hepatic_impairment", "overdose_risk", "duplicate_paracetamol"],
            "localization_required": True,
        },
        "saba": {
            "candidate_dci": ["salbutamol"],
            "strategy": "rescue_bronchodilator",
            "indication": "acute wheezing or asthma rescue",
            "avoid_classes": ["long_acting_bronchodilator_for_rescue"],
            "evidence_query": "salbutamol inhalation dosage warning asthma",
            "required_safety_screens": ["severe_asthma_attack", "tachycardia", "cardiac_disease"],
            "localization_required": True,
        },
        "nsaid": {
            "candidate_dci": ["ibuprofen"],
            "strategy": "review_if_risk",
            "indication": "inflammatory pain",
            "avoid_classes": ["nsaid_if_renal_gastric_pregnancy_or_anticoagulant_risk"],
            "evidence_query": "ibuprofen NSAID contraindication renal pregnancy anticoagulant warning",
            "required_safety_screens": ["renal_impairment", "pregnancy", "gastric_ulcer_bleeding", "anticoagulant_interaction"],
            "localization_required": True,
            "route_if_uncertain": "review",
        },
        "antibiotic": {
            "candidate_dci": [],
            "strategy": "antibiotic_stewardship",
            "indication": "antibiotic class requires diagnosis and stewardship review",
            "avoid_classes": ["automatic_antibiotic_selection"],
            "evidence_query": "antibiotic stewardship indication review",
            "required_safety_screens": ["allergy", "antibiotic_stewardship", "bacterial_infection_criteria"],
            "localization_required": False,
            "route_if_uncertain": "review",
        },
        "no_antibiotic": {
            "candidate_dci": [],
            "strategy": "symptomatic_no_antibiotic",
            "indication": "viral syndrome symptomatic treatment only",
            "avoid_classes": ["antibiotic"],
            "forbidden_ingredients": ["amoxicillin", "amoxicillin + clavulanic acid"],
            "evidence_query": "viral upper respiratory infection no antibiotic symptomatic treatment",
            "localization_required": False,
            "route_if_uncertain": "review",
        },
    }

    def __init__(self, map_path: Path | None = None, class_map_path: Path | None = None, dci_safety_path: Path | None = None) -> None:
        self.map_path = map_path or DEFAULT_MAP_PATH
        self.class_map_path = class_map_path or DEFAULT_CLASS_MAP_PATH
        self.dci_safety_path = dci_safety_path or DEFAULT_DCI_SAFETY_PATH
        self.rows = self._load_rows(self.map_path)
        self.class_policies = self._load_class_policies(self.class_map_path)
        self.dci_safety_profiles = self._load_dci_safety_profiles(self.dci_safety_path)

    def plan(self, snapshot: PatientSnapshot, medical_orders=None, *, blob: str = "") -> TherapyCandidatePlan:
        text = normalize_search_text(" ".join([blob, self._snapshot_text(snapshot), self._medical_orders_text(medical_orders)]))
        result = TherapyCandidatePlan()
        for ingredient in self._forbidden_medications(medical_orders):
            _add(result.forbidden_ingredients, ingredient)
            result.planner_notes.append(f"Ingredient {ingredient} is forbidden by negated/avoid mention in structured extraction.")
        for class_id in self._forbidden_classes(medical_orders):
            _add(result.avoid_classes, class_id)
            result.planner_notes.append(f"Therapeutic class {class_id} is avoided by negated/avoid mention in structured extraction.")
            if class_id == "antibiotic":
                _add(result.forbidden_ingredients, "amoxicillin")
                _add(result.forbidden_ingredients, "amoxicillin + clavulanic acid")
            if class_id == "nsaid":
                for dci in ["ibuprofen", "diclofenac", "naproxen"]:
                    _add(result.forbidden_ingredients, dci)
        for item in _get_value(medical_orders, "required_patient_data", []) or []:
            _add(result.required_patient_data, str(item))
        for item in _get_value(medical_orders, "required_safety_screens", []) or []:
            _add(result.required_safety_screens, str(item))

        # Case 1: explicit medicine mention. This keeps DCI choice anchored to
        # the consultation rather than inferred by the LLM.
        explicit_meds = self._target_medications(medical_orders)
        for med in explicit_meds:
            _add(result.candidate_ingredients, med)
            self._apply_dci_safety_profile(result, med)
        if explicit_meds:
            _add(result.strategy, "explicit_medicine_safety_validation")
            _add(result.clinical_problems, "explicit_medicine_mentioned")
            result.localization_required = True
            result.confidence = "high"
            result.planner_notes.append("Explicit medication mention consumed from structured extraction; planner will not invent a replacement DCI.")

        # Case 2: class-only mention. Candidates come from the controlled class map.
        class_mentions = self._target_classes(medical_orders)
        for class_id in class_mentions:
            self._apply_class_policy(result, class_id)

        # Case 3: symptom-only or additional symptom context. Use indication map.
        # If a clinician-authorized explicit medicine is already present, symptom
        # rows may add indications/safety constraints, but must not silently add a
        # second default drug for the same symptom (e.g. Brufen + pain must not
        # auto-add paracetamol). Emergency/no-antibiotic rows still apply.
        explicit_target_set = set(explicit_meds)
        for row in self.rows:
            if self._row_matches(row, text):
                row_candidate = canonicalize_dci(row.get("candidate_dci", ""))
                if explicit_target_set and row_candidate and row_candidate.lower() != "none" and row_candidate not in explicit_target_set:
                    row = dict(row)
                    row["candidate_dci"] = "none"
                    result.planner_notes.append(
                        f"Skipped symptom-default candidate {row_candidate} because clinician-authorized explicit medicine target exists."
                    )
                self._apply_indication_row(result, row)

        self._apply_contextual_safety(result, snapshot, text, medical_orders=medical_orders)
        self._finalize_result(result)

        if not result.candidate_ingredients and result.therapeutic_classes:
            if result.route_recommendation is None and result.route_if_uncertain in {"review", "emergency", "non_pharma"}:
                result.route_recommendation = result.route_if_uncertain
            result.route_recommendation = result.route_recommendation or "review"
            result.confidence = "medium" if result.confidence == "low" else result.confidence
        elif result.candidate_ingredients and result.confidence == "low":
            result.confidence = "medium"
        return result

    def _apply_class_policy(self, result: TherapyCandidatePlan, class_id: str) -> None:
        policy = self.class_policies.get(class_id) or self.CLASS_TO_DCI.get(class_id)
        _add(result.therapeutic_classes, class_id)
        if not policy:
            _add(result.required_patient_data, f"controlled candidate policy for class:{class_id}")
            result.route_if_uncertain = result.route_if_uncertain or "review"
            result.planner_notes.append(f"Unknown therapeutic class {class_id}; candidate DCI selection requires review.")
            return
        for dci in policy.get("candidate_dci", []):
            _add(result.candidate_ingredients, dci)
            self._apply_dci_safety_profile(result, dci)
        for item in policy.get("avoid_classes", []):
            _add(result.avoid_classes, item)
        for item in policy.get("forbidden_ingredients", []):
            _add(result.forbidden_ingredients, item)
        for item in policy.get("required_safety_screens", []):
            _add(result.required_safety_screens, item)
        _add(result.strategy, str(policy.get("strategy") or "planner_required"))
        _add(result.target_indications, str(policy.get("indication") or class_id))
        _add(result.evidence_queries, str(policy.get("evidence_query") or ""))
        result.localization_required = result.localization_required or bool(policy.get("localization_required"))
        if policy.get("route_if_uncertain"):
            result.route_if_uncertain = str(policy["route_if_uncertain"])
        authority = _normalize_canonical_id(policy.get("authority_level") or "")
        strategy = _normalize_canonical_id(policy.get("strategy") or "")
        if class_id in {"antibiotic", "nsaid"} or authority in {"review_required"} or strategy in {"review_required", "chronic_med_review"}:
            result.route_recommendation = result.route_recommendation or "review"
        result.confidence = "medium" if result.confidence == "low" else result.confidence
        result.planner_notes.append(f"Therapeutic class {class_id} mapped through controlled class policy.")

    def _apply_indication_row(self, result: TherapyCandidatePlan, row: dict[str, str]) -> None:
        indication_id = row.get("indication_id", "").strip()
        if not indication_id:
            return
        _add(result.clinical_problems, indication_id)
        _add(result.strategy, row.get("strategy", ""))
        _add(result.therapeutic_classes, row.get("therapeutic_class", ""))
        candidate = canonicalize_dci(row.get("candidate_dci", "").strip())
        if candidate and candidate.lower() != "none":
            _add(result.candidate_ingredients, candidate)
            self._apply_dci_safety_profile(result, candidate)
        if row.get("therapeutic_class") == "no_antibiotic":
            _add(result.forbidden_ingredients, "amoxicillin")
            _add(result.forbidden_ingredients, "amoxicillin + clavulanic acid")
            _add(result.avoid_classes, "antibiotic")
        screen = row.get("contraindication_screen", "")
        for item in _split_safety_screens(screen):
            if item and item not in {"none"}:
                _add(result.required_safety_screens, item)
        _add(result.target_indications, indication_id.replace("_", " "))
        _add(result.evidence_queries, row.get("evidence_query_template", ""))
        result.localization_required = result.localization_required or _to_bool(row.get("localization_required"))
        route_uncertain = row.get("route_if_uncertain", "").strip()
        if route_uncertain in {"review", "emergency", "non_pharma"}:
            result.route_if_uncertain = route_uncertain
        strategy = _normalize_canonical_id(row.get("strategy") or "")
        authority = _normalize_canonical_id(row.get("authority_level") or "")
        if row.get("strategy") == "emergency":
            result.route_recommendation = "emergency"
        elif strategy in {"review_required", "chronic_med_review"} or authority == "review_required":
            result.route_recommendation = result.route_recommendation or "review"
        elif strategy in {"non_pharma_or_supportive"} and row.get("route_if_uncertain", "").strip() == "non_pharma" and not candidate:
            result.route_recommendation = result.route_recommendation or "non_pharma"
        if result.confidence == "low":
            result.confidence = "medium"
        result.planner_notes.append(f"Indication row matched: {indication_id}.")

    def _apply_contextual_safety(self, result: TherapyCandidatePlan, snapshot: PatientSnapshot, text: str, medical_orders=None) -> None:
        if _has_any_positive(text, ["severe dyspnea", "dyspnee severe", "dyspnée sévère", "cyanosis", "cyanose", "silent chest"]):
            result.route_recommendation = "emergency"
            result.planner_notes.append("Pre-treatment red flag detected; no outpatient medication should be generated automatically.")
        if _pyelonephritis_or_systemic_uti(text):
            result.route_recommendation = "emergency"
            result.planner_notes.append("Urinary symptoms with flank pain and systemic features detected; urgent pyelonephritis/sepsis assessment required.")
        if _thunderclap_or_neuro_headache(text):
            result.route_recommendation = "emergency"
            result.planner_notes.append("Sudden/worst headache with neurologic/systemic features detected; urgent neurologic assessment required.")
        if _dental_deep_infection(text):
            result.route_recommendation = "emergency"
            result.planner_notes.append("Dental/facial swelling with fever/trismus/swallowing difficulty detected; urgent dental/maxillofacial assessment required.")
        if _anaphylaxis_airway_features(text):
            result.route_recommendation = "emergency"
            result.planner_notes.append("Allergic reaction with airway/respiratory features detected; urgent assessment required.")
        if _has_any_positive(text, ["renal impairment", "kidney disease", "insuffisance renale", "insuffisance rénale"]):
            _add(result.avoid_classes, "nsaid")
        if _structured_current_anticoagulant(snapshot, medical_orders):
            _add(result.avoid_classes, "nsaid")
            if _has_any(text, ["nsaid", "ains", "anti inflammatoire", "ibuprofen", "ibuprofene", "diclofenac", "naproxen"]):
                for dci in ["ibuprofen", "diclofenac", "naproxen"]:
                    _add(result.forbidden_ingredients, dci)
                result.route_recommendation = result.route_recommendation or "review"
                result.planner_notes.append("NSAID class/ingredient mentioned with anticoagulant context; NSAID candidates are forbidden pending clinician review.")
        if _has_any_positive(text, ["hepatic impairment", "insuffisance hepatique", "insuffisance hépatique", "cirrhosis", "cirrhose"]):
            _add(result.required_safety_screens, "hepatic_impairment")
        if getattr(snapshot.patient, "age_years", None) is not None and snapshot.patient.age_years < 15:
            _add(result.required_patient_data, "weight")
        if "ibuprofen" in result.candidate_ingredients and "nsaid" in result.avoid_classes:
            result.route_recommendation = result.route_recommendation or "review"
            result.planner_notes.append("NSAID candidate requires review because renal/anticoagulant/pregnancy risk screen is positive or incomplete.")

    def _row_matches(self, row: dict[str, str], text: str) -> bool:
        symptom_match = _any_terms(text, row.get("symptom_terms", ""))
        condition_terms = _split_terms(row.get("condition_terms", ""))
        condition_match = not condition_terms or condition_terms == ["none"] or any(_term_present_without_local_negation(text, term) for term in condition_terms)
        red_flag_terms = _split_terms(row.get("red_flag_terms", ""))
        red_flag_match = bool(red_flag_terms and red_flag_terms != ["none"] and any(_term_present_without_local_negation(text, term) for term in red_flag_terms))
        if row.get("strategy") == "emergency":
            return symptom_match and (red_flag_match or not red_flag_terms or red_flag_terms == ["none"])
        return symptom_match and condition_match and not red_flag_match

    def _finalize_result(self, result: TherapyCandidatePlan) -> None:
        result.forbidden_ingredients = list(dict.fromkeys(x for x in result.forbidden_ingredients if x and x.lower() != "none"))
        candidates_before = [x for x in result.candidate_ingredients if x and x.lower() != "none"]
        result.candidate_ingredients = list(dict.fromkeys(x for x in candidates_before if x not in result.forbidden_ingredients))
        if candidates_before and not result.candidate_ingredients:
            result.route_recommendation = result.route_recommendation or "review"
            result.localization_required = False
            result.planner_notes.append("All candidate ingredients were removed because they are forbidden by extraction or policy.")
        removed = [x for x in candidates_before if x in result.forbidden_ingredients]
        for ingredient in removed:
            result.planner_notes.append(f"Removed candidate {ingredient} because it is also in forbidden_ingredients.")
        result.therapeutic_classes = list(dict.fromkeys(x for x in result.therapeutic_classes if x and x.lower() != "none"))
        result.target_indications = list(dict.fromkeys(result.target_indications))
        result.clinical_problems = list(dict.fromkeys(result.clinical_problems))
        result.strategy = list(dict.fromkeys(result.strategy))
        result.avoid_classes = list(dict.fromkeys(result.avoid_classes))
        result.required_patient_data = list(dict.fromkeys(x for x in result.required_patient_data if x))
        result.required_safety_screens = list(dict.fromkeys(x for x in result.required_safety_screens if x))
        result.required_missing_data = list(dict.fromkeys([*result.required_patient_data, *result.required_safety_screens]))
        result.evidence_queries = list(dict.fromkeys(q for q in result.evidence_queries if q.strip()))

    def _forbidden_medications(self, medical_orders) -> list[str]:
        out: list[str] = []
        for mention in _get_value(medical_orders, "medication_mentions", []) or []:
            status = _get_value(mention, "authorization_status", "unknown")
            med = _get_value(mention, "medication", None)
            if med and status == "negated_or_avoid":
                _add(out, canonicalize_dci(str(med)))
        for med in _get_value(medical_orders, "forbidden_ingredients", []) or []:
            _add(out, canonicalize_dci(str(med)))
        return out

    def _target_medications(self, medical_orders) -> list[str]:
        out: list[str] = []
        mentions = _get_value(medical_orders, "medication_mentions", [])
        forbidden = set(self._forbidden_medications(medical_orders))

        # Patch 5 policy: a plain mention or patient request is not a safe
        # prescription target by itself. Only a clinician-authorized medication
        # can anchor the explicit-medicine workflow. Requested medicines may
        # still be surfaced as review context by the extraction audit, and
        # symptom/class planning can independently propose a safe candidate.
        for mention in mentions or []:
            status = _get_value(mention, "authorization_status", "unknown")
            med = canonicalize_dci(str(_get_value(mention, "medication", None) or ""))
            if med and status == "authorized" and med not in forbidden:
                _add(out, med)
        for med in _get_value(medical_orders, "authorized_medications", []) or []:
            normalized = canonicalize_dci(str(med))
            if normalized and normalized not in forbidden:
                _add(out, normalized)
        return out

    def _target_classes(self, medical_orders) -> list[str]:
        out: list[str] = []
        mentions = _get_value(medical_orders, "therapeutic_class_mentions", [])
        forbidden_classes = set(self._forbidden_classes(medical_orders))

        # Patch 6 policy: therapeutic classes follow the same safety rule as
        # medications. A class becomes an automatic DCI-selection anchor only
        # when it is clinician-authorized. Plain mentions and patient requests
        # are review context, not prescription targets. Symptom rows may still
        # independently propose a controlled candidate when clinically supported.
        for mention in mentions or []:
            status = _get_value(mention, "status", "unknown")
            class_id = _normalize_canonical_id(_get_value(mention, "canonical_class", None) or _get_value(mention, "canonical", None))
            if class_id and status == "authorized" and class_id not in forbidden_classes:
                _add(out, class_id)
        for class_id in _get_value(medical_orders, "authorized_therapeutic_classes", []) or []:
            normalized = _normalize_canonical_id(class_id)
            if normalized and normalized not in forbidden_classes:
                _add(out, normalized)
        return out

    def _forbidden_classes(self, medical_orders) -> list[str]:
        out: list[str] = []
        mentions = _get_value(medical_orders, "therapeutic_class_mentions", [])
        for mention in mentions or []:
            status = _get_value(mention, "status", "unknown")
            class_id = _normalize_canonical_id(_get_value(mention, "canonical_class", None) or _get_value(mention, "canonical", None))
            if class_id and status == "negated_or_avoid":
                _add(out, class_id)
        return out

    def _apply_dci_safety_profile(self, result: TherapyCandidatePlan, dci: str) -> None:
        profile = self.dci_safety_profiles.get(canonicalize_dci(dci))
        if not profile:
            return
        for item in profile.get("contraindication_screens", []):
            _add(result.required_safety_screens, item)
        for item in profile.get("requires_patient_data", []):
            _add(result.required_patient_data, item)
        if profile.get("evidence_query_template"):
            _add(result.evidence_queries, profile.get("evidence_query_template"))
        if profile.get("authority_level") == "review_required":
            result.route_recommendation = result.route_recommendation or "review"

    def _load_class_policies(self, path: Path) -> dict[str, dict[str, Any]]:
        policies: dict[str, dict[str, Any]] = {}
        if not path.exists():
            return {}
        rows = self._load_rows(path)
        rows.sort(key=lambda row: int(row.get("priority") or 999))
        for row in rows:
            class_id = _normalize_canonical_id(row.get("therapeutic_class") or "")
            if not class_id:
                continue
            policy = policies.setdefault(class_id, {
                "candidate_dci": [],
                "strategy": row.get("strategy") or "planner_required",
                "indication": row.get("indication") or class_id,
                "avoid_classes": [],
                "forbidden_ingredients": [],
                "required_safety_screens": [],
                "required_patient_data": [],
                "evidence_query": row.get("evidence_query_template") or "",
                "route_if_uncertain": row.get("route_if_uncertain") or "",
                "authority_level": row.get("authority_level") or "",
                "localization_required": _to_bool(row.get("localization_required")),
            })
            candidate = canonicalize_dci(row.get("candidate_dci") or "")
            if candidate and candidate != "none":
                _add(policy["candidate_dci"], candidate)
            for item in _split_terms(row.get("avoid_classes")):
                _add(policy["avoid_classes"], item)
            for item in _split_terms(row.get("forbidden_ingredients")):
                _add(policy["forbidden_ingredients"], item)
            for item in _split_safety_screens(row.get("safety_screens")):
                _add(policy["required_safety_screens"], item)
            for item in _split_terms(row.get("requires_patient_data")):
                _add(policy["required_patient_data"], item)
            # Prefer the most conservative route/authority if any row requires review.
            if (row.get("route_if_uncertain") or "") == "review":
                policy["route_if_uncertain"] = "review"
            if (row.get("authority_level") or "") == "review_required":
                policy["authority_level"] = "review_required"
            policy["localization_required"] = bool(policy.get("localization_required")) or _to_bool(row.get("localization_required"))
        return policies

    def _load_dci_safety_profiles(self, path: Path) -> dict[str, dict[str, Any]]:
        profiles: dict[str, dict[str, Any]] = {}
        if not path.exists():
            return profiles
        for row in self._load_rows(path):
            dci = canonicalize_dci(row.get("dci") or "")
            if not dci:
                continue
            patient_data: list[str] = []
            if _to_bool(row.get("requires_age")):
                patient_data.append("age")
            if _to_bool(row.get("requires_weight")):
                patient_data.append("weight")
            profiles[dci] = {
                "contraindication_screens": _split_safety_screens(row.get("contraindication_screens")),
                "requires_patient_data": patient_data,
                "evidence_query_template": row.get("evidence_query_template") or "",
                "authority_level": row.get("authority_level") or "",
                "allowed_routes": _split_terms(row.get("allowed_routes")),
                "default_strengths": _split_terms(row.get("default_strengths")),
                "duplicate_therapy_group": _normalize_canonical_id(row.get("duplicate_therapy_group") or ""),
            }
        return profiles

    def _medical_orders_text(self, medical_orders) -> str:
        if medical_orders is None:
            return ""
        parts: list[str] = []
        for attr in [
            "requested_medications",
            "already_taken_medications",
            "authorized_medications",
            "requested_therapeutic_classes",
            "authorized_therapeutic_classes",
            "case_type",
        ]:
            val = _get_value(medical_orders, attr, [])
            if isinstance(val, list):
                parts.extend(str(x) for x in val)
            elif val:
                parts.append(str(val))
        for attr in ["medication_mentions", "therapeutic_class_mentions", "symptom_mentions", "risk_mentions", "red_flag_mentions"]:
            for mention in _get_value(medical_orders, attr, []) or []:
                mention_status = _get_value(mention, "authorization_status", _get_value(mention, "status", ""))
                if attr == "risk_mentions" and mention_status in {"mentioned_not_authorized", "negated_or_avoid"}:
                    continue
                for field_name in ["medication", "description", "canonical", "canonical_class", "text", "source", "authorization_status", "status"]:
                    if mention_status == "not_currently_taking" and field_name in {"medication", "description", "canonical", "canonical_class", "text"}:
                        continue
                    value = _get_value(mention, field_name, None)
                    if value:
                        parts.append(str(value))
        return normalize_search_text(" ".join(parts))

    def _snapshot_text(self, snapshot: PatientSnapshot) -> str:
        parts: list[str] = []
        for attr in ["normalized_runtime_text", "doctor_notes", "raw_text", "transcript_text"]:
            val = getattr(snapshot, attr, None)
            if val:
                parts.append(str(val))
        for attr in ["normalized_symptoms", "suspected_conditions", "disease_tags", "vulnerable_flags"]:
            parts.extend(str(x) for x in getattr(snapshot, attr, []) or [])
        ctx = getattr(snapshot, "extracted_context", {}) or {}
        if isinstance(ctx, dict):
            for key in ["red_flags", "allergies", "unresolved_flags"]:
                value = ctx.get(key)
                if isinstance(value, list):
                    parts.extend(str(x) for x in value)
                elif value:
                    parts.append(str(value))
        return normalize_search_text(" ".join(parts))

    @staticmethod
    def _load_rows(path: Path) -> list[dict[str, str]]:
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            return [{str(k): str(v or "") for k, v in row.items()} for row in csv.DictReader(fh)]


def _positive_current_anticoagulant_from_blob(blob: str) -> bool:
    text = normalize_search_text(blob)
    if not text:
        return False
    for neg in ["ne prend pas", "sans anticoagulant", "nie anticoagulant", "no anticoagulant", "denies anticoagulant", "not taking"]:
        if _has_any(text, [neg]):
            return False
    return any(__import__("re").search(pattern, text) for pattern in [
        r"\b(?:on|taking|currently taking|already taking)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
        r"\b(?:prend|prends|sous|sous traitement|traitement par|actuellement sous)\s+(warfarin|acenocoumarol|sintrom|anticoagulant|avk)\b",
    ])


def _structured_current_anticoagulant(snapshot: PatientSnapshot, medical_orders=None) -> bool:
    parts: list[str] = []
    patient = getattr(snapshot, "patient", None)
    if patient is not None:
        meds = getattr(patient, "current_medications", []) or []
        parts.extend(str(x) for x in meds)
    if medical_orders is not None:
        val = _get_value(medical_orders, "already_taken_medications", []) or []
        parts.extend(str(x) for x in val)
        for mention in _get_value(medical_orders, "medication_mentions", []) or []:
            if _get_value(mention, "authorization_status", "") == "already_taken":
                parts.append(str(_get_value(mention, "medication", "")))
                parts.append(str(_get_value(mention, "description", "")))
    blob = normalize_search_text(" ".join(parts))
    return _has_any(blob, ["warfarin", "acenocoumarol", "sintrom", "anticoagulant", "avk"]) or (medical_orders is None and _positive_current_anticoagulant_from_blob(_get_value(snapshot, "normalized_runtime_text", "")))


def _get_value(obj, attr: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return getattr(obj, attr, default)


def _split_terms(value: str | None) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [normalize_search_text(part) for part in text.split("|") if normalize_search_text(part)]


def _split_safety_screens(value: str | None) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [_normalize_safety_screen(part) for part in text.split("|") if _normalize_safety_screen(part)]


def _any_terms(text: str, terms: str | None) -> bool:
    split = _split_terms(terms)
    return any(_term_present_without_local_negation(text, term) for term in split)


def _has_any_positive(text: str, terms: list[str]) -> bool:
    return any(_term_present_without_local_negation(text, term) for term in terms)


def _pyelonephritis_or_systemic_uti(text: str) -> bool:
    urinary = _has_any_positive(text, ["dysuria", "brulures urinaires", "brûlures urinaires", "symptomes urinaires", "symptômes urinaires", "urinary"])
    flank = _has_any_positive(text, ["flank pain", "douleur au flanc", "flanc droit", "flanc gauche", "douleur lombaire"])
    systemic = _has_any_positive(text, ["fever", "fievre", "fièvre", "39", "vomiting", "vomissements", "vomi", "rigors", "frissons"])
    return urinary and flank and systemic


def _thunderclap_or_neuro_headache(text: str) -> bool:
    sudden = _has_any_positive(text, ["thunderclap", "sudden", "d un coup", "d'un coup", "brutale", "pire mal de tete", "pire mal de tête", "worst headache"])
    headache = _has_any_positive(text, ["headache", "cephalee", "céphalée", "mal de tete", "mal de tête"])
    neuro = _has_any_positive(text, ["main faible", "main droite faible", "faible", "confus", "confusion", "arm weakness", "weakness", "deficit neurologique", "déficit neurologique", "neurologic deficit", "speech", "vision floue", "vomiting", "vomissements", "vomi"])
    return sudden and headache and neuro


def _dental_deep_infection(text: str) -> bool:
    dental = _has_any_positive(text, ["dental", "dentaire", "dent", "joue gonflee", "joue gonflée"])
    swelling = _has_any_positive(text, ["swelling", "gonflee", "gonflée", "abces", "abcès"])
    systemic_or_deep = _has_any_positive(text, ["fever", "fievre", "fièvre", "39", "trismus", "ouvrir la bouche", "difficulte a avaler", "difficulté à avaler", "avaler fait mal"])
    return dental and swelling and systemic_or_deep


def _anaphylaxis_airway_features(text: str) -> bool:
    allergic = _has_any_positive(text, ["urticaire", "hives", "lip swelling", "gonflement des levres", "gonflement des lèvres", "allergic reaction"])
    airway = _has_any_positive(text, ["wheezing", "sifflement", "throat tightness", "serre dans la gorge", "dyspnea", "dyspnee", "dyspnée"])
    return allergic and airway


def _has_any(blob: str, terms: list[str]) -> bool:
    for raw in terms:
        term = normalize_search_text(raw)
        if not term:
            continue
        pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re_escape(term) + r"(?![a-z0-9\u0600-\u06FF])"
        if __import__("re").search(pattern, blob):
            return True
    return False


def _normalize_canonical_id(value: str | None) -> str:
    text = normalize_search_text(str(value or "").replace("_", " "))
    return text.replace(" ", "_")


def _normalize_planner_value(value: str | None) -> str:
    raw = str(value or "").strip()
    if "_" in raw and "+" not in raw and "/" not in raw:
        return _normalize_canonical_id(raw)
    return normalize_search_text(raw)


def _normalize_safety_screen(value: str | None) -> str:
    normalized = _normalize_canonical_id(value)
    mapping = {
        "hepatic": "hepatic_impairment",
        "hepatic_risk": "hepatic_impairment",
        "hepatic_risk_for_paracetamol": "hepatic_impairment",
        "overdose": "overdose_risk",
        "duplicate_paracetamol": "duplicate_paracetamol",
        "renal": "renal_impairment",
        "renal_risk": "renal_impairment",
        "cardiac": "cardiac_disease",
        "gastric": "gastric_ulcer_bleeding",
        "anticoagulant": "anticoagulant_interaction",
        "antibiotic_stewardship": "antibiotic_stewardship",
        "bacterial_infection_criteria": "bacterial_infection_criteria",
    }
    return mapping.get(normalized, normalized)


def re_escape(value: str) -> str:
    return __import__("re").escape(value)

def _to_bool(value: str | None) -> bool:
    return normalize_search_text(value) in {"true", "1", "yes", "y", "oui"}


def _add(items: list[str], value: str | None) -> None:
    value = _normalize_planner_value(value)
    if value and value not in items:
        items.append(value)

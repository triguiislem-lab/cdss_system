from __future__ import annotations

import re
import json

from libs.contracts.patient import PatientSnapshot
from libs.contracts.prescription import MedicationDraft, SupportingEvidenceRef, TherapeuticPlan
from libs.contracts.clinical_runtime import PrescriptionDraftV1
from libs.utils.medical_text import canonical_ingredient_text, ingredient_set, normalize_search_text
from services.normalization.dci_normalizer import canonicalize_dci


class OutputParser:
    """Parses compact or markdown output and enforces runtime-safe normalization."""

    TRIAGE_MAP = {
        'prescription': 'outpatient_follow_up',
        'outpatient_follow_up': 'outpatient_follow_up',
        'outpatient follow up': 'outpatient_follow_up',
        'follow_up': 'outpatient_follow_up',
        'follow up': 'outpatient_follow_up',
        'ambulatory': 'outpatient_follow_up',
        'ambulatoire': 'outpatient_follow_up',
        'suivi_ambulatoire': 'outpatient_follow_up',
        'suivi ambulatoire': 'outpatient_follow_up',
        'review': 'clinician_review',
        'clinician_review': 'clinician_review',
        'clinician review': 'clinician_review',
        'specialist_review': 'clinician_review',
        'specialist review': 'clinician_review',
        'emergency': 'emergency_referral',
        'emergency_referral': 'emergency_referral',
        'emergency referral': 'emergency_referral',
        'urgence': 'emergency_referral',
        'non_pharma': 'clinician_review',
        'non pharma': 'clinician_review',
    }

    @classmethod
    def _normalize_triage_value(cls, value: str | None) -> str:
        # Map Qwen/JSON/free-text triage values into the internal triage vocabulary.
        raw = str(value or '').strip()
        if not raw:
            return 'clinician_review'
        raw = _strip_markdown_decoration(raw).strip(': ')
        lowered = raw.lower()
        normalized = normalize_search_text(lowered)
        candidates = [
            lowered,
            lowered.replace('-', '_'),
            lowered.replace(' ', '_'),
            normalized,
            normalized.replace(' ', '_'),
        ]
        for candidate in candidates:
            if candidate in cls.TRIAGE_MAP:
                return cls.TRIAGE_MAP[candidate]
        if 'emergency' in normalized or 'urgent' in normalized or 'urgence' in normalized:
            return 'emergency_referral'
        if 'outpatient' in normalized or 'follow' in normalized or 'ambulatoire' in normalized or 'ambulatory' in normalized:
            return 'outpatient_follow_up'
        return 'clinician_review'

    def parse(self, raw_text: str, *, snapshot: PatientSnapshot | None = None) -> TherapeuticPlan:
        json_plan = self._parse_json_like(raw_text)
        if any("strict_json_validation_failed" in note for note in getattr(json_plan, "generation_notes", []) or []):
            plan = json_plan
        elif json_plan.medications or json_plan.problem_summary != "Unspecified problem":
            plan = json_plan
            compact_plan = self._parse_compact(raw_text)
            loose_plan = self._parse_loose_medication_lines(raw_text)
            plan = self._merge_plans(plan, compact_plan, loose_plan)
        elif "## DIAGNOSIS" in raw_text and "## PROPOSED PRESCRIPTION" in raw_text:
            # Qwen often returns both a human-readable markdown table and
            # machine-readable lines such as "**triage:** outpatient_follow_up".
            # Always merge those compact lines, even when the markdown table
            # already contains medications, otherwise the final triage can stay
            # stuck at the markdown default "clinician_review".
            markdown_plan = self._parse_markdown(raw_text)
            compact_plan = self._parse_compact(raw_text)
            loose_plan = self._parse_loose_medication_lines(raw_text)
            plan = self._merge_plans(markdown_plan, compact_plan, loose_plan)
        else:
            plan = self._parse_compact(raw_text)
            if not plan.medications:
                loose_plan = self._parse_loose_medication_lines(raw_text)
                if loose_plan.medications:
                    plan = loose_plan
        return self._normalize_plan(plan, snapshot=snapshot)

    def _parse_json_like(self, raw_text: str) -> TherapeuticPlan:
        payload = self._extract_json_payload(raw_text)
        if isinstance(payload, list):
            payload = {"medications": payload}
        if not isinstance(payload, dict):
            return TherapeuticPlan(problem_summary="Unspecified problem")

        strict_plan = self._parse_prescription_draft_v1(payload)
        if strict_plan is not None:
            return strict_plan

        meds_payload = (
            payload.get("medications")
            or payload.get("medicaments")
            or payload.get("médicaments")
            or payload.get("draft_medications")
            or payload.get("proposed_prescription")
            or payload.get("prescription")
            or payload.get("traitements")
            or []
        )
        if isinstance(meds_payload, dict):
            meds_payload = [meds_payload]
        medications: list[MedicationDraft] = []
        for item in meds_payload if isinstance(meds_payload, list) else []:
            if not isinstance(item, dict):
                continue
            ingredient = _first_json(
                item,
                "active_ingredient",
                "ingredient",
                "dci",
                "drug",
                "name",
                "medicament",
                "médicament",
                "nom",
                "substance_active",
                "substance active",
            )
            if not ingredient:
                continue
            medications.append(
                MedicationDraft(
                    active_ingredient=canonicalize_dci(str(ingredient)),
                    indication=str(_first_json(item, "indication", "reason", "diagnosis") or "drafted from model JSON output"),
                    dose=_normalize_dose_text(str(_first_json(item, "dose", "dosage", "posologie") or "unspecified")),
                    frequency=_normalize_frequency_text(
                        str(_first_json(item, "frequency", "freq", "frequence", "fréquence") or "unspecified")
                    ),
                    duration=_normalize_duration_text(str(_first_json(item, "duration", "duree", "durée") or "unspecified")),
                    route=_normalize_route_text(str(_first_json(item, "route", "voie", "administration_route") or "oral")),
                    rationale=str(_first_json(item, "rationale", "justification") or "Drafted by generation service"),
                )
            )
        triage = self._normalize_triage_value(_first_json(payload, "triage", "triage_recommendation", "route"))
        problem = str(_first_json(payload, "problem_summary", "diagnosis", "summary") or "Unspecified problem")
        monitoring = _as_string_list(payload.get("monitoring") or payload.get("monitoring_required"))
        questions = _as_string_list(payload.get("questions") or payload.get("unresolved_questions"))
        notes = _as_string_list(payload.get("notes") or payload.get("safety_review"))
        confidence = payload.get("confidence")
        try:
            confidence = float(confidence) if confidence is not None else None
        except (TypeError, ValueError):
            confidence = None
        return TherapeuticPlan(
            problem_summary=problem,
            medications=medications,
            monitoring=monitoring,
            unresolved_questions=questions,
            generation_notes=notes,
            triage_recommendation=triage,
            confidence=confidence,
        )

    def _parse_prescription_draft_v1(self, payload: dict) -> TherapeuticPlan | None:
        """Parse the strict Patch17 Pydantic contract if present.

        Invalid strict JSON fails closed: no medication is accepted from a
        malformed PrescriptionDraftV1 payload.  Legacy parsing remains only for
        historical/fallback paths that do not declare schema_version.
        """
        if payload.get("schema_version") != "PrescriptionDraftV1":
            return None
        try:
            draft = PrescriptionDraftV1.model_validate(payload)
        except Exception as exc:
            return TherapeuticPlan(
                problem_summary="Invalid PrescriptionDraftV1 output",
                medications=[],
                non_drug_recommendations=[],
                monitoring=[],
                unresolved_questions=["LLM output failed strict PrescriptionDraftV1 validation; regenerate or route to review."],
                generation_notes=[f"strict_json_validation_failed={type(exc).__name__}: {str(exc)[:300]}"],
                triage_recommendation="clinician_review",
                confidence=0.0,
            )
        triage_map = {
            "draft_prescription": "outpatient_follow_up",
            "review_draft_allowed": "clinician_review",
            "review_blocked": "clinician_review",
            "missing_info": "clinician_review",
            "non_pharma": "clinician_review",
            "emergency": "emergency_referral",
        }
        medications = [
            MedicationDraft(
                active_ingredient=canonicalize_dci(item.active_ingredient),
                indication=item.indication,
                dose=_normalize_dose_text(item.dose),
                frequency=_normalize_frequency_text(item.frequency),
                duration=_normalize_duration_text(item.duration),
                route=_normalize_route_text(item.route),
                rationale=item.rationale or "Drafted from strict PrescriptionDraftV1 output",
                supporting_evidence=[SupportingEvidenceRef(source=eid, note="Referenced by strict JSON draft") for eid in item.evidence_ids],
                safety_considerations=list(item.safety_considerations or []),
            )
            for item in draft.medications
        ]
        notes = ["parsed_contract=PrescriptionDraftV1", "strict_json_validation=passed"]
        if draft.triage != "draft_prescription" and medications:
            medications = []
            notes.append("strict_json_blocked_triage_medications_suppressed=true")
        return TherapeuticPlan(
            problem_summary=draft.problem_summary,
            medications=medications,
            non_drug_recommendations=list(draft.non_drug_recommendations or []),
            monitoring=list(draft.monitoring or []),
            unresolved_questions=list(draft.missing_questions or []),
            generation_notes=notes,
            triage_recommendation=triage_map.get(draft.triage, "clinician_review"),
            confidence=draft.confidence,
        )

    @staticmethod
    def _extract_json_payload(raw_text: str) -> dict | list | None:
        fenced = re.search(r"```(?:json)?\s*([\[{].*?[\]}])\s*```", raw_text, flags=re.S | re.I)
        candidates = [fenced.group(1)] if fenced else []
        decoder = json.JSONDecoder()
        for idx, char in enumerate(raw_text):
            if char not in "{[":
                continue
            try:
                payload, _ = decoder.raw_decode(raw_text[idx:])
            except json.JSONDecodeError:
                continue
            if isinstance(payload, (dict, list)):
                return payload
        for candidate in candidates:
            try:
                payload = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, (dict, list)):
                return payload
        return None

    @staticmethod
    def _extract_json_object(raw_text: str) -> dict | None:
        payload = OutputParser._extract_json_payload(raw_text)
        return payload if isinstance(payload, dict) else None

    def _parse_compact(self, raw_text: str) -> TherapeuticPlan:
        problem_summary = "Unspecified problem"
        medications: list[MedicationDraft] = []
        medication_index: dict[str, MedicationDraft] = {}
        non_drug: list[str] = []
        monitoring: list[str] = []
        unresolved: list[str] = []
        notes: list[str] = []
        triage = "clinician_review"
        confidence: float | None = None

        for line in raw_text.splitlines():
            line = _strip_markdown_decoration(line.strip())
            if not line:
                continue
            if line.startswith("problem_summary:"):
                problem_summary = line.split(":", 1)[1].strip()
            elif line.startswith("triage:"):
                triage = line.split(":", 1)[1].strip()
            elif line.startswith("confidence:"):
                try:
                    confidence = float(line.split(":", 1)[1].strip())
                except ValueError:
                    confidence = None
            elif line.startswith("medication:"):
                payload = [part.strip() for part in line.split(":", 1)[1].split("|")]
                if len(payload) >= 6:
                    med = MedicationDraft(
                        active_ingredient=canonicalize_dci(payload[0]),
                        indication=payload[1],
                        dose=payload[2],
                        frequency=payload[3],
                        duration=payload[4],
                        route=payload[5],
                        rationale=payload[6] if len(payload) >= 7 else "Drafted by generation service",
                    )
                    medications.append(med)
                    medication_index[normalize_search_text(med.active_ingredient)] = med
            elif line.startswith("support:"):
                payload = [part.strip() for part in line.split(":", 1)[1].split("|")]
                if len(payload) >= 3:
                    ingredient = normalize_search_text(payload[0])
                    if ingredient in medication_index:
                        medication_index[ingredient].supporting_evidence.append(
                            SupportingEvidenceRef(source=payload[1], note=payload[2])
                        )
            elif line.startswith("non_drug:"):
                non_drug.append(line.split(":", 1)[1].strip())
            elif line.startswith("monitoring:"):
                monitoring.append(line.split(":", 1)[1].strip())
            elif line.startswith("question:"):
                unresolved.append(line.split(":", 1)[1].strip())
            elif line.startswith("note:"):
                notes.append(line.split(":", 1)[1].strip())

        return TherapeuticPlan(
            problem_summary=problem_summary,
            medications=medications,
            non_drug_recommendations=non_drug,
            monitoring=monitoring,
            unresolved_questions=unresolved,
            generation_notes=notes,
            triage_recommendation=triage,
            confidence=confidence,
        )

    def _parse_loose_medication_lines(self, raw_text: str) -> TherapeuticPlan:
        medications: list[MedicationDraft] = []
        problem_summary = "Unspecified problem"
        triage = "clinician_review"
        monitoring: list[str] = []
        notes: list[str] = []
        for line in raw_text.splitlines():
            clean = _strip_markdown_decoration(line.strip().strip("-*").strip())
            if not clean:
                continue
            lowered = clean.lower()
            if lowered.startswith(("diagnosis:", "diagnostic:", "summary:", "problem:")):
                problem_summary = clean.split(":", 1)[1].strip() or problem_summary
            elif lowered.startswith(("triage:", "route:")):
                triage = clean.split(":", 1)[1].strip() or triage
            elif lowered.startswith(("monitoring:", "surveillance:")):
                monitoring.append(clean.split(":", 1)[1].strip())
            elif lowered.startswith(("note:", "safety:", "precaution:")):
                notes.append(clean.split(":", 1)[1].strip())
            elif re.search(r"\b(paracetamol|acetaminophen|salbutamol|albuterol|ibuprofen|dextromethorphan)\b", lowered):
                med = self._parse_loose_medication_line(clean)
                if med is not None:
                    medications.append(med)
        return TherapeuticPlan(
            problem_summary=problem_summary,
            medications=medications,
            monitoring=monitoring,
            generation_notes=notes,
            triage_recommendation=triage,
            confidence=0.54 if medications else None,
        )

    @staticmethod
    def _parse_loose_medication_line(line: str) -> MedicationDraft | None:
        lowered = line.lower()
        match = re.search(r"\b(paracetamol|acetaminophen|salbutamol|albuterol|ibuprofen|dextromethorphan)\b", lowered)
        if not match:
            return None
        ingredient = match.group(1)
        if ingredient == "acetaminophen":
            ingredient = "paracetamol"
        if ingredient == "albuterol":
            ingredient = "salbutamol"
        dose_match = re.search(r"(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml)(?:/\w+)?)", line, flags=re.I)
        frequency_match = re.search(
            r"(every\s+\d+\s+hours|q\d+h|[0-9]\s*(?:times|x)\s*(?:daily|per day|/day)|\d+\s+fois\s+par\s+jour|toutes?\s+les\s+\d+\s+heures|as needed|si besoin)",
            line,
            flags=re.I,
        )
        duration_match = re.search(r"((?:pendant|durant|for)?\s*\d+\s*(?:days?|jours?|weeks?|semaines?))", line, flags=re.I)
        route = "inhalation" if ingredient == "salbutamol" or "inhal" in lowered else "oral"
        if re.search(r"\b(voie\s+orale|par\s+voie\s+orale|orale)\b", lowered):
            route = "oral"
        return MedicationDraft(
            active_ingredient=canonicalize_dci(ingredient),
            indication="drafted from loose model output",
            dose=_normalize_dose_text(dose_match.group(1) if dose_match else "unspecified"),
            frequency=_normalize_frequency_text(frequency_match.group(1) if frequency_match else "unspecified"),
            duration=_normalize_duration_text(duration_match.group(1) if duration_match else "unspecified"),
            route=route,
            rationale="Parsed from non-compact model output; clinician validation required",
        )

    def _parse_markdown(self, raw_text: str) -> TherapeuticPlan:
        diagnosis = self._extract_section(raw_text, "DIAGNOSIS") or "Unspecified problem"
        rx_section = self._extract_section(raw_text, "PROPOSED PRESCRIPTION")
        safety_section = self._extract_section(raw_text, "SAFETY REVIEW")
        evidence_section = self._extract_section(raw_text, "CLINICAL EVIDENCE")
        monitoring_section = self._extract_section(raw_text, "MONITORING REQUIRED")
        disclaimer_section = self._extract_section(raw_text, "DISCLAIMER")

        medications = self._parse_markdown_table(rx_section)
        evidence_refs = self._parse_evidence_lines(evidence_section)
        for med in medications:
            med.supporting_evidence.extend(evidence_refs)
        notes = []
        if safety_section:
            notes.extend(self._clean_lines(safety_section))
        if disclaimer_section:
            notes.extend(self._clean_lines(disclaimer_section))
        non_drug = []
        if rx_section and not medications:
            non_drug.extend(self._find_non_drug_statements(rx_section))
        monitoring = self._clean_lines(monitoring_section)
        triage = self._infer_triage(diagnosis, notes, non_drug)
        confidence = self._infer_confidence(medications, evidence_refs, triage)

        return TherapeuticPlan(
            problem_summary=diagnosis,
            medications=medications,
            non_drug_recommendations=non_drug,
            monitoring=monitoring,
            unresolved_questions=[],
            generation_notes=notes,
            triage_recommendation=triage,
            confidence=confidence,
        )

    @staticmethod
    def _extract_section(text: str, heading: str) -> str:
        pattern = re.compile(
            rf"##\s+{re.escape(heading)}\s*(.*?)(?=\n##\s+[A-Z]|\Z)",
            flags=re.S,
        )
        match = pattern.search(text)
        return match.group(1).strip() if match else ""

    def _parse_markdown_table(self, section: str) -> list[MedicationDraft]:
        if not section:
            return []
        meds: list[MedicationDraft] = []
        for line in section.splitlines():
            line = line.strip()
            if not line.startswith("|"):
                continue
            if "Drug (DCI)" in line or set(line.replace("|", "").strip()) <= {"-", ":"}:
                continue
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if len(cells) < 6:
                continue
            ingredient, dose, route, frequency, duration, local_equivalent = cells[:6]
            if not ingredient or ingredient.startswith("["):
                continue
            rationale = None
            if local_equivalent and local_equivalent.lower() not in {"none", "n/a", "na", "unknown", "-"}:
                rationale = f"Notebook-style draft mapped to local equivalent: {local_equivalent}"
            meds.append(
                MedicationDraft(
                    active_ingredient=canonicalize_dci(ingredient),
                    indication="drafted from notebook-style markdown output",
                    dose=dose or "unspecified",
                    frequency=frequency or "unspecified",
                    duration=duration or "unspecified",
                    route=route or "oral",
                    rationale=rationale,
                )
            )
        return meds

    @staticmethod
    def _clean_lines(section: str) -> list[str]:
        lines: list[str] = []
        for raw in section.splitlines():
            line = raw.strip().strip("-").strip()
            if not line:
                continue
            if line.startswith("###"):
                line = line.lstrip("#").strip()
            if line.startswith("[") and line.endswith("]"):
                continue
            lines.append(line)
        return lines

    def _parse_evidence_lines(self, section: str) -> list[SupportingEvidenceRef]:
        refs: list[SupportingEvidenceRef] = []
        for line in self._clean_lines(section):
            match = re.search(r"(\[(?:KG|VS|LOCAL)\])", line)
            source = match.group(1) if match else "[EVIDENCE]"
            refs.append(SupportingEvidenceRef(source=source, note=line))
        return refs[:4]

    @staticmethod
    def _find_non_drug_statements(section: str) -> list[str]:
        statements: list[str] = []
        for line in section.splitlines():
            clean = line.strip().lstrip("-").strip()
            if not clean or clean.startswith("|"):
                continue
            lowered = clean.lower()
            if any(k in lowered for k in ["no outpatient medication", "urgent", "supportive care", "rest", "hydration", "clinician review"]):
                statements.append(clean)
        return statements[:4]

    @staticmethod
    def _merge_plans(*plans: TherapeuticPlan) -> TherapeuticPlan:
        base = plans[0]
        medications: list[MedicationDraft] = []
        monitoring: list[str] = []
        unresolved: list[str] = []
        notes: list[str] = []
        non_drug: list[str] = []
        problem = base.problem_summary
        triage = base.triage_recommendation
        confidence = base.confidence
        for plan in plans:
            if plan.problem_summary != "Unspecified problem" and problem == "Unspecified problem":
                problem = plan.problem_summary
            if plan.triage_recommendation != "clinician_review" and triage == "clinician_review":
                triage = plan.triage_recommendation
            if confidence is None and plan.confidence is not None:
                confidence = plan.confidence
            medications.extend(plan.medications)
            monitoring.extend(plan.monitoring)
            unresolved.extend(plan.unresolved_questions)
            notes.extend(plan.generation_notes)
            non_drug.extend(plan.non_drug_recommendations)
        return base.model_copy(
            update={
                "problem_summary": problem,
                "medications": medications,
                "monitoring": list(dict.fromkeys(monitoring)),
                "unresolved_questions": list(dict.fromkeys(unresolved)),
                "generation_notes": list(dict.fromkeys(notes)),
                "non_drug_recommendations": list(dict.fromkeys(non_drug)),
                "triage_recommendation": triage,
                "confidence": confidence,
            }
        )

    @staticmethod
    def _infer_triage(diagnosis: str, notes: list[str], non_drug: list[str]) -> str:
        blob = " ".join([diagnosis, *notes, *non_drug]).lower()
        if any(k in blob for k in ["emergency", "urgent", "red-flag", "referral"]):
            return "emergency_referral"
        if any(k in blob for k in ["review", "validate", "clinician"]):
            return "clinician_review"
        return "outpatient_follow_up"

    @staticmethod
    def _infer_confidence(medications: list[MedicationDraft], refs: list[SupportingEvidenceRef], triage: str) -> float:
        base = 0.56
        if triage == "emergency_referral":
            base = 0.82
        elif medications:
            base += min(0.18, 0.06 * len(medications))
        if refs:
            base += min(0.12, 0.03 * len(refs))
        return max(0.35, min(0.9, round(base, 2)))

    def _normalize_plan(self, plan: TherapeuticPlan, snapshot: PatientSnapshot | None = None) -> TherapeuticPlan:
        known_dci = set(snapshot.extracted_context.get("known_runtime_dci", [])) if snapshot else set()
        candidates: list[MedicationDraft] = []
        unresolved = list(plan.unresolved_questions)
        for med in plan.medications:
            raw_ingredient = str(med.active_ingredient or "")
            ingredient = canonicalize_dci(raw_ingredient)
            if not ingredient:
                # Fall back to legacy parser only when the central DCI normalizer
                # cannot extract anything. Patch 12 makes central canonicalization
                # the final authority so outputs do not drift to ibuprofene,
                # amoxicilline, etc.
                legacy_parts = ingredient_set(canonical_ingredient_text(raw_ingredient))
                ingredient = " + ".join(canonicalize_dci(part) for part in legacy_parts if canonicalize_dci(part))
            elif " + " in ingredient or "/" in raw_ingredient or "," in raw_ingredient:
                legacy_parts = ingredient_set(raw_ingredient)
                canonical_parts = [canonicalize_dci(part) for part in legacy_parts if canonicalize_dci(part)]
                if canonical_parts:
                    ingredient = " + ".join(dict.fromkeys(canonical_parts))
            ingredient = canonicalize_dci(ingredient)
            if not ingredient or ingredient.lower() in {"unknown", "none", "n/a"}:
                continue
            dose = med.dose.strip() if med.dose else "unspecified"
            frequency = med.frequency.strip() if med.frequency else "unspecified"
            duration = med.duration.strip() if med.duration else "unspecified"
            if any(x in normalize_search_text(" ".join([dose, frequency, duration])) for x in ["unspecified", "unknown", "tbd", "to confirm"]):
                unresolved.append(f"Complete dosing details for {ingredient} before final approval.")
            candidates.append(
                med.model_copy(
                    update={
                        "active_ingredient": ingredient.lower(),
                        "dose": dose,
                        "frequency": frequency,
                        "duration": duration,
                    }
                )
            )
        normalized_meds = self._deduplicate_medications(candidates)
        complete_ingredients = {
            normalize_search_text(med.active_ingredient)
            for med in normalized_meds
            if _medication_specificity_score(med) >= 3
        }
        unresolved = [
            item
            for item in unresolved
            if not (
                item.startswith("Complete dosing details for ")
                and normalize_search_text(item.removeprefix("Complete dosing details for ").split(" before ", 1)[0]) in complete_ingredients
            )
        ]
        triage = self._normalize_triage_value(plan.triage_recommendation)
        if snapshot:
            if snapshot.route_recommendation == "emergency":
                triage = "emergency_referral"
                normalized_meds = []
            elif snapshot.route_recommendation in {"review", "non_pharma"}:
                triage = "clinician_review"
                if snapshot.route_recommendation == "non_pharma":
                    normalized_meds = []
        if any(item.startswith("Complete dosing details") for item in unresolved) and triage == "outpatient_follow_up":
            triage = "clinician_review"
        return plan.model_copy(
            update={
                "medications": normalized_meds,
                "unresolved_questions": list(dict.fromkeys(unresolved)),
                "triage_recommendation": triage,
            }
        )

    @staticmethod
    def _deduplicate_medications(medications: list[MedicationDraft]) -> list[MedicationDraft]:
        grouped: dict[tuple[str, str], MedicationDraft] = {}
        for med in medications:
            key = (normalize_search_text(med.active_ingredient), normalize_search_text(med.route))
            existing = grouped.get(key)
            if existing is None or _medication_specificity_score(med) > _medication_specificity_score(existing):
                grouped[key] = med
            elif existing is not None:
                evidence = _dedupe_supporting_evidence(list(existing.supporting_evidence) + list(med.supporting_evidence))
                grouped[key] = existing.model_copy(update={"supporting_evidence": evidence})
        return list(grouped.values())


def _medication_specificity_score(med: MedicationDraft) -> int:
    score = 0
    for value in [med.dose, med.frequency, med.duration]:
        normalized = normalize_search_text(value)
        if value and not any(token in normalized for token in ["unspecified", "unknown", "tbd", "to confirm"]):
            score += 1
    if med.rationale and med.rationale != "Drafted by generation service":
        score += 1
    return score


def _dedupe_supporting_evidence(items: list[SupportingEvidenceRef]) -> list[SupportingEvidenceRef]:
    out: list[SupportingEvidenceRef] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        key = (item.source, item.note)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _normalize_dose_text(value: str) -> str:
    return re.sub(r"(?<=\d)(?=(mg|mcg|µg|g|ml)\b)", " ", value.strip(), flags=re.I)


def _normalize_frequency_text(value: str) -> str:
    text = value.strip()
    normalized = normalize_search_text(text)
    match = re.search(r"toutes?\s+les\s+(\d+)\s+heures?", normalized)
    if match:
        return f"every {match.group(1)} hours"
    match = re.search(r"(\d+)\s+fois\s+par\s+jour", normalized)
    if match:
        return f"{match.group(1)} times daily"
    if normalized in {"si besoin", "au besoin", "en cas de besoin"}:
        return "as needed"
    return text


def _normalize_duration_text(value: str) -> str:
    text = value.strip()
    normalized = normalize_search_text(text)
    match = re.search(r"(?:pendant|durant|for)?\s*(\d+)\s*(jours?|days?)", normalized)
    if match:
        unit = "days" if match.group(1) != "1" else "day"
        return f"{match.group(1)} {unit}"
    match = re.search(r"(?:pendant|durant|for)?\s*(\d+)\s*(semaines?|weeks?)", normalized)
    if match:
        unit = "weeks" if match.group(1) != "1" else "week"
        return f"{match.group(1)} {unit}"
    return text


def _normalize_route_text(value: str) -> str:
    normalized = normalize_search_text(value)
    if any(token in normalized for token in ["voie orale", "par voie orale", "orale", "oral"]):
        return "oral"
    if any(token in normalized for token in ["inhalation", "inhale", "inhaler", "inhalee", "inhalée"]):
        return "inhalation"
    if any(token in normalized for token in ["injectable", "injection", "iv", "intraveineuse"]):
        return "injectable"
    return value.strip() or "oral"



def _strip_markdown_decoration(line: str) -> str:
    """Normalize compact Qwen lines such as '**triage: outpatient_follow_up**'."""
    cleaned = str(line or "").strip()
    cleaned = re.sub(r"^\s*[-•]+\s*", "", cleaned)
    # Remove balanced markdown bold/italic/backtick wrappers without touching table pipes.
    changed = True
    while changed:
        changed = False
        for wrapper in ("**", "__", "`"):
            if cleaned.startswith(wrapper) and cleaned.endswith(wrapper) and len(cleaned) >= 2 * len(wrapper):
                cleaned = cleaned[len(wrapper):-len(wrapper)].strip()
                changed = True
        if cleaned.startswith("*") and cleaned.endswith("*") and len(cleaned) >= 2:
            cleaned = cleaned[1:-1].strip()
            changed = True
    return cleaned.strip()


def _first_json(item: dict, *keys: str):
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return None


def _as_string_list(value) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if isinstance(value, dict):
        return [f"{key}: {val}" for key, val in value.items() if val not in (None, "")]
    return [str(value)]

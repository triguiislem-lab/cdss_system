from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from libs.contracts.patient import ConsultationInput
from libs.utils.medical_text import normalize_search_text


@dataclass(frozen=True)
class PatternSpec:
    label: str
    patterns: tuple[str, ...]
    category: str
    emergency_weight: int = 0

    def __post_init__(self) -> None:
        if isinstance(self.patterns, str):
            object.__setattr__(self, "patterns", (self.patterns,))


class ConsultationParser:
    """Offline multilingual clinical-information extraction layer.

    The parser follows a conservative clinical IE pattern: normalize text, detect
    entities, apply local negation/uncertainty windows, extract simple relations
    such as medication/allergy/pregnancy/renal context, then expose parser-quality
    signals so routing can fail safely to review when extraction is uncertain.

    It is deterministic and internet-free by design. It does not claim to replace
    clinician review or a validated clinical NLP model.
    """

    NEGATION_TERMS = {
        "no", "not", "without", "denies", "deny", "negative for",
        "pas", "sans", "aucun", "aucune", "nie", "absence", "non",
        "لا", "بدون", "ما فماش", "مفيش",
    }
    UNCERTAINTY_TERMS = {
        "suspected", "possible", "probable", "rule out", "r/o", "?",
        "suspicion", "probable", "possible", "a verifier", "à vérifier",
        "قد", "اشتباه", "محتمل",
    }

    symptoms: tuple[PatternSpec, ...] = (
        PatternSpec("fever", (r"\bfever\b", r"\bfi[eè]vre\b", r"\bpyrex", r"\bحمى\b", r"\bحرارة\b"), "symptom"),
        PatternSpec("sore throat", (r"sore throat", r"mal de gorge", r"angine", r"pharyng", r"\bحلق\b"), "symptom"),
        PatternSpec("cough", (r"\bcough\b", r"\btoux\b", r"\bسعال\b", r"كحة"), "symptom"),
        PatternSpec("headache", (r"headache", r"maux? de t[eê]te", r"c[eé]phal", r"\bصداع\b", r"وجيعة راس"), "symptom"),
        PatternSpec("vomiting", (r"vomit", r"vomissement", r"\bقيء\b", r"ترجيع"), "symptom"),
        PatternSpec("nausea", (r"nausea", r"naus[ée]e", r"\bغثيان\b"), "symptom"),
        PatternSpec("abdominal pain", (r"abdominal pain", r"stomach pain", r"stomach ache", r"stomachache", r"belly pain", r"belly ache", r"tummy pain", r"tummy ache", r"abdominal discomfort", r"abdomen pain", r"epigastric pain", r"epigastralgia", r"douleur abdominale", r"douleur au ventre", r"mal au ventre", r"douleur [ée]pigastr", r"\bبطن\b", r"كرش"), "symptom"),
        PatternSpec("diarrhea", (r"diarrh", r"\bإسهال\b"), "symptom"),
        PatternSpec("dyspnea", (r"dyspn", r"essouffl", r"shortness of breath", r"breathless", r"\bضيق تنفس\b"), "symptom", 1),
        PatternSpec("chest pain", (
            r"chest pain", r"douleur thorac", r"oppression thorac", r"douleur poitrine",
            r"\bsderi?\b", r"\bsdar\b", r"wja3\s+(?:fi\s+|f\s+|fel\s+)?sderi?",
            r"wji3a?\s+(?:fi\s+|f\s+|fel\s+)?sderi?", r"wajaa?\s+(?:fi\s+|f\s+|fel\s+)?sderi?",
            r"\bصدر\b", r"وجع\s+(?:في\s+)?صدري?", r"وجيعة\s+(?:في\s+)?صدري?", r"(?:ألم|الم)\s+صدر",
        ), "symptom", 2),
        PatternSpec("wheezing", (r"wheez", r"sibil", r"\bصفير\b"), "symptom"),
        PatternSpec("dental pain", (r"denta", r"tooth", r"dent", r"\bسن\b"), "symptom"),
        PatternSpec("back pain", (r"low back pain", r"lombosciat", r"douleur lomb", r"\bظهر\b"), "symptom"),
        PatternSpec("ear pain", (r"otalg", r"ear pain", r"oreille", r"\bأذن\b"), "symptom"),
        PatternSpec("rash", (r"ecz[eé]ma", r"rash", r"eruption", r"\bطفح\b", r"حكة"), "symptom"),
        PatternSpec("visual blur", (r"vision floue", r"blurred vision", r"myopi", r"\bنظر\b"), "symptom"),
        PatternSpec("edema", (r"edema", r"oedema", r"oed[eè]me", r"تورم"), "symptom"),
        PatternSpec("high blood pressure", (r"hypertension", r"hta", r"tension", r"blood pressure", r"ضغط"), "symptom"),
        PatternSpec("suicidal ideation", (r"suicid", r"self harm", r"id[eé]es noires", r"انتحار"), "symptom", 3),
    )

    diseases: tuple[PatternSpec, ...] = (
        PatternSpec("influenza", (r"\bgrippe\b", r"influenza", r"viral syndrome", r"syndrome grippal"), "disease"),
        PatternSpec("asthma", (r"\basthm", r"\bربو\b"), "disease"),
        PatternSpec("migraine", (r"\bmigraine\b",), "disease"),
        PatternSpec("hypertension", (r"\bhta\b", r"hypertension", r"tension art"), "disease"),
        PatternSpec("diabetes", (r"\bdiab[eè]te", r"diabetes", r"glyc[eé]mie"), "disease"),
        PatternSpec("dental abscess", (r"abces dentaire", r"abc[eè]s dentaire", r"dental abscess"), "disease"),
        PatternSpec("renal disease", (r"\birc\b", r"renal impairment", r"insuffisance r[eé]nale", r"lithiase", r"kidney failure"), "disease"),
        PatternSpec("preeclampsia", (r"pr[eé]eclamps", r"preeclamps"), "disease", 3),
        PatternSpec("myopia", (r"\bmyopie\b", r"\bmyopia\b"), "disease"),
        PatternSpec("otitis media", (r"\boma\b", r"otite", r"otitis"), "disease"),
        PatternSpec("eczema", (r"\becz[eé]ma\b",), "disease"),
        PatternSpec("depression", (r"\bd[eé]press", r"depressed", r"trouble d[eé]pressif"), "disease"),
        PatternSpec("stemi", (r"\bstemi\b", r"acute coronary syndrome", r"infarct", r"syndrome coronarien"), "disease", 3),
        PatternSpec("sciatica", (r"lombosciat", r"sciat"), "disease"),
    )

    medication_lexicon = {
        "paracetamol", "acetaminophen", "ibuprofen", "diclofenac", "amoxicilline", "amoxicillin",
        "metformin", "warfarin", "acenocoumarol", "salbutamol", "oseltamivir", "prednisone",
        "prednisolone", "amlodipine", "perindopril", "metronidazole", "aspirin", "clopidogrel",
        "insulin", "ramipril", "enalapril", "furosemide", "spironolactone", "sertraline",
        "fluoxetine", "amitriptyline", "omeprazole", "pantoprazole",
    }

    def parse(self, consultation: ConsultationInput, runtime_text: str | None = None) -> dict[str, object]:
        original = " ".join([consultation.doctor_notes or ""] + [turn.text for turn in consultation.transcript])
        # Use BOTH translated/runtime text and original consultation text.
        # This prevents translation drift from hiding clinically important raw terms
        # such as "douleur abdominale", Arabic symptom words, or local phrasing.
        combined_text = " ".join(part for part in [runtime_text or "", original] if part)
        corpus = normalize_search_text(combined_text or original)
        section_map = self._section_map(consultation, runtime_text=combined_text)
        symptom_mentions = self._find_mentions(corpus, self.symptoms)
        disease_mentions = self._find_mentions(corpus, self.diseases)
        active_symptoms = self._labels(symptom_mentions, include_negated=False)
        disease_tags = self._labels(disease_mentions, include_negated=False)
        suspected_conditions = self._infer_conditions(active_symptoms, disease_tags, corpus)
        extracted = self._extract_context(corpus, section_map)
        vulnerable = self._vulnerable_flags(corpus, extracted)
        unresolved_flags = self._unresolved_flags(corpus, active_symptoms, disease_tags, extracted)
        missing = self._missing_info(corpus, active_symptoms, extracted, unresolved_flags)
        red_flags = self._red_flags(corpus, active_symptoms, disease_tags, symptom_mentions + disease_mentions)
        quality = self._quality_report(corpus, symptom_mentions, disease_mentions, extracted, missing, red_flags)
        return {
            "symptoms": active_symptoms,
            "disease_tags": disease_tags,
            "suspected_conditions": suspected_conditions,
            "missing_critical_information": missing,
            "vulnerable_flags": vulnerable,
            "emergency_detected": bool(red_flags),
            "runtime_text": corpus,
            "current_medications": extracted["current_medications"],
            "allergies": extracted["allergies"],
            "pregnancy_mentioned": extracted["pregnancy_mentioned"],
            "renal_mentioned": extracted["renal_mentioned"],
            "hepatic_mentioned": extracted["hepatic_mentioned"],
            "extracted_context": {
                **extracted,
                "unresolved_flags": unresolved_flags,
                "symptom_mentions": symptom_mentions,
                "disease_mentions": disease_mentions,
                "red_flags": red_flags,
                "parser_quality": quality,
                "section_map": section_map,
            },
        }

    def _find_mentions(self, corpus: str, specs: Iterable[PatternSpec]) -> list[dict[str, object]]:
        mentions: list[dict[str, object]] = []
        for spec in specs:
            for pattern in spec.patterns:
                compiled_pattern = self._compile_pattern(pattern)
                if compiled_pattern is None:
                    continue
                for match in compiled_pattern.finditer(corpus):
                    window = self._window(corpus, match.start(), match.end())
                    negated = self._is_negated_mention(corpus, match.start(), match.end())
                    uncertain = self._has_window_term(window, self.UNCERTAINTY_TERMS)
                    mentions.append({
                        "label": spec.label,
                        "category": spec.category,
                        "span": match.group(0),
                        "start": match.start(),
                        "end": match.end(),
                        "negated": negated,
                        "uncertain": uncertain,
                        "emergency_weight": spec.emergency_weight,
                    })
        # Deduplicate by label + negation/uncertainty, keeping the earliest span.
        dedup: dict[tuple[str, bool, bool], dict[str, object]] = {}
        for item in mentions:
            key = (str(item["label"]), bool(item["negated"]), bool(item["uncertain"]))
            if key not in dedup or int(item["start"]) < int(dedup[key]["start"]):
                dedup[key] = item
        return sorted(dedup.values(), key=lambda item: int(item["start"]))

    @staticmethod
    def _compile_pattern(pattern: str) -> re.Pattern[str] | None:
        """Compile dictionary patterns defensively.

        Older Kaggle releases may contain malformed notebook-derived terms such
        as a single backslash. A bad dictionary entry should not crash the whole
        prescription pipeline; invalid regexes are treated as literal terms when
        possible, otherwise skipped.
        """
        raw = str(pattern or "").strip()
        if not raw or raw == "\\":
            return None
        try:
            return re.compile(raw, flags=re.I)
        except re.error:
            literal = re.escape(raw)
            if not literal:
                return None
            try:
                return re.compile(literal, flags=re.I)
            except re.error:
                return None

    @staticmethod
    def _window(corpus: str, start: int, end: int, chars: int = 55) -> str:
        return corpus[max(0, start - chars): min(len(corpus), end + chars)]

    @staticmethod
    def _has_window_term(window: str, terms: set[str]) -> bool:
        return any(term in window for term in terms)

    @staticmethod
    def _is_negated_mention(corpus: str, start: int, end: int) -> bool:
        before = corpus[max(0, start - 42): start]
        after = corpus[end: min(len(corpus), end + 18)]
        before_terms = {
            "no", "not", "without", "denies", "negative for",
            "pas", "sans", "aucun", "aucune", "absence de", "non",
            "لا", "بدون",
        }
        after_terms = {"absent", "negative", "negatif", "négatif"}
        return any(term in before for term in before_terms) or any(term in after for term in after_terms)

    @staticmethod
    def _labels(mentions: list[dict[str, object]], *, include_negated: bool) -> list[str]:
        labels: list[str] = []
        for mention in mentions:
            if mention.get("negated") and not include_negated:
                continue
            labels.append(str(mention["label"]))
        return list(dict.fromkeys(labels))

    def _section_map(self, consultation: ConsultationInput, runtime_text: str | None) -> dict[str, str]:
        full = runtime_text or " ".join([consultation.doctor_notes or ""] + [turn.text for turn in consultation.transcript])
        normalized = normalize_search_text(full)
        sections: dict[str, str] = {"full": normalized}
        markers = {
            "allergies": ["allergy", "allergie", "حساسية"],
            "medications": ["current medications", "traitement", "medicaments", "médicaments", "prend", "takes"],
            "history": ["antecedent", "antécédent", "history", "terrain"],
        }
        for name, keys in markers.items():
            chunks = []
            for key in keys:
                idx = normalized.find(key)
                if idx >= 0:
                    chunks.append(normalized[idx: idx + 180])
            if chunks:
                sections[name] = " ".join(chunks)
        return sections

    def _infer_conditions(self, symptoms: list[str], disease_tags: list[str], corpus: str) -> list[str]:
        inferred = list(disease_tags)
        symptom_set = set(symptoms)
        if {"fever", "sore throat"}.issubset(symptom_set):
            inferred.append("upper respiratory tract infection")
        if "dyspnea" in symptom_set and "wheezing" in symptom_set:
            inferred.append("asthma exacerbation")
        if "dental abscess" in disease_tags or "dental pain" in symptom_set:
            inferred.append("dental infection")
        if "chest pain" in symptom_set and re.search(r"stemi|infarct|coronar", corpus):
            inferred.append("acute coronary syndrome")
        if "ear pain" in symptom_set:
            inferred.append("otitis media")
        if "back pain" in symptom_set and re.search(r"sciat", corpus):
            inferred.append("sciatica")
        if "fever" in symptom_set and "cough" in symptom_set and "influenza" not in inferred:
            inferred.append("respiratory infection")
        return list(dict.fromkeys(inferred))

    def _extract_context(self, corpus: str, section_map: dict[str, str]) -> dict[str, object]:
        meds = sorted({med for med in self.medication_lexicon if re.search(rf"\b{re.escape(med)}\b", corpus)})
        allergies = self._extract_allergies(corpus, section_map)
        no_known_allergy = any(term in corpus for term in ["no allergy", "no known allergy", "pas d allergy", "pas de allergy", "sans allergie", "aucune allergie", "لا حساسية"])
        pregnancy_negated = any(term in corpus for term in ["not pregnant", "non pregnant", "non enceinte", "pas enceinte", "pas pregnant", "test grossesse negatif", "pregnancy test negative"])
        pregnancy = (not pregnancy_negated) and any(token in corpus for token in ["pregnant", "pregnancy", "grossesse", "enceinte", "حامل"])
        breastfeeding = any(token in corpus for token in ["breastfeeding", "allaitement", "lactation", "ترضع"])
        renal_terms = ["renal impairment", "insuffisance renale", "irc", "kidney", "lithiase", "creatinine", "egfr", "dfg"]
        hepatic_terms = ["hepat", "foie", "liver", "cirrhos", "alat", "asat"]
        renal = self._has_non_negated_context(corpus, renal_terms)
        hepatic = self._has_non_negated_context(corpus, hepatic_terms)
        duration_days = self._extract_duration_days(corpus)
        age_years = self._extract_age(corpus)
        sex_hint = self._extract_sex_hint(corpus)
        return {
            "current_medications": meds,
            "allergies": [] if no_known_allergy else allergies,
            "no_known_allergy": no_known_allergy,
            "pregnancy_mentioned": pregnancy,
            "pregnancy_negated": pregnancy_negated,
            "breastfeeding_mentioned": breastfeeding,
            "renal_mentioned": renal,
            "hepatic_mentioned": hepatic,
            "duration_days": duration_days,
            "age_years_mentioned": age_years,
            "sex_hint": sex_hint,
        }

    def _extract_allergies(self, corpus: str, section_map: dict[str, str]) -> list[str]:
        allergy_source = " ".join([section_map.get("allergies", ""), corpus])
        allergy_patterns = [
            r"allerg(?:y|ie|ies)?(?:\s+to|\s*a|\s*[:=-])?\s+([a-zA-Z\- ]{3,45})",
            r"hassasiya(?:\s+li)?\s+([a-zA-Z\- ]{3,45})",
            r"حساسية(?:\s+ل)?\s+([\w\- ]{2,30})",
        ]
        stop = {"and", "avec", "with", "since", "depuis", "mais", "no", "not", "sans", "aucune"}
        allergies: list[str] = []
        for pat in allergy_patterns:
            for item in re.findall(pat, allergy_source):
                tokens = [tok for tok in normalize_search_text(item).split() if tok not in stop]
                if tokens:
                    allergies.append(" ".join(tokens[:4]))
        # Also catch known medicines in an allergy section.
        allergies.extend([med for med in self.medication_lexicon if med in section_map.get("allergies", "")])
        return list(dict.fromkeys(allergies))

    @staticmethod
    def _extract_duration_days(corpus: str) -> int | None:
        match = re.search(r"(\d{1,3})\s*(day|days|jour|jours|j)\b", corpus)
        if match:
            return int(match.group(1))
        if "since yesterday" in corpus or "depuis hier" in corpus:
            return 1
        if "one week" in corpus or "une semaine" in corpus:
            return 7
        return None

    @staticmethod
    def _extract_age(corpus: str) -> int | None:
        patterns = [r"(\d{1,3})\s*(ans|years? old|yo|y/o)\b", r"age\s*[:=-]?\s*(\d{1,3})"]
        for pat in patterns:
            match = re.search(pat, corpus)
            if match:
                return int(match.group(1))
        return None

    @staticmethod
    def _extract_sex_hint(corpus: str) -> str | None:
        if any(t in corpus for t in ["female", "femme", "woman", "patiente"]):
            return "female"
        if any(t in corpus for t in ["male", "homme", "man", "patient homme"]):
            return "male"
        return None

    @staticmethod
    def _has_non_negated_context(corpus: str, terms: list[str]) -> bool:
        for term in terms:
            for match in re.finditer(rf"\b{re.escape(term)}\b", corpus):
                before = corpus[max(0, match.start() - 40): match.start()]
                after = corpus[match.end(): match.end() + 24]
                if re.search(r"\b(no|not|without|denies|negative for|pas|sans|aucun|aucune|non)\b", before):
                    continue
                if re.search(r"\b(absent|negative|negatif|n[eé]gatif)\b", after):
                    continue
                return True
        return False

    def _missing_info(self, corpus: str, symptoms: list[str], extracted: dict[str, object], unresolved: list[str]) -> list[str]:
        missing: list[str] = []
        if not symptoms:
            missing.append("clear symptom description")
        if extracted.get("duration_days") is None and symptoms:
            missing.append("symptom duration")
        female_context = any(term in corpus for term in ["woman", "female", "femme", "patiente", "grossesse", "enceinte"])
        if female_context and not extracted.get("pregnancy_mentioned") and not extracted.get("pregnancy_negated"):
            missing.append("pregnancy status")
        if not extracted.get("allergies") and not extracted.get("no_known_allergy"):
            missing.append("allergy history")
        if any(tag in corpus for tag in ["diabetes", "hta", "hypertension", "renal impairment", "warfarin", "acenocoumarol"]) and not extracted.get("current_medications"):
            missing.append("current medications")
        if unresolved:
            missing.append("clinical risk clarification")
        return list(dict.fromkeys(missing))

    def _vulnerable_flags(self, corpus: str, extracted: dict[str, object]) -> list[str]:
        flags: list[str] = []
        if extracted.get("pregnancy_mentioned"):
            flags.append("pregnancy")
        if extracted.get("breastfeeding_mentioned"):
            flags.append("breastfeeding")
        if extracted.get("renal_mentioned"):
            flags.append("renal")
        if extracted.get("hepatic_mentioned"):
            flags.append("hepatic")
        age_years = extracted.get("age_years_mentioned")
        if isinstance(age_years, int) and age_years < 18:
            flags.append("pediatric")
        if isinstance(age_years, int) and age_years >= 65:
            flags.append("older_adult")
        if any(term in corpus for term in ["child", "enfant", "pediatric", "bébé", "bebe", "nourrisson"]):
            flags.append("pediatric")
        if any(term in corpus for term in ["older", "elderly", "agé", "agee", "aged", "personne agee"]):
            flags.append("older_adult")
        return list(dict.fromkeys(flags))

    def _unresolved_flags(self, corpus: str, symptoms: list[str], disease_tags: list[str], extracted: dict[str, object]) -> list[str]:
        flags: list[str] = []
        if "dyspnea" in symptoms and extracted.get("duration_days") is None:
            flags.append("dyspnea_without_duration")
        if "chest pain" in symptoms and "stemi" not in disease_tags:
            flags.append("chest_pain_requires_triage")
        if "renal disease" in disease_tags and not extracted.get("current_medications"):
            flags.append("renal_case_requires_medication_review")
        if "depression" in disease_tags and "suicidal ideation" not in symptoms:
            flags.append("depression_safety_screen_required")
        if extracted.get("pregnancy_mentioned") and not any(tag in disease_tags for tag in ["preeclampsia"]):
            flags.append("pregnancy_medication_review_required")
        return flags

    def _red_flags(self, corpus: str, symptoms: list[str], diseases: list[str], mentions: list[dict[str, object]]) -> list[str]:
        flags: list[str] = []
        if "stemi" in diseases or "acute coronary syndrome" in corpus:
            flags.append("suspected_acute_coronary_syndrome")
        if "preeclampsia" in diseases:
            flags.append("suspected_preeclampsia")
        if "suicidal ideation" in symptoms:
            flags.append("suicidal_ideation")
        if "chest pain" in symptoms and any(term in corpus for term in [
            "dyspnea", "dyspnee", "dyspnée", "sweating", "sueurs", "sueur", "radiation", "bras gauche", "left arm",
            "syncope", "t3arra9", "t3araq", "ta3raq", "ta3req", "3araq", "3ra9", "3are9",
            "yedi lisra", "yeddi lisra", "yed lissar", "ktaf lisar", "ketfi lisar",
            "عرق", "تعرق", "يدي اليسرى", "ذراعي اليسرى", "الذراع اليسرى",
        ]):
            flags.append("high_risk_chest_pain")
        if "dyspnea" in symptoms and any(term in corpus for term in ["severe", "grave", "cyanosis", "sat", "spo2", "repos", "rest", "confusion"]):
            flags.append("severe_dyspnea")
        if any("anaphyl" in str(m.get("span", "")) for m in mentions) or "anaphyl" in corpus:
            flags.append("possible_anaphylaxis")
        return list(dict.fromkeys(flags))

    @staticmethod
    def _quality_report(corpus: str, symptom_mentions: list[dict[str, object]], disease_mentions: list[dict[str, object]], extracted: dict[str, object], missing: list[str], red_flags: list[str]) -> dict[str, object]:
        active_mentions = [m for m in symptom_mentions + disease_mentions if not m.get("negated")]
        negated_mentions = [m for m in symptom_mentions + disease_mentions if m.get("negated")]
        uncertain_mentions = [m for m in symptom_mentions + disease_mentions if m.get("uncertain")]
        score = 1.0
        if not active_mentions:
            score -= 0.35
        if "clear symptom description" in missing:
            score -= 0.25
        if len(missing) >= 3:
            score -= 0.2
        if uncertain_mentions:
            score -= 0.1
        if len(corpus) < 20:
            score -= 0.2
        score = max(0.0, round(score, 2))
        return {
            "extraction_confidence": score,
            "active_entity_count": len(active_mentions),
            "negated_entity_count": len(negated_mentions),
            "uncertain_entity_count": len(uncertain_mentions),
            "red_flag_count": len(red_flags),
            "medication_count": len(extracted.get("current_medications", [])),
            "allergy_count": len(extracted.get("allergies", [])),
            "requires_review_due_to_low_confidence": score < 0.65,
        }

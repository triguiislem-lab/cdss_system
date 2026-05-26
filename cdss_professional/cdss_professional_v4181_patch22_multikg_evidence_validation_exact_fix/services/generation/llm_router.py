from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib import error, request

from libs.contracts.evidence import EvidenceBundle
from libs.contracts.patient import PatientSnapshot
from libs.utils.medical_text import normalize_search_text
from services.generation.candidate_selector import CandidateSelector
from services.generation.therapy_strategy import TherapyStrategyDetector
from services.generation.notebook_templates import NOTEBOOK_DERIVED_SYSTEM_PROMPT
from services.llm.qwen_provider import get_shared_transformers_lm


class LLMRouter:
    """Notebook-derived drafting router with configurable backends.

    Backends:
    - ``notebook_heuristic``: offline-safe, evidence-grounded drafting path
    - ``stub``: legacy canned responses for deterministic demos
    - ``openai_compatible`` / ``hf_router``: OpenAI-style chat completions HTTP API
    - ``transformers``: local Hugging Face causal LM inference
    - ``llama_cpp``: local GGUF inference when llama-cpp-python is installed

    External backends may fall back to the notebook heuristic only as an audited draft path; final doctor validation remains mandatory.
    """

    def __init__(
        self,
        backend: str = "notebook_heuristic",
        cases_path: Path | None = None,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        system_prompt: str | None = None,
        temperature: float = 0.0,
        max_output_tokens: int = 800,
        timeout_seconds: float = 45.0,
        transformers_device_map: str = "auto",
        transformers_dtype: str = "auto",
        trust_remote_code: bool = True,
        llama_cpp_model_path: str | None = None,
        llama_cpp_n_gpu_layers: int = 0,
    ) -> None:
        self.backend = backend
        self.cases_path = cases_path or Path(__file__).resolve().parents[2] / "examples" / "demo_fixtures" / "generation_stub_cases.json"
        if self.cases_path.exists():
            payload = json.loads(self.cases_path.read_text(encoding="utf-8"))
        else:
            payload = {
                "cases": [],
                "default_response": (
                    "problem_summary: Clinician review required\n"
                    "triage: clinician_review\n"
                    "confidence: 0.40\n"
                    "note: generation demo fixture missing; notebook heuristic fallback used"
                ),
            }
        self.cases = payload.get("cases", [])
        self.default_response = payload.get(
            "default_response",
            "problem_summary: Clinician review required\ntriage: clinician_review\nconfidence: 0.40",
        )
        self.model = model or ""
        self.base_url = base_url or ""
        self.api_key = api_key or ""
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.timeout_seconds = timeout_seconds
        self.transformers_device_map = transformers_device_map
        self.transformers_dtype = transformers_dtype
        self.trust_remote_code = trust_remote_code
        self.llama_cpp_model_path = llama_cpp_model_path or ""
        self.llama_cpp_n_gpu_layers = llama_cpp_n_gpu_layers
        self.strategy_detector = TherapyStrategyDetector()
        self.candidate_selector = CandidateSelector()

    def generate_structured_text(
        self,
        prompt: str,
        *,
        snapshot: PatientSnapshot | None = None,
        evidence: EvidenceBundle | None = None,
        system_prompt_override: str | None = None,
    ) -> str:
        system_prompt = system_prompt_override or self.system_prompt
        if self.backend in {"notebook_heuristic", "heuristic"} and snapshot is not None and evidence is not None:
            return self._generate_from_context(snapshot, evidence) + "\nnote: llm_backend_unavailable=true; fallback_used=notebook_heuristic; allowed_only_for_controlled_or_review_draft_cases"
        if self.backend == "llama_cpp":
            text = self._generate_with_llama_cpp(prompt, system_prompt=system_prompt)
            if text:
                return self._mark_model_generation(text, "llama_cpp", self.model or self.llama_cpp_model_path)
        if self.backend in {"transformers", "hf_transformers", "local_transformers"}:
            text = self._generate_with_transformers(prompt, system_prompt=system_prompt)
            if text:
                if snapshot is not None and evidence is not None and not _has_parseable_medication_output(text):
                    fallback = self._generate_from_context(snapshot, evidence)
                    text = "\n".join(
                        [
                            text.rstrip(),
                            "note: llm_output_unparseable_or_empty=true; evidence-grounded notebook fallback appended for structured dosing.",
                            fallback,
                        ]
                    )
                return self._mark_model_generation(text, "transformers", self.model)
        if self.backend in {"openai_compatible", "hf_router"}:
            text = self._generate_with_http_chat(prompt, system_prompt=system_prompt)
            if text:
                return self._mark_model_generation(text, self.backend, self.model)
        if self.backend == "stub":
            return self._fallback_from_prompt(prompt)
        if snapshot is not None and evidence is not None:
            return self._generate_from_context(snapshot, evidence)
        return self._fallback_from_prompt(prompt)

    def _generate_with_http_chat(self, prompt: str, *, system_prompt: str | None = None) -> str | None:
        if not self.base_url or not self.model:
            return None
        url = self.base_url.rstrip("/")
        if not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt or self.system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_output_tokens,
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except (error.URLError, TimeoutError, json.JSONDecodeError):
            return None
        try:
            return raw["choices"][0]["message"]["content"]
        except Exception:
            return None

    def _generate_with_llama_cpp(self, prompt: str, *, system_prompt: str | None = None) -> str | None:
        if not self.llama_cpp_model_path:
            return None
        try:
            llm = _get_llama(self.llama_cpp_model_path, self.llama_cpp_n_gpu_layers)
            result = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt or self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=self.temperature,
                max_tokens=self.max_output_tokens,
            )
            return result["choices"][0]["message"]["content"]
        except Exception:
            return None

    def _generate_with_transformers(self, prompt: str, *, system_prompt: str | None = None) -> str | None:
        if not self.model:
            return None
        try:
            tokenizer, model = get_shared_transformers_lm(
                self.model,
                self.transformers_device_map,
                self.transformers_dtype,
                self.trust_remote_code,
            )
        except Exception:
            return None

        messages = [
            {"role": "system", "content": system_prompt or self.system_prompt},
            {"role": "user", "content": prompt},
        ]
        try:
            if hasattr(tokenizer, "apply_chat_template"):
                try:
                    rendered = tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True,
                        enable_thinking=False,
                    )
                except TypeError:
                    rendered = tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True,
                    )
            else:
                rendered = f"{system_prompt or self.system_prompt}\n\n{prompt}\n\nAssistant:"
            inputs = tokenizer(rendered, return_tensors="pt")
            try:
                device = next(model.parameters()).device
                inputs = {key: value.to(device) for key, value in inputs.items()}
            except Exception:
                pass
            generate_kwargs = {
                "max_new_tokens": self.max_output_tokens,
                "do_sample": self.temperature > 0,
                "pad_token_id": tokenizer.eos_token_id,
            }
            if self.temperature > 0:
                generate_kwargs["temperature"] = self.temperature
            output_ids = model.generate(**inputs, **generate_kwargs)
            prompt_len = inputs["input_ids"].shape[-1]
            generated = output_ids[0][prompt_len:]
            return tokenizer.decode(generated, skip_special_tokens=True).strip()
        except Exception:
            return None

    def _fallback_from_prompt(self, prompt: str) -> str:
        lower_prompt = prompt.lower()
        for case in self.cases:
            if any(token.lower() in lower_prompt for token in case["match_any"]):
                return case["response"]
        return self.default_response

    @staticmethod
    def _mark_model_generation(text: str, backend: str, model: str) -> str:
        marker = f"note: llm_model_used=true backend={backend} model={model or 'unknown'}"
        if marker in text:
            return text
        return f"{text.rstrip()}\n{marker}"

    def _generate_from_context(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> str:
        strategy = self.strategy_detector.detect(snapshot, evidence)
        strategy_name = strategy["strategy"]

        if strategy_name == "non_pharma":
            return self._render_non_pharma(snapshot, strategy)
        if strategy_name == "emergency":
            return self._render_emergency(snapshot, strategy)

        candidates = self.candidate_selector.select(snapshot, evidence, strategy_name)
        if strategy_name == "review" and not snapshot.normalized_symptoms:
            return self._render_review_only(snapshot, strategy)
        return self._render_medication_plan(snapshot, evidence, strategy, candidates)

    def generate_fallback_text(self, snapshot: PatientSnapshot, evidence: EvidenceBundle) -> str:
        return self._generate_from_context(snapshot, evidence)

    def _render_non_pharma(self, snapshot: PatientSnapshot, strategy: dict[str, str]) -> str:
        return "\n".join(
            [
                "problem_summary: Likely non-pharmacologic or device-focused issue requiring clinician-directed management",
                "triage: specialist_review",
                "confidence: 0.62",
                "non_drug: arrange targeted examination and non-drug corrective management",
                "monitoring: confirm diagnosis before any medication decision",
                "question: specify the exact functional complaint and objective findings",
                f"note: notebook-derived strategy={strategy['strategy']} reason={strategy['reason']}",
                "note: no medication draft generated because the case appears non-pharmacologic",
            ]
        )

    def _render_emergency(self, snapshot: PatientSnapshot, strategy: dict[str, str]) -> str:
        return "\n".join(
            [
                "problem_summary: Red-flag or emergency pattern detected; automated outpatient prescription draft is not appropriate",
                "triage: emergency_referral",
                "confidence: 0.86",
                "non_drug: urgent clinician escalation or emergency referral",
                "monitoring: reassess airway, breathing, circulation, vital signs, and red flags immediately",
                "question: document onset, severity, associated red flags, and time-critical actions already taken",
                f"note: notebook-derived strategy={strategy['strategy']} reason={strategy['reason']}",
                "note: medication draft intentionally suppressed for this emergency-like presentation",
            ]
        )

    def _render_review_only(self, snapshot: PatientSnapshot, strategy: dict[str, str]) -> str:
        return "\n".join(
            [
                "problem_summary: Medication or chronic-disease review context identified without a clear acute prescribing target",
                "triage: clinician_review",
                "confidence: 0.58",
                "non_drug: review current regimen, adherence, and recent laboratory values",
                "monitoring: verify renal function, hepatic function, pregnancy status, and current treatment goals",
                "question: specify the acute complaint or therapeutic target before adding new medication",
                f"note: notebook-derived strategy={strategy['strategy']} reason={strategy['reason']}",
                "note: no new medication proposed because the context is primarily review/adjustment oriented",
            ]
        )

    def _render_medication_plan(
        self,
        snapshot: PatientSnapshot,
        evidence: EvidenceBundle,
        strategy: dict[str, str],
        candidates: list[dict],
    ) -> str:
        lines: list[str] = []
        summary = self._problem_summary(snapshot, strategy)
        triage = "outpatient_follow_up" if strategy["strategy"] == "symptomatic" else "clinician_review"
        confidence = self._confidence(candidates, evidence, strategy["strategy"])
        lines.append(f"problem_summary: {summary}")
        lines.append(f"triage: {triage}")
        lines.append(f"confidence: {confidence:.2f}")

        emitted = 0
        for candidate in candidates:
            regimen = self._regimen_for(candidate["ingredient"], snapshot)
            if regimen is None:
                continue
            lines.append(
                "medication: {ingredient} | {indication} | {dose} | {frequency} | {duration} | {route} | {rationale}".format(
                    ingredient=regimen["ingredient"],
                    indication=regimen["indication"],
                    dose=regimen["dose"],
                    frequency=regimen["frequency"],
                    duration=regimen["duration"],
                    route=regimen["route"],
                    rationale=regimen["rationale"],
                )
            )
            for support in candidate.get("supports", [])[:3]:
                lines.append(f"support: {regimen['ingredient']} | {support['source']} | {support['note']}")
            emitted += 1
            if emitted >= 2:
                break

        for item in self._non_drug_recommendations(snapshot):
            lines.append(f"non_drug: {item}")
        for item in self._monitoring_recommendations(snapshot, strategy["strategy"]):
            lines.append(f"monitoring: {item}")
        for item in self._questions(snapshot, strategy["strategy"]):
            lines.append(f"question: {item}")
        lines.append(f"note: notebook-derived strategy={strategy['strategy']} reason={strategy['reason']}")
        lines.append("note: evidence-grounded heuristic drafting path used in place of the old canned stub response")
        if emitted == 0:
            lines.append("note: no medication candidate cleared the notebook-inspired selection threshold")
        return "\n".join(lines)

    def _problem_summary(self, snapshot: PatientSnapshot, strategy: dict[str, str]) -> str:
        if snapshot.suspected_conditions:
            return ", ".join(snapshot.suspected_conditions)
        if snapshot.normalized_symptoms:
            if strategy["strategy"] == "symptomatic":
                return f"Symptomatic management target: {', '.join(snapshot.normalized_symptoms)}"
            return ", ".join(snapshot.normalized_symptoms)
        return "Consultation requiring clinician review"

    @staticmethod
    def _confidence(candidates: list[dict], evidence: EvidenceBundle, strategy: str) -> float:
        base = 0.46 if strategy == "review" else 0.52
        if strategy == "symptomatic":
            base += 0.10
        if evidence.vector_chunks:
            base += 0.05
        if evidence.graph_facts:
            base += 0.04
        if evidence.local_products:
            base += 0.05
        if candidates:
            base += min(0.14, float(candidates[0]["score"]) * 0.18)
        return max(0.30, min(0.89, base))

    def _regimen_for(self, ingredient: str, snapshot: PatientSnapshot) -> dict[str, str] | None:
        ingredient = normalize_search_text(ingredient)
        symptoms_blob = normalize_search_text(" ".join(snapshot.normalized_symptoms + snapshot.suspected_conditions))

        if ingredient == "paracetamol":
            dose = "500 mg"
            frequency = "every 8 hours"
            duration = "3 days"
            rationale = "First-line symptomatic relief favored by the notebook-derived heuristic when NSAID risk or viral/URTI features are present"
            if snapshot.patient.hepatic_impairment:
                dose = "500 mg"
                frequency = "every 12 hours"
                duration = "2 days"
                rationale = "Lower-intensity paracetamol draft because hepatic impairment requires extra caution"
            return {
                "ingredient": "paracetamol",
                "indication": "symptomatic relief",
                "dose": dose,
                "frequency": frequency,
                "duration": duration,
                "route": "oral",
                "rationale": rationale,
            }

        if ingredient == "ibuprofen":
            return {
                "ingredient": "ibuprofen",
                "indication": "pain relief",
                "dose": "400 mg",
                "frequency": "every 8 hours",
                "duration": "3 days",
                "route": "oral",
                "rationale": "Symptomatic NSAID option selected only when the notebook-derived risk screen does not detect pregnancy, renal, anticoagulation, or NSAID-allergy concerns",
            }

        if ingredient == "salbutamol":
            return {
                "ingredient": "salbutamol",
                "indication": "bronchospasm relief",
                "dose": "100 mcg/dose",
                "frequency": "as needed",
                "duration": "5 days",
                "route": "inhalation",
                "rationale": "Selected from local/graph evidence for bronchospasm-like context and aligned to inhaled rescue use",
            }

        if ingredient == "cetirizine":
            return {
                "ingredient": "cetirizine",
                "indication": "allergic rhinitis or urticaria symptom relief",
                "dose": "10 mg",
                "frequency": "once daily",
                "duration": "3 to 5 days",
                "route": "oral",
                "rationale": "Controlled antihistamine draft retained only for clinician validation.",
            }

        if ingredient == "omeprazole":
            return {
                "ingredient": "omeprazole",
                "indication": "reflux or dyspepsia symptom relief",
                "dose": "20 mg",
                "frequency": "once daily before meal",
                "duration": "short course; clinician to confirm",
                "route": "oral",
                "rationale": "Controlled PPI draft retained only after clinician checks alarm symptoms and interactions.",
            }

        if ingredient == "oral rehydration salts" or ingredient == "oral_rehydration_salts":
            return {
                "ingredient": "oral_rehydration_salts",
                "indication": "dehydration prevention/supportive oral rehydration",
                "dose": "standard sachet diluted as directed",
                "frequency": "after each loose stool or as clinically indicated",
                "duration": "until hydration restored; clinician to confirm",
                "route": "oral",
                "rationale": "Supportive oral rehydration draft for clinician validation.",
            }

        if ingredient == "dextromethorphan" and "cough" in symptoms_blob:
            return {
                "ingredient": "dextromethorphan",
                "indication": "cough relief",
                "dose": "15 mg",
                "frequency": "every 8 hours",
                "duration": "3 days",
                "route": "oral",
                "rationale": "Heuristic cough-suppression option when retrieved evidence mentions symptomatic management",
            }

        return None

    @staticmethod
    def _non_drug_recommendations(snapshot: PatientSnapshot) -> list[str]:
        symptoms = set(snapshot.normalized_symptoms)
        recs = ["maintain hydration"]
        if symptoms.intersection({"fever", "sore throat", "cough"}):
            recs.append("rest and supportive self-care")
        if "sore throat" in symptoms:
            recs.append("warm fluids or salt-water gargles if appropriate")
        return recs[:3]

    @staticmethod
    def _monitoring_recommendations(snapshot: PatientSnapshot, strategy: str) -> list[str]:
        monitoring = []
        if "fever" in snapshot.normalized_symptoms:
            monitoring.append("reassess if fever persists more than 3 days or red flags appear")
        if strategy == "review":
            monitoring.append("verify recent laboratory values before approving any regimen change")
        if snapshot.patient.pregnant:
            monitoring.append("confirm gestational context before final approval")
        return monitoring or ["confirm clinical evolution and tolerance after clinician review"]

    @staticmethod
    def _questions(snapshot: PatientSnapshot, strategy: str) -> list[str]:
        questions = list(snapshot.missing_critical_information)
        if not snapshot.normalized_symptoms:
            questions.append("clarify the main symptom and its severity")
        if strategy == "symptomatic":
            questions.append("confirm duration, measured temperature, and presence of dyspnea or bacterial features")
        if snapshot.patient.renal_impairment:
            questions.append("add recent renal function values to support dose review")
        return questions[:4]


@lru_cache(maxsize=2)
def _get_llama(model_path: str, n_gpu_layers: int):
    from llama_cpp import Llama  # type: ignore

    return Llama(
        model_path=model_path,
        n_gpu_layers=n_gpu_layers,
        n_ctx=4096,
        verbose=False,
    )


def _has_parseable_medication_output(text: str) -> bool:
    lowered = text.lower()
    if "unspecified" in lowered and not _has_complete_dosing_signal(lowered):
        return False
    if "medication:" in lowered:
        return _has_complete_dosing_signal(lowered)
    if any(key in lowered for key in ['"medications"', '"draft_medications"', '"active_ingredient"', '"dci"']):
        return _has_complete_dosing_signal(lowered)
    if re.search(r"\b(paracetamol|acetaminophen|salbutamol|albuterol|ibuprofen)\b", lowered) and re.search(
        r"\d+\s*(mg|mcg|µg|g)\b", lowered
    ):
        return _has_complete_dosing_signal(lowered)
    if "## proposed prescription" not in lowered:
        return False
    for line in text.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if (
            len(cells) >= 6
            and cells[0]
            and "drug" not in cells[0].lower()
            and set("".join(cells)) != {"-"}
            and _has_complete_dosing_signal(" ".join(cells))
        ):
            return True
    return False


def _has_complete_dosing_signal(text: str) -> bool:
    has_dose = re.search(r"\d+\s*(mg|mcg|µg|µg|g|ml)\b", text, flags=re.I) is not None
    has_frequency = re.search(
        r"(every\s+\d+\s+hours|q\d+h|as needed|si besoin|daily|per day|/day|x\s*\d|toutes?\s+les\s+\d+\s+heures|\d+\s+fois\s+par\s+jour)",
        text,
        flags=re.I,
    ) is not None
    has_duration = re.search(r"(?:pendant|durant)?\s*\d+\s*(days?|jours?|weeks?|semaines?)", text, flags=re.I) is not None
    return bool(has_dose and has_frequency and has_duration)


DEFAULT_SYSTEM_PROMPT = NOTEBOOK_DERIVED_SYSTEM_PROMPT

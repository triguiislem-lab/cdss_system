from __future__ import annotations

from libs.contracts.patient import ConsultationInput, PatientProfile, PatientSnapshot
from services.clinical_understanding.llm_extractor import Level1ExtractionReconciler, Level1Extractor
from services.clinical_understanding.parser import ConsultationParser
from services.clinical_understanding.patient_state_builder import PatientStateBuilder
from services.clinical_understanding.risk_extractor import RiskExtractor
from services.clinical_understanding.router import ProductionRouter
from services.clinical_understanding.translator import TranslationStep
from services.llm.policy import should_run_level1_llm


class ClinicalUnderstandingService:
    """High-level entrypoint for patient + consultation normalization.

    Level 1 extraction is deliberately hybrid-ready:
    - deterministic parser is always the baseline;
    - optional Qwen-assisted extraction can enrich explicit facts;
    - reconciliation metadata is stored in snapshot.extracted_context.
    """

    def __init__(
        self,
        parser: ConsultationParser | None = None,
        state_builder: PatientStateBuilder | None = None,
        risk_extractor: RiskExtractor | None = None,
        translator: TranslationStep | None = None,
        router: ProductionRouter | None = None,
        llm_extractor: Level1Extractor | None = None,
        llm_extraction_mode: str = "assist",
        llm_extraction_policy: str = "selective",
        extraction_reconciler: Level1ExtractionReconciler | None = None,
    ) -> None:
        self.parser = parser or ConsultationParser()
        self.state_builder = state_builder or PatientStateBuilder()
        self.risk_extractor = risk_extractor or RiskExtractor()
        self.translator = translator or TranslationStep()
        self.router = router or ProductionRouter()
        self.llm_extractor = llm_extractor
        self.llm_extraction_mode = llm_extraction_mode
        self.llm_extraction_policy = llm_extraction_policy
        self.extraction_reconciler = extraction_reconciler or Level1ExtractionReconciler()

    def build_snapshot(
        self,
        patient: PatientProfile,
        consultation: ConsultationInput | None,
    ) -> PatientSnapshot:
        consultation = consultation or ConsultationInput(language="fr", transcript=[])
        normalized_consultation = self.translator.normalize(consultation)
        runtime_text = self.translator.runtime_text(normalized_consultation)
        parsed = self.parser.parse(normalized_consultation, runtime_text=runtime_text)
        llm_payload = None
        llm_context = {
            "enabled": bool(self.llm_extractor),
            "mode": self.llm_extraction_mode,
            "status": "not_configured" if self.llm_extractor is None else "configured",
        }
        if self.llm_extractor is not None:
            should_run, policy_reason = should_run_level1_llm(
                parsed,
                runtime_text,
                mode=self.llm_extraction_mode,
                policy=self.llm_extraction_policy,
            )
            llm_context.update({
                "policy": self.llm_extraction_policy,
                "policy_reason": policy_reason,
                "selected_for_llm": should_run,
            })
            if should_run:
                try:
                    llm_payload = self.llm_extractor.extract(normalized_consultation, runtime_text=runtime_text)
                    reconciliation = self.extraction_reconciler.reconcile(parsed, llm_payload, mode=self.llm_extraction_mode)
                    parsed = reconciliation.parsed
                    llm_context = reconciliation.metadata
                    llm_context.update({
                        "policy": self.llm_extraction_policy,
                        "policy_reason": policy_reason,
                        "selected_for_llm": True,
                    })
                except Exception as exc:
                    llm_context = {
                        "enabled": True,
                        "mode": self.llm_extraction_mode,
                        "policy": self.llm_extraction_policy,
                        "policy_reason": policy_reason,
                        "selected_for_llm": True,
                        "status": "error",
                        "error_type": type(exc).__name__,
                        "error": str(exc)[:240],
                    }
            else:
                llm_context["status"] = "skipped_by_policy"
        extracted_context = dict(parsed.get("extracted_context", {}) or {})
        extracted_context["translation_model_status"] = getattr(self.translator, "last_model_status", "unknown")
        extracted_context["llm_level1_extraction"] = llm_context
        risk_flags = self.risk_extractor.extract(patient, parsed=parsed)
        provisional = self.state_builder.build(
            patient=patient,
            consultation=normalized_consultation,
            normalized_symptoms=parsed["symptoms"],
            suspected_conditions=parsed["suspected_conditions"],
            missing_critical_information=parsed["missing_critical_information"],
            risk_flags=risk_flags,
            normalized_runtime_text=parsed["runtime_text"],
            disease_tags=parsed.get("disease_tags", []),
            vulnerable_flags=parsed.get("vulnerable_flags", []),
            route_recommendation="prescription",
            extracted_context=extracted_context,
        )
        route_debug = self.router.explain(provisional)
        extracted_context.update(
            {
                "route_reason": route_debug.get("route_reason"),
                "blocking_reason": route_debug.get("blocking_reason"),
                "review_triggers": route_debug.get("review_triggers", []),
                "missing_critical_information": list(provisional.missing_critical_information),
            }
        )
        return provisional.model_copy(
            update={
                "route_recommendation": route_debug["route"],
                "extracted_context": extracted_context,
            }
        )

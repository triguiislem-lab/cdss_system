from __future__ import annotations

from libs.config.runtime import RuntimePipelineConfig
from libs.contracts.commands import DraftPrescriptionCommand
from libs.contracts.evidence import EvidenceBundle
from libs.contracts.execution import ExecutionPlan, PipelineExecutionRecord, WorkflowStage
from libs.contracts.prescription import PrescriptionProposal, TherapeuticPlan
from libs.utils.tracing import generate_trace_id
from services.audit.service import AuditService
from services.clinical_understanding.service import ClinicalUnderstandingService
from services.generation.service import GenerationService
from services.generation.target_guardrails import TargetGuardrailService
from services.localization.service import LocalizationService
from services.safety.post_generation_validator import PostGenerationSafetyValidator
from services.order_extraction.service import MedicalOrderExtractionService
from services.orchestration.action_builder import ClinicalActionBuilder
from services.orchestration.stage_runner import StageRunner
from services.planning.execution_planner import ExecutionPlanner
from services.retrieval.service import RetrievalService
from services.safety.policy_engine import SafetyPolicyEngine
from services.safety.service import SafetyService


def _align_snapshot_with_execution_plan(snapshot, execution_plan: ExecutionPlan):
    """Make snapshot route reflect the final deterministic planner route.

    Evaluation notebooks and downstream clients sometimes read snapshot.route_recommendation
    before checking execution_plan.route.  Patch15 keeps these fields consistent so
    a blocked/review/emergency plan cannot still look like route=prescription.
    """
    if execution_plan is None:
        return snapshot
    route = getattr(execution_plan, "route", None)
    if route in {"prescription", "review", "emergency", "non_pharma"} and getattr(snapshot, "route_recommendation", None) != route:
        ctx = dict(getattr(snapshot, "extracted_context", {}) or {})
        ctx.setdefault("pre_planner_route_recommendation", getattr(snapshot, "route_recommendation", None))
        ctx["final_execution_route"] = route
        ctx["final_display_route"] = getattr(execution_plan, "display_route", None) or getattr(execution_plan, "sub_route", None)
        ctx["execution_allowed_to_generate"] = bool(getattr(execution_plan, "allowed_to_generate", False))
        ctx["execution_target_ingredients"] = list(getattr(execution_plan, "target_ingredients", []) or [])
        ctx["execution_forbidden_ingredients"] = list(getattr(execution_plan, "forbidden_ingredients", []) or [])
        ctx["execution_required_patient_data"] = list(getattr(execution_plan, "required_patient_data", []) or [])
        return snapshot.model_copy(update={"route_recommendation": route, "extracted_context": ctx})
    return snapshot

class PrescriptionPipeline:
    """End-to-end orchestration pipeline with explicit ExecutionPlan."""

    def __init__(
        self,
        config: RuntimePipelineConfig | None = None,
        clinical_understanding: ClinicalUnderstandingService | None = None,
        retrieval: RetrievalService | None = None,
        generation: GenerationService | None = None,
        safety: SafetyService | None = None,
        localization: LocalizationService | None = None,
        audit: AuditService | None = None,
        stage_runner: StageRunner | None = None,
        execution_planner: ExecutionPlanner | None = None,
        target_guardrails: TargetGuardrailService | None = None,
        clinical_action_builder: ClinicalActionBuilder | None = None,
        medical_order_extractor: MedicalOrderExtractionService | None = None,
        post_generation_validator: PostGenerationSafetyValidator | None = None,
        safety_policy_engine: SafetyPolicyEngine | None = None,
    ) -> None:
        self.config = config or RuntimePipelineConfig()
        self.clinical_understanding = clinical_understanding or ClinicalUnderstandingService()
        self.retrieval = retrieval or RetrievalService()
        self.generation = generation or GenerationService()
        self.safety = safety or SafetyService()
        self.localization = localization or LocalizationService()
        self.audit = audit or AuditService()
        self.stage_runner = stage_runner or StageRunner()
        self.execution_planner = execution_planner or ExecutionPlanner(policy_mode=self.config.safety_policy_mode)
        self.target_guardrails = target_guardrails or TargetGuardrailService()
        self.clinical_action_builder = clinical_action_builder or ClinicalActionBuilder()
        self.medical_order_extractor = medical_order_extractor or MedicalOrderExtractionService()
        self.post_generation_validator = post_generation_validator or PostGenerationSafetyValidator()
        self.safety_policy_engine = safety_policy_engine or SafetyPolicyEngine()

    def draft(self, command: DraftPrescriptionCommand) -> PipelineExecutionRecord:
        trace_id = generate_trace_id()
        self.stage_runner.reset()

        snapshot = self.stage_runner.run(WorkflowStage.CLINICAL_UNDERSTANDING, self.clinical_understanding.build_snapshot, command.patient, command.consultation)

        # V4.18.1: medical-order extraction must run before planning so the
        # SafetyPolicyEngine can distinguish patient-requested, already-taken,
        # doctor-authorized and merely mentioned medications.
        medical_order_extraction = {}
        moe = None
        moe_mode = (self.config.medical_order_extraction_mode or "off").lower()
        if moe_mode != "off":
            moe = self.stage_runner.run(WorkflowStage.MEDICAL_ORDER_EXTRACTION, self.medical_order_extractor.extract, snapshot)
            medical_order_extraction = moe.model_dump(mode="json")
        else:
            self.stage_runner.skip(WorkflowStage.MEDICAL_ORDER_EXTRACTION, "Medical-order extraction disabled by runtime config.")

        policy_decision = None
        policy_mode = (self.config.safety_policy_mode or "off").lower()
        if policy_mode != "off":
            policy_decision = self.stage_runner.run(WorkflowStage.SAFETY_POLICY, self.safety_policy_engine.evaluate, snapshot, medical_orders=moe)
        else:
            self.stage_runner.skip(WorkflowStage.SAFETY_POLICY, "Safety policy engine disabled by runtime config.")

        execution_plan = self.stage_runner.run(
            WorkflowStage.EXECUTION_PLANNING,
            self.execution_planner.plan,
            snapshot,
            medical_orders=moe,
            policy_decision=policy_decision,
        )

        if moe is not None:
            execution_plan = execution_plan.model_copy(update={
                "medical_order_audit": {
                    "mode": moe_mode,
                    "pre_planning": True,
                    "requested_medications": moe.requested_medications,
                    "already_taken_medications": moe.already_taken_medications,
                    "authorized_medications": moe.authorized_medications,
                    "requested_therapeutic_classes": moe.requested_therapeutic_classes,
                    "authorized_therapeutic_classes": moe.authorized_therapeutic_classes,
                    "case_type": moe.case_type,
                    "therapeutic_class_mentions": [m.model_dump(mode="json") for m in moe.therapeutic_class_mentions],
                    "symptom_mentions": [m.model_dump(mode="json") for m in moe.symptom_mentions],
                    "red_flag_mentions": [m.model_dump(mode="json") for m in moe.red_flag_mentions],
                    "diagnostics": moe.diagnostics,
                }
            })

        snapshot = _align_snapshot_with_execution_plan(snapshot, execution_plan)

        if "retrieval" in execution_plan.required_modules:
            evidence = self.stage_runner.run(WorkflowStage.RETRIEVAL, self.retrieval.build_evidence, snapshot, self.config, execution_plan=execution_plan)
        else:
            evidence = EvidenceBundle(
                merged_summary=f"Retrieval skipped by ExecutionPlan: {execution_plan.planner_reason}",
                retrieval_diagnostics={"retrieval_skipped": True, "skip_reason": execution_plan.planner_reason},
            )
            self.stage_runner.skip(WorkflowStage.RETRIEVAL, execution_plan.planner_reason)

        if execution_plan.allowed_to_generate and "generation" in execution_plan.required_modules:
            draft_plan = self.stage_runner.run(WorkflowStage.GENERATION, self.generation.draft, snapshot, evidence)
        else:
            draft_plan = self.stage_runner.run(WorkflowStage.GENERATION, self._build_review_or_skip_plan, snapshot, execution_plan)

        draft_plan = self._enforce_contract_states(snapshot, draft_plan, execution_plan)
        draft_plan = self.target_guardrails.enforce(snapshot, draft_plan, execution_plan)

        post_generation_validation = {}
        pgv_mode = (self.config.post_generation_validator_mode or "off").lower()
        if pgv_mode != "off":
            draft_plan, pgv = self.post_generation_validator.validate(snapshot, draft_plan, execution_plan, mode=pgv_mode)
            post_generation_validation = pgv.model_dump(mode="json")
            execution_plan = execution_plan.model_copy(update={"post_generation_validation_audit": post_generation_validation})

        safety = self.stage_runner.run(WorkflowStage.SAFETY, self.safety.validate, snapshot, draft_plan)

        review_draft_allowed = getattr(execution_plan, "sub_route", None) == "review_draft_allowed"
        empty_prescription_plan = execution_plan.route == "prescription" and not draft_plan.medications
        empty_allowed_generation_plan = (
            execution_plan.allowed_to_generate
            and bool(getattr(execution_plan, "target_ingredients", []) or [])
            and not draft_plan.medications
        )
        blocked = (
            safety.has_blocking_issue
            or empty_prescription_plan
            or empty_allowed_generation_plan
            or execution_plan.route in {"emergency", "non_pharma", "blocked"}
            or (execution_plan.route == "review" and not review_draft_allowed)
        )

        localization_skipped_reason = None
        if not execution_plan.localization_required or (blocked and not self.config.localize_blocked_plans):
            localized = []
            localization_skipped_reason = self._skip_reason(snapshot, safety, execution_plan)
            self.stage_runner.skip(WorkflowStage.LOCALIZATION, localization_skipped_reason)
        else:
            localized = self.stage_runner.run(WorkflowStage.LOCALIZATION, self.localization.localize, draft_plan, evidence)

        proposal = PrescriptionProposal(
            plan=draft_plan,
            localized_medications=localized,
            clinician_review_required=self.config.require_clinician_review,
            review_notes=self._build_review_notes(snapshot, safety, localization_skipped_reason, execution_plan),
            evidence_quality_summary=self._evidence_quality_for_proposal(evidence, localized),
            blocked_reasons=(
                [finding.message for finding in safety.findings if finding.blocked]
                + ([execution_plan.block_reason] if execution_plan.block_reason else [])
                + (["Generation returned an empty medication plan for a prescription-route case."] if empty_prescription_plan else [])
                + (["Generation returned an empty medication plan despite ExecutionPlan target_ingredients and allowed_to_generate=true."] if empty_allowed_generation_plan else [])
            ),
        )

        clinical_action = None
        if self.config.clinical_action_enabled:
            clinical_action = self.clinical_action_builder.build(snapshot, execution_plan, prescription=proposal, evidence=evidence, safety=safety)

        result = PipelineExecutionRecord(
            request_id=command.request_id,
            snapshot=snapshot,
            evidence=evidence,
            draft_plan=draft_plan,
            safety=safety,
            proposal=proposal,
            trace_id=trace_id,
            stage_traces=self.stage_runner.traces,
            blocked=blocked,
            status="blocked" if blocked else "ready_for_review",
            localization_skipped_reason=localization_skipped_reason,
            execution_plan=execution_plan,
            policy_decision=policy_decision.model_dump(mode="json") if policy_decision is not None else {},
            clinical_action=clinical_action,
            medical_order_extraction=medical_order_extraction,
            post_generation_validation=post_generation_validation,
            activation_flags={
                "safety_policy_mode": self.config.safety_policy_mode,
                "clinical_action_enabled": self.config.clinical_action_enabled,
                "medical_order_extraction_mode": self.config.medical_order_extraction_mode,
                "post_generation_validator_mode": self.config.post_generation_validator_mode,
                "multilingual_retrieval_enabled": self.config.multilingual_retrieval_enabled,
            },
        )
        self.stage_runner.run(WorkflowStage.AUDIT, self.audit.record, result)
        result.stage_traces = self.stage_runner.traces
        return result

    def run(self, command: DraftPrescriptionCommand) -> PipelineExecutionRecord:
        return self.draft(command)

    @staticmethod
    def _build_review_or_skip_plan(snapshot, execution_plan: ExecutionPlan) -> TherapeuticPlan:
        if execution_plan.route == "emergency":
            triage = "emergency_referral"
            recs = ["Urgent clinician escalation or emergency referral."]
        elif execution_plan.route == "non_pharma":
            triage = "clinician_review"
            recs = ["No automatic medication proposal. Provide non-pharmacologic management after clinician review."]
        else:
            triage = "clinician_review"
            recs = ["Clinical review required before any medication proposal."]
        return TherapeuticPlan(
            problem_summary=f"Route={execution_plan.route}. {execution_plan.planner_reason}",
            medications=[],
            non_drug_recommendations=recs,
            monitoring=[],
            unresolved_questions=list(execution_plan.missing_critical_information or []),
            generation_notes=[
                "ExecutionPlan skipped full Qwen prescription generation for this route.",
                f"planner_reason={execution_plan.planner_reason}",
                f"block_reason={execution_plan.block_reason}",
            ],
            triage_recommendation=triage,
            confidence=0.85,
        )

    @staticmethod
    def _enforce_contract_states(snapshot, plan: TherapeuticPlan, execution_plan: ExecutionPlan | None = None) -> TherapeuticPlan:
        route = execution_plan.route if execution_plan is not None else snapshot.route_recommendation
        updates: dict = {}
        notes = list(plan.generation_notes)
        unresolved = list(plan.unresolved_questions)

        if route == "emergency":
            updates["triage_recommendation"] = "emergency_referral"
            updates["medications"] = []
            updates["non_drug_recommendations"] = list(dict.fromkeys(plan.non_drug_recommendations + ["Urgent clinician escalation or emergency referral."]))
            notes.append("Automatic outpatient medication table suppressed because route=emergency.")
        elif route == "non_pharma":
            updates["triage_recommendation"] = "clinician_review"
            updates["medications"] = []
            notes.append("Medication draft suppressed because route=non_pharma.")
        elif route == "review":
            updates["triage_recommendation"] = "clinician_review"
            if getattr(execution_plan, "sub_route", None) != "review_draft_allowed":
                updates["medications"] = []
                notes.append("Medication draft suppressed because route=review and ExecutionPlan requires clinician review.")
            else:
                notes.append("Review-draft-allowed: medication draft retained for mandatory doctor validation; not a final prescription.")
        if any("Complete dosing details" in item for item in unresolved):
            updates["triage_recommendation"] = "clinician_review"
            notes.append("Dose remains unresolved; case kept in review state.")
        if execution_plan is not None and execution_plan.allowed_to_generate and getattr(execution_plan, "target_ingredients", []) and not plan.medications:
            updates["triage_recommendation"] = "clinician_review"
            unresolved.append("Generation returned no medication despite controlled target_ingredients; fallback insertion or regeneration is required before approval.")
            notes.append("Generation empty medication plan detected for allowed target route; case is not approvable until a target medication is present.")
            updates["unresolved_questions"] = list(dict.fromkeys(unresolved))
        elif route == "prescription" and not plan.medications:
            updates["triage_recommendation"] = "clinician_review"
            unresolved.append("Generation returned no medication for a prescription-route case; regenerate or use fallback before approval.")
            notes.append("Generation empty medication plan detected; case blocked for clinician review.")
            updates["unresolved_questions"] = list(dict.fromkeys(unresolved))
        updates["generation_notes"] = list(dict.fromkeys(notes))
        return plan.model_copy(update=updates)



    @staticmethod
    def _evidence_quality_for_proposal(evidence, localized) -> dict:
        summary_obj = getattr(evidence, "evidence_quality_summary", None)
        summary = summary_obj.model_dump(mode="json") if summary_obj is not None else {}
        verified = bool(localized)
        summary["localized_product_verified"] = verified
        summary["localized_product_verified_reason"] = (
            "At least one selected localized medication passed localizer selection."
            if verified else
            "No localized medication selected; retrieval candidates alone are not treated as verified."
        )
        summary["evidence_hit_count"] = len(getattr(evidence, "evidence_hits", []) or [])
        summary["rejected_evidence_hit_count"] = len(getattr(evidence, "rejected_evidence_hits", []) or [])
        return summary

    @staticmethod
    def _skip_reason(snapshot, safety, execution_plan: ExecutionPlan | None = None) -> str:
        route = execution_plan.route if execution_plan is not None else snapshot.route_recommendation
        if execution_plan and not execution_plan.localization_required:
            return f"Localization skipped by ExecutionPlan: {execution_plan.planner_reason}"
        if route == "emergency":
            return "Localization skipped because the case was routed to emergency."
        if route == "non_pharma":
            return "Localization skipped because the case was routed to non-pharma management."
        if route == "review":
            return "Localization skipped because the case was routed to clinician review."
        if safety.has_blocking_issue:
            return "Localization skipped because blocking safety findings were detected."
        return "Localization skipped due to contract-level conservative routing."

    @staticmethod
    def _build_review_notes(snapshot, safety, localization_skipped_reason: str | None, execution_plan: ExecutionPlan | None = None) -> list[str]:
        notes = ["Draft must be reviewed and approved by a qualified clinician."]
        notes.append(f"Runtime route recommendation: {snapshot.route_recommendation}.")
        if execution_plan:
            notes.append(f"ExecutionPlan route: {execution_plan.route}.")
            notes.append(f"ExecutionPlan reason: {execution_plan.planner_reason}.")
            if execution_plan.block_reason:
                notes.append(f"ExecutionPlan block reason: {execution_plan.block_reason}.")
            if getattr(execution_plan, "display_route", None):
                notes.append(f"Display route: {execution_plan.display_route}; final doctor validation is mandatory.")
        if safety.has_blocking_issue:
            notes.append("One or more blocking safety findings were detected. Resolve them before approval.")
        elif execution_plan and execution_plan.allowed_to_generate:
            notes.append("If no medication is present despite an allowed target route, treat this as a generation failure and regenerate before approval.")
        elif snapshot.route_recommendation == "prescription":
            notes.append("If no medication is present despite snapshot route=prescription, verify ExecutionPlan before approval.")
        elif safety.findings:
            notes.append("Non-blocking safety findings were detected. Review them before finalizing.")
        else:
            notes.append("No safety findings were detected by the runtime guardrail set, but clinician review remains mandatory.")
        if snapshot.missing_critical_information:
            notes.append(f"Missing critical information: {', '.join(snapshot.missing_critical_information[:5])}.")
        if localization_skipped_reason:
            notes.append(localization_skipped_reason)
        return notes

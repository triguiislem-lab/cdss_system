from __future__ import annotations

from typing import Any

from libs.contracts.clinical_action import ClinicalActionProposal
from libs.contracts.execution import ExecutionPlan


def _dump(obj: Any) -> Any:
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if hasattr(obj, "dict"):
        return obj.dict()
    return obj


class ClinicalActionBuilder:
    """Build doctor-facing action proposals without making final decisions."""

    def build(self, snapshot, execution_plan: ExecutionPlan, prescription=None, evidence=None, safety=None) -> ClinicalActionProposal:
        route = execution_plan.route
        policy_hits = list(execution_plan.policy_hits or [])
        missing = list(execution_plan.missing_critical_information or [])
        forbidden = list(dict.fromkeys(execution_plan.forbidden_ingredients or []))
        risk_detected = self._risks(snapshot, execution_plan, safety)
        safety_explanations = self._safety_explanations(execution_plan, safety)
        evidence_summary = self._evidence_summary(evidence)

        if route == "prescription" and execution_plan.allowed_to_generate:
            proposal_type = "prescription"
            summary = "Structured prescription proposal generated for physician review."
            actions = ["Review generated medication, dose, duration, contraindications, evidence and localized product before approval."]
            attached_prescription = prescription
        elif route == "emergency":
            proposal_type = "emergency_escalation"
            summary = "Emergency escalation required. Automatic outpatient prescription is not authorized."
            actions = ["Escalate urgently according to local emergency protocol.", "Do not approve an outpatient medication draft before emergency assessment."]
            attached_prescription = None
        elif route == "non_pharma":
            proposal_type = "non_pharmacological"
            summary = "Non-pharmacological management route. Automatic medication prescription is not authorized."
            actions = ["Provide non-medication guidance or referral as clinically appropriate."]
            attached_prescription = None
        elif route == "blocked":
            proposal_type = "blocked"
            summary = "Prescription proposal blocked by safety policy."
            actions = ["Review the safety explanation and missing information before deciding treatment."]
            attached_prescription = None
        elif missing:
            proposal_type = "missing_information"
            summary = "Missing critical clinical information prevents safe automatic prescription."
            actions = ["Collect the missing information before considering medication generation: " + ", ".join(missing)]
            attached_prescription = None
        else:
            proposal_type = "clinician_review"
            summary = "Clinician review required. Automatic prescription generation is not authorized for this route."
            actions = ["Review patient context, medication history, requested medications and policy hits before prescribing."]
            attached_prescription = None

        if forbidden:
            actions.append("Avoid forbidden ingredients unless a clinician explicitly overrides after risk assessment.")
        if safety_explanations:
            actions.append("Review safety explanations and policy hits before final validation.")

        return ClinicalActionProposal(
            proposal_type=proposal_type,
            route=route,
            allowed_to_generate_prescription=bool(execution_plan.allowed_to_generate and route == "prescription"),
            summary=summary,
            risk_detected=risk_detected,
            missing_information=missing,
            recommended_actions=list(dict.fromkeys(actions)),
            forbidden_ingredients=forbidden,
            safety_explanations=safety_explanations,
            evidence_summary=evidence_summary,
            policy_hits=policy_hits,
            prescription=attached_prescription,
            audit={
                "doctor_final_decision_required": True,
                "planner_reason": execution_plan.planner_reason,
                "block_reason": execution_plan.block_reason,
                "policy_audit": execution_plan.policy_audit,
                "medical_order_audit": execution_plan.medical_order_audit,
                "post_generation_validation_audit": execution_plan.post_generation_validation_audit,
                "prescription_attached": attached_prescription is not None,
                "evidence_attached": evidence is not None,
            },
        )

    @staticmethod
    def _risks(snapshot, execution_plan: ExecutionPlan, safety=None) -> list[str]:
        risks: list[str] = []
        flags = getattr(snapshot, "risk_flags", None)
        if flags is not None:
            for name in ["pregnancy_risk", "renal_risk", "hepatic_risk", "allergy_risk", "escalation_needed"]:
                if getattr(flags, name, False):
                    risks.append(name)
            risks.extend(getattr(flags, "notes", []) or [])
        risks.extend(execution_plan.required_safety_checks or [])
        if safety is not None:
            for finding in getattr(safety, "findings", []) or []:
                msg = getattr(finding, "message", None)
                if msg:
                    risks.append(msg)
        return list(dict.fromkeys(str(x) for x in risks if str(x).strip()))

    @staticmethod
    def _safety_explanations(execution_plan: ExecutionPlan, safety=None) -> list[str]:
        out: list[str] = []
        if execution_plan.planner_reason:
            out.append(execution_plan.planner_reason)
        if execution_plan.block_reason:
            out.append(str(execution_plan.block_reason))
        for hit in execution_plan.policy_hits or []:
            if isinstance(hit, dict) and hit.get("safety_explanation"):
                out.append(str(hit["safety_explanation"]))
        if safety is not None:
            for finding in getattr(safety, "findings", []) or []:
                msg = getattr(finding, "message", None)
                if msg:
                    out.append(str(msg))
        return list(dict.fromkeys(x for x in out if str(x).strip()))

    @staticmethod
    def _evidence_summary(evidence) -> dict[str, Any]:
        if evidence is None:
            return {}
        if hasattr(evidence, "evidence_quality_summary") and evidence.evidence_quality_summary:
            eq = evidence.evidence_quality_summary
            return eq.model_dump(mode="json") if hasattr(eq, "model_dump") else dict(eq)
        summary = getattr(evidence, "merged_summary", None)
        diagnostics = getattr(evidence, "retrieval_diagnostics", None)
        return {"merged_summary": summary, "retrieval_diagnostics": diagnostics or {}}

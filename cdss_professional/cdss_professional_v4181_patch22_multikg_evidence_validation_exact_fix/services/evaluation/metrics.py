from __future__ import annotations

from statistics import mean

from libs.contracts.execution import PipelineExecutionRecord


class EvaluationMetrics:
    """Starter metrics helper for batch and scenario-level evaluation."""

    def summarize(self, result: PipelineExecutionRecord) -> dict[str, object]:
        return {
            'trace_id': result.trace_id,
            'status': result.status,
            'num_medications': len(result.proposal.localized_medications),
            'blocking_safety_issue': result.safety.has_blocking_issue,
            'critical_findings': result.safety.critical_count,
            'warning_findings': result.safety.warning_count,
            'avg_stage_duration_ms': round(
                mean(stage.duration_ms for stage in result.stage_traces) if result.stage_traces else 0.0,
                2,
            ),
        }

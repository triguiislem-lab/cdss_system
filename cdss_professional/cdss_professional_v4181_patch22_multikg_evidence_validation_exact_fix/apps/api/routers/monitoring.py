from __future__ import annotations

from fastapi import APIRouter

from libs.config import get_settings
from services.monitoring import MonitoringAnalyticsService

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


def _service() -> MonitoringAnalyticsService:
    settings = get_settings()
    return MonitoringAnalyticsService(
        audit_dir=settings.audit_dir,
        feedback_dir=settings.feedback_dir,
        feedback_backend=getattr(settings, "feedback_backend", "jsonl"),
    )


@router.get("/overview")
def monitoring_overview() -> dict:
    """Product-level CDSS metrics from audit + clinician feedback artifacts."""
    return _service().overview()


@router.get("/pipeline")
def monitoring_pipeline() -> dict:
    """Stage-level latency, error and slow-case metrics."""
    return _service().pipeline()


@router.get("/performance")
def monitoring_performance() -> dict:
    """Combined latency and model-error metrics for release dashboards."""
    return _service().performance()


@router.get("/model")
def monitoring_model() -> dict:
    """LLM/Qwen extraction and generation-use metrics inferred from audit traces."""
    return _service().model()


@router.get("/safety")
def monitoring_safety() -> dict:
    """Safety-policy, blocker and post-generation guardrail metrics."""
    return _service().safety()


@router.get("/feedback")
def monitoring_feedback() -> dict:
    """Clinician-in-the-loop decision, edit and rejection metrics."""
    return _service().feedback()


@router.get("/feedback/summary")
def monitoring_feedback_summary() -> dict:
    """Compact clinician-feedback summary for dashboards and governance reviews."""
    return _service().feedback()


@router.get("/retrieval")
def monitoring_retrieval() -> dict:
    """RAG/KG/formulary evidence-quality metrics."""
    return _service().retrieval()


@router.get("/localization")
def monitoring_localization() -> dict:
    """Tunisian localization and local product match metrics."""
    return _service().localization()


@router.get("/clinical-quality")
def monitoring_clinical_quality() -> dict:
    """Doctor feedback, decision-by-route and quality-gate metrics.

    Feedback is explicitly summarized for supervised offline improvement only;
    this endpoint never changes runtime model/rule behavior.
    """
    return _service().clinical_quality()

from fastapi import FastAPI

from apps.api.routers.health import router as health_router
from apps.api.routers.prescriptions import router as prescription_router
from apps.api.routers.monitoring import router as monitoring_router
from apps.api.routers.feedback import router as feedback_router
from apps.api.routers.audit import router as audit_router
from apps.api.routers.system import router as system_router
from libs.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Tunisia CDSS API: clinical extraction, evidence retrieval, prescription drafting, safety validation, localization, audit, and runtime status.",
    version="0.13.0-patch21-professional",
)

app.include_router(health_router)
app.include_router(system_router, prefix=settings.api_prefix)
app.include_router(prescription_router, prefix=settings.api_prefix)
app.include_router(monitoring_router, prefix=settings.api_prefix)
app.include_router(feedback_router, prefix=settings.api_prefix)
app.include_router(audit_router, prefix=settings.api_prefix)

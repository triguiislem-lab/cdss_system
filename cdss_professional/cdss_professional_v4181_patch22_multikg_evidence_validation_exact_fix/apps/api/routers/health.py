from __future__ import annotations

import os
import time

from fastapi import APIRouter, Response

router = APIRouter(tags=["health"])
STARTED_AT = time.time()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    """Minimal Prometheus metrics for the FastAPI CDSS runtime."""
    uptime = max(time.time() - STARTED_AT, 0)
    process_id = os.getpid()
    lines = [
        "# HELP medcity_cdss_info MedCity FastAPI CDSS runtime information.",
        "# TYPE medcity_cdss_info gauge",
        'medcity_cdss_info{service="medcity-cdss"} 1',
        "# HELP process_start_time_seconds Process start time as Unix seconds.",
        "# TYPE process_start_time_seconds gauge",
        f"process_start_time_seconds {STARTED_AT:.3f}",
        "# HELP process_uptime_seconds Process uptime in seconds.",
        "# TYPE process_uptime_seconds gauge",
        f"process_uptime_seconds {uptime:.3f}",
        "# HELP process_pid Process identifier.",
        "# TYPE process_pid gauge",
        f"process_pid {process_id}",
    ]
    return Response(
        content="\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )

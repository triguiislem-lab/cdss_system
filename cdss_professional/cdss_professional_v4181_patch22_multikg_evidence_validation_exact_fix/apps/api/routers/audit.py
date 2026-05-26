from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from apps.api.deps import get_pipeline
from apps.api.schemas import PrescriptionDraftResponse
from services.orchestration.pipeline import PrescriptionPipeline

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/traces/{trace_id}", response_model=PrescriptionDraftResponse)
def get_audit_trace(trace_id: str, pipeline: PrescriptionPipeline = Depends(get_pipeline)) -> PrescriptionDraftResponse:
    record = pipeline.audit.fetch(trace_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No audit record found for trace_id={trace_id}")
    return PrescriptionDraftResponse.model_validate(record.model_dump())

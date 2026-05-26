from __future__ import annotations

from libs.contracts.commands import DraftPrescriptionCommand
from services.evaluation.metrics import EvaluationMetrics
from services.evaluation.report_builder import ReportBuilder
from services.evaluation.scenario_loader import ScenarioLoader
from services.orchestration.pipeline import PrescriptionPipeline


class BenchmarkRunner:
    """Runs benchmark scenarios through the pipeline."""

    def __init__(self, pipeline: PrescriptionPipeline | None = None) -> None:
        self.pipeline = pipeline or PrescriptionPipeline()
        self.metrics = EvaluationMetrics()
        self.report_builder = ReportBuilder()
        self.loader = ScenarioLoader()

    def run_one(self, request: DraftPrescriptionCommand) -> dict[str, object]:
        result = self.pipeline.draft(request)
        return self.metrics.summarize(result)

    def run_many(self, requests: list[DraftPrescriptionCommand]) -> dict[str, object]:
        rows = [self.run_one(request) for request in requests]
        return self.report_builder.build(rows)

    def run_directory(self, directory: str) -> dict[str, object]:
        return self.run_many(self.loader.load_requests(directory))

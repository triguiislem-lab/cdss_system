from services.evaluation.benchmark_runner import BenchmarkRunner
from services.evaluation.scenario_loader import ScenarioLoader
from services.ingestion.pipeline import IngestionPipeline


def test_benchmark_runner_can_run_example_directory() -> None:
    report = BenchmarkRunner().run_directory('examples/scenarios')
    assert report['count'] >= 2
    assert 'blocked_rate' in report


def test_scenario_loader_lists_examples() -> None:
    names = ScenarioLoader().list_available('examples/scenarios')
    assert 'simple_urti.json' in names


def test_ingestion_pipeline_returns_structured_report() -> None:
    report = IngestionPipeline().run()
    assert len(report.jobs) == 5
    assert report.has_errors is False

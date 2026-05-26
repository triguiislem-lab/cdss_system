# Evaluation and ingestion scaffold

The runtime project now includes fixture-backed ingestion and scenario benchmarking.

## Evaluation

- `examples/scenarios/*.json` are replayable scenario fixtures.
- `services/evaluation/scenario_loader.py` loads scenario files into `ConsultationRequest` objects.
- `services/evaluation/benchmark_runner.py` runs a batch of scenarios through the full pipeline.

## Ingestion

- `services/ingestion/*` loads local fixture artifacts and returns structured `IngestionJobResult` objects.
- `services/ingestion/pipeline.py` aggregates jobs into an `IngestionReport`.

These are intentionally simple but preserve the contract shape you will want once real
ingestion and regression testing are connected.

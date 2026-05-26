# Runtime backends

The repo now supports swapping the main retrieval/generation adapters without changing the service layer.

## Retrieval

### Vector backend
- `stub`: bundled fixture corpus
- `json` / `jsonl`: exported evidence chunks from notebooks or ingestion jobs
- `csv`: simple tabular corpus
- `faiss`: optional FAISS index + metadata file + embedding model

### KG backend
- `stub`: bundled fixture facts
- `json` / `jsonl`: exported graph facts
- `neo4j`: live Neo4j relationship query against a generic schema

### Local formulary backend
- `stub`: bundled TN formulary fixture
- `json` / `jsonl`: exported local formulary rows
- `csv`: AMM/catalog export

## Generation

### Generation backend
- `notebook_heuristic`: offline-safe notebook-derived drafting path
- `stub`: legacy canned response mode
- `openai_compatible`: OpenAI-style chat completions HTTP API
- `hf_router`: same OpenAI-compatible HTTP path for Hugging Face Router-style endpoints
- `llama_cpp`: local GGUF inference via `llama-cpp-python`

External generation backends automatically fall back to the notebook heuristic if the runtime call fails, so the pipeline remains usable offline.

## Wiring

All backend selection is configured through `.env` / `AppSettings`, and `apps/api/container.py` builds the concrete connectors and injects them into:
- `RetrievalService`
- `GenerationService`
- `PrescriptionPipeline`

That means you can move from fixtures to real corpora, Neo4j, or LLM providers without changing the orchestration code.

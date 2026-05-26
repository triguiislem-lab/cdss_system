# Generation integration status

Generation is runtime-configurable. The default backend is `notebook_heuristic`, an offline evidence-grounded drafting path. It is not the legacy canned stub path.

Supported backend classes:
- `notebook_heuristic`: deterministic evidence-aware drafting for offline runtime and tests;
- `llama_cpp`: local GGUF inference when configured;
- `openai_compatible` / `hf_router`: OpenAI-style HTTP chat completion endpoints;
- `stub`: legacy deterministic canned mode, retained only for tests/demos.

Contract behavior is enforced outside the model:
- emergency route suppresses outpatient medication drafts;
- non-pharma route suppresses medication-first drafts;
- review cases remain conservative;
- final local product selection is delegated to AMM localization.

Open production tasks:
- benchmark Qwen/Med42/BioMistral candidate arms;
- use stricter schema-constrained decoding for LLM backends;
- validate DCI-only output on clinician-labeled cases.

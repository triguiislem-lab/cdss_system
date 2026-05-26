# Retrieval integration status

Retrieval is runtime-backed by default.

- Vector evidence: `data/runtime/tn_master_vs_corpus.jsonl` with optional FAISS metadata/index when configured.
- Structured KG support: `data/runtime/tn_master_kg_edges.csv`, with Neo4j optional.
- Local formulary / AMM: `data/runtime/tn_master_amm_catalog.csv`.

Legacy fixture files under `examples/demo_fixtures/*_stub.json` remain only as test/demo fallbacks. They are not the default runtime path in `AppSettings`.

Open production tasks:
- calibrate retrieval ranking on labeled Tunisia cases;
- add clinical query expansion for Tunisian Arabic/French abbreviations;
- measure Recall@k, MRR@k and nDCG@k on the benchmark set.

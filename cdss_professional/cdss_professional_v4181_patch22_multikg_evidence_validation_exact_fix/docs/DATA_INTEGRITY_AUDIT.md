# Data Integrity Audit

Date reviewed: 2026-04-28

## Scope

This audit checks:

- `notebook38f27ecf91 (2).ipynb`: KG/Hetionet/PrimeKG notebook integrity and expected artifacts.
- `graphrag-cdss-m-moire-s-mantique.ipynb`: semantic vector-store notebook integrity and expected artifacts.
- `final_data_release/`: SQLite database plus CSV/JSON/JSONL release exports.
- Runtime integration points after the model-backed default changes.

Python execution was not available on this machine because `python.exe` resolves to a broken Windows app alias. Checks were performed with PowerShell and `sqlite3`.

## Summary

Overall structural integrity is good:

- Both notebooks are valid JSON notebooks.
- `final_data_release.db` passes SQLite `PRAGMA integrity_check`.
- DB row counts match `final_release_summary.json`.
- CSV/JSONL export row counts match the DB.
- JSON and JSONL exports parse successfully.
- Evidence rows all link to an existing medicine row.
- Medicine evidence counters in `medicines` match recomputed evidence counts from `evidence_sections`.

Main caveats:

- The KG notebook output artifacts are not present locally.
- The semantic vector-store artifacts are not present locally.
- `evidence_sections.section_id` has 103 duplicate IDs, but those duplicate IDs point to distinct content hashes, so this is an identifier collision issue, not duplicated identical content.
- 412 accepted evidence rows are marked `support_only_not_full_rcp`; these are mostly support pharmacology sources and should not be treated as full RCP authority.
- 13 evidence rows contain likely mojibake markers such as `Ã`.
- 10 medicine rows have blank `amm`; 9 are still covered with accepted sections and 1 is uncovered.

Corrections applied non-destructively:

- Created `final_data_release/final_evidence_sections_runtime.jsonl` as an additive derivative. The original `final_evidence_sections.jsonl` remains unchanged.
- Added `evidence_uid = row_id | section_id | source_system | content_hash` and preserved `original_section_id`.
- Added `section_title_normalized` and `section_text_normalized`; original title/text fields are preserved.
- Added `authority_class` so support-only evidence can be ranked below local official and regulatory evidence.
- Added SQLite view `v_evidence_sections_runtime_safe`; original tables are not rewritten.
- Updated runtime config to use `final_data_release/final_evidence_sections_runtime.jsonl`.
- Validation after correction: 168,563 runtime rows, 0 bad JSON lines, 0 duplicate `evidence_uid` values, SQLite integrity still `ok`.

## Notebook Integrity

### KG Notebook

File: `notebook38f27ecf91 (2).ipynb`

Notebook structure:

- Valid JSON: yes
- nbformat: 4
- total cells: 19
- code cells: 16
- markdown cells: 3
- kernelspec: Python 3
- notebook Python version: 3.12.12

Declared logic and inputs:

- Disease query: `parkinson`
- Hetionet source: public Neo4j, `bolt://neo4j.het.io`
- PrimeKG candidate paths:
  - `/kaggle/input/datasets/islemtrigui/kg-dataset/kg.csv`
  - `/mnt/data/kg.csv`
  - `/kaggle/input/primekg/kg.csv`
  - `/kaggle/input/datasets/islemtrigui6/primekg/kg.csv`
- PrimeKG loading mode: `disease_neighbors`
- PrimeKG chunk size: `250_000`
- export prefix: `parkinson_unified_production`

Expected local artifacts checked:

- `parkinson_unified_production_nodes.pkl`: not found
- `parkinson_unified_production_edges.pkl`: not found
- `parkinson_unified_production_metadata.json`: not found
- `parkinson_unified_production_value_analysis.json`: not found
- `parkinson_unified_production.graphml`: not found

Interpretation:

The KG notebook itself is intact, but its produced graph artifacts are not present in this workspace. The active project uses `data/runtime/tn_master_kg_edges.csv` for KG retrieval, not the notebook's exported Parkinson graph files.

### Semantic Vector-Store Notebook

File: `graphrag-cdss-m-moire-s-mantique.ipynb`

Notebook structure:

- Valid JSON: yes
- nbformat: 4
- total cells: 25
- code cells: 24
- markdown cells: 1
- kernelspec: Python 3
- notebook Python version: 3.12.12

Declared source inputs:

- PubMedQA:
  - `/kaggle/input/datasets/islemtrigui6/vector-database/ori_pqaa.json`
  - `/kaggle/input/datasets/islemtrigui6/vector-database/ori_pqau.json`
- MedMCQA:
  - `/kaggle/input/datasets/islemtrigui6/vector-database/data`
- MedQA:
  - `/kaggle/input/datasets/islemtrigui6/vector-database/data_clean/data_clean/questions/US`
- Textbooks:
  - `/kaggle/input/datasets/islemtrigui6/vector-database/data_clean/data_clean/textbooks/en`

Declared model and vector-store parameters:

- embedding model: `pritamdeka/S-PubMedBert-MS-MARCO`
- batch size: `192`
- FAISS strategy: `auto`
- chunking: `max_chars=1200`, `overlap=200`
- FAISS HNSW for large indexes
- FAISS IVF fallback with `nprobe=64`

Expected local artifacts checked:

- `medical_knowledge.faiss`: not found
- `all_texts.pkl`: not found
- `all_metadata.pkl`: not found
- `vector_store_stats.json`: not found

Interpretation:

The semantic vector-store notebook is intact and documents the required FAISS/index artifacts, but those artifacts are not present in this workspace. Because there is no notebook-built FAISS index locally, the runtime now uses `final_data_release/final_evidence_sections_runtime.jsonl` with model-backed semantic reranking instead of a notebook FAISS index.

Important model alignment note:

If the notebook FAISS artifacts are later copied into this project, the query model must match the index model recorded in `vector_store_stats.json`. The notebook default is `pritamdeka/S-PubMedBert-MS-MARCO`; the current runtime semantic JSONL default is `BAAI/bge-m3`.

## Final Data Release File Integrity

Files present:

- `final_data_release.db`: 908,513,280 bytes
- `final_evidence_sections.csv`: 806,669,046 bytes
- `final_evidence_sections.jsonl`: 861,175,870 bytes
- `final_evidence_sections_runtime.jsonl`: 1,666,634,316 bytes
- `final_medicines.csv`: 2,476,959 bytes
- `final_medicines.json`: 6,581,035 bytes
- `final_medicines.jsonl`: 5,471,693 bytes
- `final_release_summary.json`: 3,352 bytes
- `final_source_manifest.csv`: 1,087 bytes
- `final_uncovered_medicines.csv`: 120,928 bytes
- `README_FINAL_DATA_FILES.md`: 786 bytes

Export row counts:

| File | Data rows |
|---|---:|
| `final_medicines.csv` | 6,163 |
| `final_medicines.jsonl` | 6,163 |
| `final_evidence_sections.csv` | 168,563 |
| `final_evidence_sections.jsonl` | 168,563 |
| `final_evidence_sections_runtime.jsonl` | 168,563 |
| `final_uncovered_medicines.csv` | 354 |
| `final_source_manifest.csv` | 12 |

JSON validation:

- `final_medicines.json`: valid, 6,163 records
- `final_medicines.jsonl`: 6,163 valid JSON lines, 0 bad lines
- `final_evidence_sections.jsonl`: 168,563 valid JSON lines, 0 bad lines
- `final_evidence_sections_runtime.jsonl`: 168,563 valid JSON lines, 0 bad lines, 0 duplicate `evidence_uid` values

## SQLite Database Integrity

SQLite result:

- `PRAGMA integrity_check`: `ok`

Tables/views:

- `medicines`
- `evidence_sections`
- `source_manifest`
- `v_medicine_evidence_summary`
- `v_source_counts`
- `v_uncovered_medicines`

DB row counts:

| Entity | Rows |
|---|---:|
| `medicines` | 6,163 |
| `evidence_sections` | 168,563 |
| `source_manifest` | 12 |
| accepted evidence sections | 168,515 |
| rejected/review evidence sections | 48 |
| uncovered medicines | 354 |
| pipeline-covered medicines | 5,809 |
| medicines with accepted evidence | 5,595 |

These match `final_release_summary.json`.

Relational checks:

| Check | Result |
|---|---:|
| evidence rows with no matching medicine `row_id` | 0 |
| medicine accepted-section count mismatches | 0 |
| medicine total-evidence count mismatches | 0 |
| medicine best-rank mismatches | 0 |
| duplicate medicine `row_id` values | 0 |
| blank medicine `row_id` values | 0 |
| blank evidence `section_id` values | 0 |
| blank evidence text rows | 0 |

## Caveats And Data Quality Findings

### Duplicate Section IDs

Finding:

- Duplicate `section_id` groups: 103
- Duplicate `(section_id, content_hash)` groups: 0
- Duplicate `(row_id, section_kind, content_hash)` groups: 0

Interpretation:

This is not duplicate identical content. It is an ID collision where multiple distinct evidence sections share the same `section_id`. Examples include local DPM and lab-document sections for the same medicine/section number.

Risk:

If `section_id` is used as a primary key in a vector store, search index, cache, or UI anchor, rows may overwrite one another.

Recommended fix:

Use a stable unique evidence key such as:

`section_id + source_system + content_hash`

or add a new `evidence_uid` column computed from:

`sha1(row_id | section_id | source_system | content_hash)`

### Support-Only Accepted Rows

Finding:

- 412 accepted rows have `quality_flags='support_only_not_full_rcp'`.
- Sources:
  - `pubchem_annotations`: 345
  - `chembl_ebi_api`: 67

Interpretation:

These rows are accepted as support evidence, but they should not be treated like official RCP/label dosing authority.

Recommended runtime behavior:

Rank these below official local RCP, BDPM/regulatory labels, and full prescribing documents for dose/frequency decisions.

### Encoding / Mojibake

Finding:

- 13 evidence rows contain likely mojibake markers such as `Ã`.
- Affected sources:
  - `dailymed_spl`: 10
  - `tunisia_dpm_local_rcp_pdf`: 2
  - `tunisia_lab_local_document`: 1
- Medicine name/generic/form fields did not match the same `Ã` marker query.

Interpretation:

This is small relative to the total evidence corpus, but it can hurt semantic retrieval and display quality for those rows.

Recommended fix:

Run a targeted encoding repair pass for the affected rows before embedding/indexing, or normalize text during ingestion.

### Blank AMM Values

Finding:

- 10 medicine rows have blank `amm`.
- 9 are still `covered_with_accepted_sections`.
- 1 is uncovered: `[18F]PSMA-1007 SISORA`.

Interpretation:

Blank AMM does not break row-level joins because `row_id` is used consistently, but AMM-based lookup/localization will be weaker for these medicines.

## Source Coverage

Top evidence sources:

| Source | Rows | Accepted |
|---|---:|---:|
| `dailymed_spl` | 121,514 | 121,514 |
| `openfda_label` | 23,469 | 23,457 |
| `bdpm_api_medicaments_fr` | 11,117 | 11,117 |
| `tunisia_dpm_local_rcp_pdf` | 7,291 | 7,291 |
| `emc_smpc_html` | 1,058 | 1,058 |
| `tunisia_lab_local_document` | 818 | 818 |
| `aemps_cima_ficha_tecnica` | 687 | 687 |
| `openfda_live_label` | 628 | 627 |
| `who_vaccine_product_information` | 580 | 580 |
| `local_ocr_html_recovered_document` | 449 | 449 |

Language distribution:

- English: 147,729 rows
- French: 20,055 rows
- Spanish: 779 rows

Important implication:

The evidence corpus is very large and mostly English fallback/regulatory evidence. Tunisian local evidence is present and high-value, but the runtime ranker should continue to prioritize local official RCP and local lab documents when they exist.

## Source Manifest Integrity

Manifest totals:

- rows loaded: 198,970
- rows accepted: 168,515
- rows rejected: 30,455

This reconciles with:

- accepted evidence rows in DB: 168,515
- rejected summary counts:
  - duplicate content hash: 30,407
  - other rejected/review rows: 48

So the manifest is consistent with the release summary.

## Runtime Integration Check

Current active defaults are model-backed:

- `VECTOR_BACKEND=semantic_jsonl`
- `VECTOR_CORPUS_PATH=final_data_release/final_evidence_sections_runtime.jsonl`
- `LOCAL_FORMULARY_CATALOG_PATH=final_data_release/final_medicines.csv`
- `KG_CATALOG_PATH=data/runtime/tn_master_kg_edges.csv`
- `GENERATION_BACKEND=openai_compatible`
- `GENERATION_MODEL=Qwen3-32B`

Integrity implication:

The final release evidence and medicine catalog are now directly integrated into retrieval/localization defaults. The runtime uses the non-destructive corrected evidence derivative for vector/text retrieval. The final SQLite DB is still an integrity/source package artifact, with an added runtime-safe view.

## Verdict

Pass:

- Notebook files are structurally valid.
- Final release DB is structurally valid.
- DB/export/summary counts reconcile.
- JSON/JSONL exports parse cleanly.
- Evidence-to-medicine joins are complete.
- Medicine summary counters are internally consistent.

Needs attention:

- Notebook KG and FAISS/vector-store output artifacts are not present locally.
- Duplicate `section_id` values should be fixed before using `section_id` as a unique key.
- Support-only accepted evidence should be ranked as support evidence, not full RCP authority.
- Minor mojibake rows should be repaired or normalized before embedding/indexing.
- Blank AMM rows should be reviewed for AMM-based localization completeness.

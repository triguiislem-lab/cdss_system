# Kaggle Runtime

Use this profile when the model datasets are mounted under `/kaggle/input`.

## Model/Data Paths

- BGE-M3 model: `/kaggle/input/datasets/islemtrigui/cdss-bge-m3` for deduplication/other semantic tasks.
- FAISS embedding model: `/kaggle/input/datasets/islemtrigui6/s-pubmedbert-ms-marco/model`.
  The uploaded FAISS index is 768-dimensional and was built with `pritamdeka/S-PubMedBert-MS-MARCO`; do not use BGE-M3 for this index unless you rebuild FAISS.
- BGE reranker: `/kaggle/input/datasets/islemtrigui/cdss-bge-reranker-v2-m3`
- NLLB translation: `/kaggle/input/datasets/islemtrigui/cdss-nllb-200-distilled-1-3b`
- Qwen parts:
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-01`
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-02`
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-03`
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-04`
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-05`
  - `/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-06`
- FAISS vector store: `/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss`
- Hetionet + PrimeKG Kuzu graph: `/kaggle/input/datasets/islemtrigui6/hetionet-primekg-kuzu-database`

## Setup

From the project root in Kaggle:

```bash
cp .env.kaggle .env
python tools/prepare_kaggle_qwen_model.py
python tools/prepare_kaggle_cdss_kg.py
pip install -e . --no-build-isolation --no-deps
```

The staging script creates:

```text
/kaggle/working/cdss-qwen3-32b
```

It symlinks or copies files from the split Qwen datasets. Source datasets remain read-only and unchanged.

`tools/prepare_kaggle_cdss_kg.py` recreates the CDSS extraction from the mounted Kuzu dataset's `nodes.csv` and `edges.csv`. You can also run `notebook54ea2edb8d.ipynb`; both paths produce the files the runtime expects:

```text
/kaggle/working/kg_cdss_review_outputs/cdss_integration_files/cdss_drug_disease_edges.csv
/kaggle/working/kg_cdss_review_outputs/cdss_integration_files/cdss_drug_gene_edges.csv
/kaggle/working/kg_cdss_review_outputs/cdss_integration_files/cdss_disease_gene_edges.csv
```

The app uses `KG_BACKEND=cdss_csv_dir` and reads that directory through `KG_CATALOG_PATH`. The original Kuzu database under `/kaggle/input` stays read-only and unchanged.

## Run

```bash
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
```

Then call:

```text
POST /v1/prescriptions/draft
```

## Expected Runtime Behavior

- Vector retrieval uses the Kaggle FAISS index plus the matching local S-PubMedBert encoder.
- KG retrieval uses the Hetionet + PrimeKG CDSS CSV extracts from `notebook54ea2edb8d.ipynb`.
- Evidence reranking uses the local BGE reranker.
- Translation uses the local NLLB model.
- Generation uses local Qwen through the `transformers` backend.
- If a model path is missing or cannot load, the service records fallback metadata and continues conservatively where possible.

## If FAISS File Names Differ

`.env.kaggle` assumes these names:

```text
medical_knowledge.faiss
all_metadata.pkl
all_texts.pkl
```

If your Kaggle vector-store dataset uses different names, update:

```env
VECTOR_FAISS_INDEX_PATH=
VECTOR_FAISS_METADATA_PATH=
VECTOR_PICKLE_TEXTS_PATH=
```

# Kaggle Testing Notebook Cells

These cells are designed for a Kaggle notebook with internet disabled and model/data/wheel datasets attached.

## 1. Enter Project

```python
%cd /kaggle/working/clinical-prescription-system-tunisia-runtime-realdata

import sys
sys.path.insert(0, "/kaggle/working/clinical-prescription-system-tunisia-runtime-realdata")
```

## 2. Install Offline Wheels And Project

```python
from pathlib import Path

wheel_matches = sorted(Path("/kaggle/input").rglob("faiss_cpu*.whl"))
assert wheel_matches, "Attach the FAISS Dependencies Kaggle dataset first."
FAISS_WHEEL_DIR = str(wheel_matches[0].parent)

!pip install --no-index --find-links "$FAISS_WHEEL_DIR" packaging numpy faiss-cpu
!pip install -e . --no-build-isolation --no-deps
```

Check imports:

```python
mods = ["sentence_transformers", "transformers", "torch", "faiss", "fastapi", "uvicorn"]
for m in mods:
    try:
        mod = __import__(m)
        print("OK", m, getattr(mod, "__version__", ""))
    except Exception as e:
        print("MISSING", m, type(e).__name__, e)
```

## 3. Prepare Kaggle Assets

```python
!cp .env.kaggle .env
!python tools/prepare_kaggle_qwen_model.py
!python tools/prepare_kaggle_cdss_kg.py
```

Important: the uploaded FAISS vector store was built with `pritamdeka/S-PubMedBert-MS-MARCO` at 768 dimensions, not BGE-M3 at 1024 dimensions. `.env.kaggle` should therefore contain:

```env
VECTOR_EMBEDDING_MODEL=/kaggle/input/datasets/islemtrigui6/s-pubmedbert-ms-marco/model
```

If you modify `.env` inside the same notebook kernel, clear cached settings before reading them again:

```python
from libs.config import get_settings
get_settings.cache_clear()
s = get_settings()
print(s.vector_embedding_model)
```

## 4. Component Diagnostics

```python
!python tools/runtime_component_diagnostics.py --output runtime_component_diagnostics.json
```

View summary:

```python
import json
report = json.load(open("runtime_component_diagnostics.json"))
print(json.dumps(report["imports"], indent=2))
print(json.dumps(report["components"], indent=2, ensure_ascii=False)[:5000])
```

Expected:

- `imports.faiss.ok = true`
- `components.embedding_model.ok = true`
- `components.reranker_model.ok = true`
- `components.faiss_vector_retrieval.ok = true`
- `components.kg_retrieval.ok = true`
- `components.local_formulary.ok = true`

## 5. Lightweight Pipeline Smoke Test

Use this before Qwen to verify pipeline logic quickly.

```python
import subprocess, time, requests, os

env = dict(os.environ)
env["GENERATION_BACKEND"] = "notebook_heuristic"
env["VECTOR_BACKEND"] = "jsonl"
env["VECTOR_CORPUS_PATH"] = "final_data_release/final_evidence_sections_runtime.jsonl"
env["KG_BACKEND"] = "cdss_csv_dir"
env["KG_CATALOG_PATH"] = "/kaggle/working/kg_cdss_review_outputs/cdss_integration_files"
env["LOCAL_FORMULARY_BACKEND"] = "csv"
env["LOCAL_FORMULARY_CATALOG_PATH"] = "final_data_release/final_medicines.csv"

log = open("api_smoke_8005.log", "w")
server_smoke = subprocess.Popen(
    ["python", "-m", "uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8005"],
    stdout=log,
    stderr=subprocess.STDOUT,
    env=env,
)
time.sleep(8)
print(requests.get("http://127.0.0.1:8005/health", timeout=10).text)
```

```python
payload = {
    "request_id": "test-fever-local-kg",
    "patient": {
        "patient_id": "p001",
        "age_years": 30,
        "sex": "female",
        "weight_kg": 65,
        "pregnant": False,
        "breastfeeding": False,
        "renal_impairment": False,
        "hepatic_impairment": False,
        "known_allergies": [],
        "current_medications": [],
        "chronic_conditions": [],
    },
    "consultation": {
        "language": "fr",
        "doctor_notes": "Fièvre depuis 2 jours. Pas d'allergie connue. Non enceinte. Paracetamol traitement symptomatique.",
        "transcript": [],
    },
}

r = requests.post("http://127.0.0.1:8005/v1/prescriptions/draft", json=payload, timeout=300)
data = r.json()
print("status:", r.status_code, data["status"])
print("route:", data["snapshot"]["route_recommendation"])
print("vector:", len(data["evidence"]["vector_chunks"]))
print("kg:", len(data["evidence"]["graph_facts"]))
print("local:", len(data["evidence"]["local_products"]))
print("meds:", data["draft_plan"]["medications"])
```

## 6. Qwen Pipeline Metrics

```python
!python tools/run_qwen_pipeline_smoke_metrics.py \
  --case fever_paracetamol \
  --generation-backend transformers \
  --model /kaggle/working/cdss-qwen3-32b \
  --output qwen_smoke_metrics.json \
  --timeout-note
```

Inspect:

```python
qwen = json.load(open("qwen_smoke_metrics.json"))
print("qwen used:", qwen["qwen_or_llm_model_used"])
print("runtime:", qwen["runtime"])
print("counts:", qwen["counts"])
print("medications:", qwen["medications"])
print("localized:", qwen["localized_medications"])
for s in qwen["stage_traces"]:
    print(s)
```

## 7. Complete Evaluation Metrics

Run this after the component diagnostics pass. Start with the heuristic backend because it is fast and verifies the full logic without waiting for Qwen on every case:

```python
!python tools/run_pipeline_evaluation_metrics.py \
  --generation-backend notebook_heuristic \
  --output cdss_pipeline_metrics_heuristic.json \
  --markdown-output cdss_pipeline_metrics_heuristic.md
```

Display the metrics inside the notebook:

```python
import json
from pathlib import Path

report = json.load(open("cdss_pipeline_metrics_heuristic.json"))
print(json.dumps(report["metrics"], indent=2, ensure_ascii=False))
print(Path("cdss_pipeline_metrics_heuristic.md").read_text()[:6000])
```

Then run a smaller Qwen-backed evaluation. Qwen3-32B is heavy, so `--max-cases 2` is a good first pass:

```python
!python tools/run_pipeline_evaluation_metrics.py \
  --generation-backend transformers \
  --model /kaggle/working/cdss-qwen3-32b \
  --max-cases 2 \
  --output cdss_pipeline_metrics_qwen.json \
  --markdown-output cdss_pipeline_metrics_qwen.md
```

Key metrics to inspect:

- `route_accuracy`: clinical route decision accuracy against expected route.
- `symptom_macro_f1`: symptom extraction quality.
- `medication_hit_rate`: expected DCI appears in the draft.
- `localization_hit_rate`: generated medication was localized to a Tunisian product.
- `vector_coverage_rate`, `kg_coverage_rate`, `local_formulary_coverage_rate`: retrieval source coverage.
- `llm_model_usage_rate`: confirms Qwen/model backend was actually used.
- `vector_reranker_usage_rate`, `local_reranker_usage_rate`: confirms reranker was actually applied.
- `stage_avg_duration_ms`: latency by pipeline stage.

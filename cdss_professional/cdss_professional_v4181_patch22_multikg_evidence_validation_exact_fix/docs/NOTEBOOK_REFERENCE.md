# Notebook Reference: Tunisian Data Pipelines

Quick reference for the two integration notebooks in the project.

---

## 1. KG Notebook: `notebook38f27ecf91 (2).ipynb`

### Purpose
Unified knowledge graph by merging Hetionet (public biomedical KG) with PrimeKG, focused on disease-centric analysis.

### Key Features
- **Deterministic pagination**: Stable page boundaries for reproducible results
- **Disease-centric scope**: Extract meaningful KG subgraph instead of full graph
- **Type family compatibility**: Smart entity matching across sources
- **Value-add analysis**: Quantify merge benefits

### Configuration

```python
CFG = {
    "DISEASE_QUERY": "parkinson",              # Change for your focus
    "PRIMEKG_SCOPE": "disease_neighbors",      # "disease_neighbors" or "full"
    "PRIMEKG_CSV_CANDIDATES": [                # Data source options
        "/kaggle/input/datasets/.../kg.csv",
        "/mnt/data/kg.csv",
        "final_data_release/final_data_release.db",  # Option: SQLite
        "data/runtime/tn_master_kg_edges.csv",       # Option: Project CSV
    ],
    "PRIMEKG_CHUNKSIZE": 250_000,              # Load in chunks
    "HET_URI": "bolt://neo4j.het.io",          # Public Hetionet
    "HET_USER": "neo4j",
    "HET_PASSWORD": "",
    "HET_PAGE_SIZE": 1000,                     # Deterministic pagination
    "FUZZY_THRESHOLD": 0.92,                   # Entity matching
    "FUZZY_MARGIN": 0.03,
}
```

### Cell Breakdown

| Cell | Function | Duration |
|------|----------|----------|
| 1 | Dependencies | 2-3 min |
| 2 | Configuration & Logging | <1 min |
| 3 | Shared helpers (Type families, normalization) | <1 min |
| 4 | Hetionet connection & deterministic fetch | ~30 sec |
| 5 | PrimeKG loading with error handling | 5-10 min |
| 6 | Deterministic Hetionet neighborhood fetch | 2-3 min |
| 7 | NetworkX graph construction | 5 min |
| 8-10 | Fuzzy matching & bridge detection | 10 min |
| 11 | Value-add analysis (coverage comparison) | 2 min |
| 12 | Export & audit checks | 1 min |
| 13+ | Visualization & reporting | 5 min |

### Outputs

```
{EXPORT_PREFIX}_nodes.pkl          # Graph nodes (pickled)
{EXPORT_PREFIX}_edges.pkl          # Graph edges (pickled)
{EXPORT_PREFIX}_metadata.json      # Node metadata
{EXPORT_PREFIX}_value_analysis.json # Merge statistics
```

### When to Use
- ✅ When you want to enhance project KG with Hetionet/PrimeKG
- ✅ For disease-specific knowledge graph analysis
- ✅ To validate KG merge benefits
- ❌ Skip if using CSV-based KG only

### Integration
```python
# Load outputs after notebook
import pickle
import pandas as pd

with open('parkinson_unified_production_edges.pkl', 'rb') as f:
    edges_df = pickle.load(f)

# Export for project
edges_df.to_csv('data/runtime/tn_unified_kg_edges.csv', index=False)
```

---

## 2. Vector Store Notebook: `graphrag-cdss-m-moire-s-mantique.ipynb`

### Purpose
Build semantic FAISS vector index for dense retrieval using embeddings from medical corpora.

### Key Features
- **FAISS indexing**: GPU-accelerated similarity search
- **Sentence Transformers**: Pre-trained embeddings
- **Multi-source ingestion**: PQAA, PQAU, MedMCQA, MedQA, Textbooks
- **Metadata preservation**: Track source, section, language
- **Model consistency check**: Ensure embedding model matches project config

### Configuration

```python
# Data paths (adjust for your setup)
PQAA_PATH    = '/kaggle/input/.../ori_pqaa.json'
PQAU_PATH    = '/kaggle/input/.../ori_pqau.json'
MEDMCQA_DIR  = '/kaggle/input/.../medmcqa/data'
MEDQA_DIR    = '/kaggle/input/.../medqa/US'
TEXTBOOK_DIR = Path('/kaggle/input/.../textbooks/en')

OUTPUT_DIR = Path('data/runtime/vector_store')

# CRITICAL: Embedding model (must match project!)
EMBED_MODEL_NAME = "BAAI/bge-m3"  # ⚠️ PROJECT DEFAULT
# Alternative: "pritamdeka/S-PubMedBert-MS-MARCO"
#              "BAAI/bge-base-en-v1.5"

# Parameters
CHUNK_SIZE = 512                   # Max chunk size in tokens
OVERLAP = 50                       # Overlap between chunks
BATCH_SIZE = 64                    # Embedding batch size
FAISS_INDEX_TYPE = "Flat"         # or "IVF", "HNSW"
```

### Cell Breakdown

| Cell | Function | Duration |
|------|----------|----------|
| 1 | Install dependencies | 2-5 min |
| 2 | Configuration & GPU check | <1 min |
| 3 | Utility functions (chunking, cleaning) | <1 min |
| 4 | Load source data | 5-10 min |
| 5-6 | Data preprocessing & deduplication | 10-15 min |
| 7 | Load embedding model | 2-3 min (download if first time) |
| 8 | Generate embeddings (batch) | 20-40 min (GPU) / 2-4 hours (CPU) |
| 9 | Build FAISS index | 5 min |
| 10 | Metadata organization | 3 min |
| 11 | Export files | 2 min |
| 12-24 | Retrieval examples & statistics | 5 min |

### Outputs

```
data/runtime/vector_store/
├── medical_knowledge.faiss        # FAISS index
├── all_texts.pkl                  # Passages (pickled list)
├── all_metadata.pkl               # Metadata (pickled list of dicts)
├── passages.jsonl                 # Passages (JSONL format, optional)
├── vector_store_stats.json        # Stats & model info
└── retrieval_examples.pkl         # Example queries & results
```

### Stats File Contents
```json
{
  "model": "BAAI/bge-m3",
  "total_passages": 45000,
  "embedding_dim": 1024,
  "creation_date": "2026-04-28T14:30:00Z",
  "sources": ["pqaa", "pqau", "medmcqa", "medqa", "textbooks"],
  "chunk_size": 512,
  "batch_size": 64,
  "avg_passage_length": 347,
  "index_type": "Flat"
}
```

### When to Use
- ✅ **REQUIRED** for dense vector retrieval
- ✅ First-time setup or model changes
- ✅ When adding new training data
- ❌ Skip only if FAISS index already exists and model unchanged

### Integration
```env
# .env configuration
VECTOR_BACKEND=faiss
VECTOR_FAISS_INDEX_PATH=data/runtime/vector_store/medical_knowledge.faiss
VECTOR_FAISS_METADATA_PATH=data/runtime/vector_store/all_metadata.pkl
VECTOR_PICKLE_TEXTS_PATH=data/runtime/vector_store/all_texts.pkl
VECTOR_EMBEDDING_MODEL=BAAI/bge-m3
```

### Performance Tips

#### GPU Acceleration
```bash
# Check CUDA availability
nvidia-smi

# Monitor during notebook
watch -n 1 nvidia-smi
```

#### Memory Management
- **Embedding batch size**: 64 (adjust down if OOM)
- **FAISS index type**: Flat (fastest), IVF (memory efficient)
- **Garbage collection**: Enabled in notebook cells

#### Latency Optimization
- Flat index: ~100ms per query (fast)
- IVF index: ~20ms per query (slower build, faster query)
- GPU FAISS: 10x faster than CPU

---

## Running the Notebooks

### Option 1: Jupyter Notebook (Interactive)
```bash
cd /path/to/project
jupyter notebook notebook38f27ecf91\ \(2\).ipynb
# Or
jupyter notebook graphrag-cdss-m-moire-s-mantique.ipynb
```

### Option 2: Jupyter Lab
```bash
jupyter lab
# Then navigate to notebook and open
```

### Option 3: VS Code
1. Open notebook in VS Code
2. Select Python kernel (top-right)
3. Run cells individually or all at once

### Option 4: Batch Execution
```bash
# Convert to Python script and run
jupyter nbconvert --to script notebook38f27ecf91\ \(2\).ipynb
python notebook38f27ecf91\ \(2\).py
```

---

## Troubleshooting

### Vector Store Notebook

**Issue**: Out of memory during embedding  
**Solution**: 
- Reduce `BATCH_SIZE` from 64 to 32 or 16
- Use CPU-only mode: Remove GPU/CUDA references
- Process data in smaller chunks

**Issue**: "Model not found" error  
**Solution**:
- Check internet connection (downloads from Hugging Face)
- Pre-download model: 
  ```bash
  python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"
  ```

**Issue**: FAISS index corruption  
**Solution**:
- Delete existing index: `rm data/runtime/vector_store/*.faiss`
- Re-run notebook to rebuild
- Verify with: `faiss.read_index('medical_knowledge.faiss')`

### KG Notebook

**Issue**: Hetionet connection timeout  
**Solution**:
- Use PrimeKG CSV only (skip Hetionet)
- Set `PRIMEKG_SCOPE = "disease_neighbors"` for smaller graph

**Issue**: Memory error on large graph  
**Solution**:
- Use `PRIMEKG_SCOPE = "disease_neighbors"` instead of "full"
- Reduce `DISEASE_QUERY` to smaller subgraph

---

## Integration Checklist

After running notebooks, verify:

```bash
# Vector Store
[ ] FAISS index exists: ls -lh data/runtime/vector_store/medical_knowledge.faiss
[ ] Stats file exists: ls -lh data/runtime/vector_store/vector_store_stats.json
[ ] Model in stats = BAAI/bge-m3: grep "model" data/runtime/vector_store/vector_store_stats.json

# KG (if using)
[ ] Pickle files exist: ls -lh *_nodes.pkl *_edges.pkl
[ ] Metadata exists: ls -lh *_metadata.json
[ ] Moved to runtime: mv *_edges.pkl data/runtime/
```

---

## References

- [BAAI BGE Models](https://huggingface.co/BAAI)
- [Sentence Transformers](https://www.sbert.net/)
- [FAISS Documentation](https://github.com/facebookresearch/faiss)
- [Hetionet Project](https://het.io/)
- [Project Integration Guide](DATA_INTEGRATION_GUIDE.md)

# Data Integration & Vector Store Setup Guide

This document guides the integration of:
1. **final_data_release/** - Tunisian clinical data (medicines, evidence sections)
2. **notebook38f27ecf91 (2).ipynb** - Knowledge Graph (KG) pipeline
3. **graphrag-cdss-m-moire-s-mantique.ipynb** - Semantic vector store pipeline

## 1. Final Data Release (`final_data_release/`) Integration

### Data Structure
```
final_data_release/
├── final_data_release.db              # SQLite database
├── final_medicines.csv                # Medicines (normalized)
├── final_medicines.json
├── final_medicines.jsonl
├── final_evidence_sections.csv        # Evidence sections
├── final_evidence_sections.jsonl
├── final_uncovered_medicines.csv      # Gap analysis
├── final_source_manifest.csv          # Source tracking
├── final_release_summary.json         # Metadata
└── README_FINAL_DATA_FILES.md
```

### Integration Steps

#### Step 1.1: Copy Final Medicines to Runtime
```bash
# Copy medicines data to runtime vector corpus
cp final_data_release/final_medicines.jsonl data/runtime/tn_master_medicines.jsonl

# This file can be used for local formulary retrieval
# Map to settings: LOCAL_FORMULARY_CATALOG_PATH=data/runtime/tn_master_medicines.jsonl
```

#### Step 1.2: Process Evidence Sections for Vector Store
```bash
# Evidence sections will be indexed by graphrag notebook
cp final_data_release/final_evidence_sections.jsonl data/processed/tn_evidence_sections.jsonl

# Update settings to reference this:
# VECTOR_CORPUS_PATH=data/processed/tn_evidence_sections.jsonl
```

#### Step 1.3: SQLite Database Setup
```bash
# The SQLite database contains normalized views:
# - medicines_normalized
# - evidence_sections_indexed  
# - source_audit_trail
# - acceptance_flags

# For direct KG loading, you can query this:
sqlite3 final_data_release/final_data_release.db

# Example query for KG edges:
SELECT * FROM kg_edges LIMIT 10;

# Export to CSV for kg_catalog:
sqlite3 final_data_release/final_data_release.db \
  ".mode csv" \
  ".output data/runtime/tn_master_kg_edges.csv" \
  "SELECT * FROM kg_edges;"
```

#### Step 1.4: Update Configuration
```env
# .env or settings
VECTOR_CORPUS_PATH=data/processed/tn_evidence_sections.jsonl
LOCAL_FORMULARY_CATALOG_PATH=data/runtime/tn_master_medicines.jsonl
KG_CATALOG_PATH=data/runtime/tn_master_kg_edges.csv
```

## 2. Knowledge Graph Pipeline Integration

### Source: `notebook38f27ecf91 (2).ipynb`

This notebook creates a unified knowledge graph by merging:
- **Hetionet**: Public biomedical KG (Neo4j)
- **PrimeKG**: Production-ready KG dataset

### Integration Steps

#### Step 2.1: Configure Notebook Parameters
```python
CFG = {
    "DISEASE_QUERY": "hypertension",  # Change for your focus area
    "PRIMEKG_SCOPE": "disease_neighbors",  # or "full"
    "PRIMEKG_CSV_CANDIDATES": [
        "final_data_release/final_data_release.db",  # SQLite as fallback
        "data/runtime/tn_master_kg_edges.csv",       # Or this
        "/kaggle/input/primekg/kg.csv",
    ],
    "HET_URI": "bolt://neo4j.het.io",
    "HET_USER": "neo4j",
    "HET_PASSWORD": "",
}
```

#### Step 2.2: Notebook Outputs
The notebook generates:
- `{EXPORT_PREFIX}_nodes.pkl` - Graph nodes
- `{EXPORT_PREFIX}_edges.pkl` - Graph edges  
- `{EXPORT_PREFIX}_metadata.json` - Node metadata
- `{EXPORT_PREFIX}_value_analysis.json` - Merge statistics

#### Step 2.3: Load KG into Project
```python
# In your service or notebook
import pickle
import pandas as pd

# Load unified graph
with open('parkinson_unified_production_edges.pkl', 'rb') as f:
    edges_df = pickle.load(f)

# Export as CSV for project
edges_df.to_csv('data/runtime/tn_unified_kg_edges.csv', index=False)
```

#### Step 2.4: Neo4j Backend Configuration (Optional)
If using Neo4j directly:
```env
NEO4J_URI=bolt://your-neo4j-instance:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=cdss_tn
KG_BACKEND=neo4j
```

Then in [services/retrieval/kg_retriever.py](services/retrieval/kg_retriever.py):
```python
# The Neo4jClient will query the live graph instead of CSV
```

## 3. Semantic Vector Store Pipeline Integration

### Source: `graphrag-cdss-m-moire-s-mantique.ipynb`

This notebook creates a FAISS-indexed semantic vector store using:
- Multiple data sources: PQAA, PQAU, MedMCQA, MedQA, Textbooks
- Embedding models: BGE (recommended) or S-PubMedBert
- Dense retrieval via FAISS

### Integration Steps

#### Step 3.1: Configure Notebook
```python
# Key configuration from the notebook
PQAA_PATH = 'final_data_release/...'  # Point to your data
PQAU_PATH = 'final_data_release/...'
TEXTBOOK_DIR = 'data/raw/textbooks'

# Critical: Use consistent embedding model
EMBED_MODEL_NAME = "BAAI/bge-m3"  # Must match project model!
# (Or: pritamdeka/S-PubMedBert-MS-MARCO if biomedical-specific)

OUTPUT_DIR = Path('data/runtime/vector_store')
```

#### Step 3.2: Output Structure
The notebook generates:
```
data/runtime/vector_store/
├── medical_knowledge.faiss           # FAISS index
├── all_texts.pkl                      # Passages / documents
├── all_metadata.pkl                   # Metadata (source, section, etc)
├── vector_store_stats.json            # Model info & counts
├── passages.jsonl                     # Serialized passages
└── retrieval_examples.pkl             # Example retrieval results
```

#### Step 3.3: Model Consistency Check
```python
# The notebook creates vector_store_stats.json containing:
{
  "model": "BAAI/bge-m3",
  "total_passages": 45000,
  "embedding_dim": 1024,
  "creation_date": "2026-04-28",
  "sources": ["pqaa", "pqau", "medmcqa", "medqa", "textbooks"]
}

# Verify this matches project settings
# If mismatch: VECTOR_EMBEDDING_MODEL must be updated
```

#### Step 3.4: Configure Project to Use FAISS Index
```env
# .env
VECTOR_BACKEND=faiss
VECTOR_FAISS_INDEX_PATH=data/runtime/vector_store/medical_knowledge.faiss
VECTOR_FAISS_METADATA_PATH=data/runtime/vector_store/all_metadata.pkl
VECTOR_PICKLE_TEXTS_PATH=data/runtime/vector_store/all_texts.pkl
VECTOR_EMBEDDING_MODEL=BAAI/bge-m3
```

#### Step 3.5: Update [libs/knowledge_connectors/vector_index_client.py](libs/knowledge_connectors/vector_index_client.py)
```python
# Already supports FAISS backend
# Just enable with settings above
client = VectorIndexClient(
    backend="faiss",
    embedding_model_name="BAAI/bge-m3",
    faiss_index_path=Path("data/runtime/vector_store/medical_knowledge.faiss"),
    faiss_metadata_path=Path("data/runtime/vector_store/all_metadata.pkl"),
    pickle_texts_path=Path("data/runtime/vector_store/all_texts.pkl"),
)
```

## 4. Complete Integration Workflow

### Phase 1: Data Preparation
```bash
# 1. Copy final Tunisian data
cp final_data_release/final_medicines.jsonl data/runtime/
cp final_data_release/final_evidence_sections.jsonl data/processed/

# 2. Extract KG data from SQLite
sqlite3 final_data_release/final_data_release.db \
  ".mode csv" ".output data/runtime/tn_master_kg_edges.csv" \
  "SELECT * FROM kg_edges;"
```

### Phase 2: Run KG Notebook (Optional)
```bash
# If you want to merge with Hetionet/PrimeKG:
jupyter notebook notebook38f27ecf91\ \(2\).ipynb

# Outputs go to: current directory
# Move to project data/runtime afterwards
mv parkinson_unified_production_*.pkl data/runtime/
```

### Phase 3: Run Vector Store Notebook (Required)
```bash
# This creates the FAISS index
jupyter notebook graphrag-cdss-m-moire-s-mantique.ipynb

# Outputs to: data/runtime/vector_store/ (already configured in notebook)
```

### Phase 4: Configure Project
```env
# .env file
VECTOR_BACKEND=faiss
VECTOR_FAISS_INDEX_PATH=data/runtime/vector_store/medical_knowledge.faiss
VECTOR_FAISS_METADATA_PATH=data/runtime/vector_store/all_metadata.pkl
VECTOR_PICKLE_TEXTS_PATH=data/runtime/vector_store/all_texts.pkl
VECTOR_EMBEDDING_MODEL=BAAI/bge-m3

KG_BACKEND=csv
KG_CATALOG_PATH=data/runtime/tn_master_kg_edges.csv

LOCAL_FORMULARY_BACKEND=csv
LOCAL_FORMULARY_CATALOG_PATH=data/runtime/tn_master_medicines.jsonl
```

### Phase 5: Verify Integration
```bash
# Run integration test
python -m pytest tests/unit/test_runtime_backends.py -v

# Or quick check in Python
python << 'EOF'
from apps.api.container import get_vector_client, get_kg_client, get_local_formulary_client

vec_client = get_vector_client()
kg_client = get_kg_client()
local_client = get_local_formulary_client()

print(f"✓ Vector store: {vec_client.backend}")
print(f"✓ KG backend: {kg_client.backend}")
print(f"✓ Local formulary: {local_client.backend}")

# Try a retrieval
results = vec_client.similarity_search("hypertension treatment", top_k=3)
print(f"✓ Retrieved {len(results)} results")
EOF
```

## 5. Data Quality & Validation

### Vector Store Validation
```python
# In notebook or script:
import json
from pathlib import Path

stats_path = Path("data/runtime/vector_store/vector_store_stats.json")
with open(stats_path) as f:
    stats = json.load(f)

print(f"Model: {stats['model']}")
print(f"Passages: {stats['total_passages']:,}")
print(f"Dimension: {stats['embedding_dim']}")
print(f"Sources: {', '.join(stats['sources'])}")

# Verify against project config
from libs.config.settings import get_settings
settings = get_settings()

if settings.vector_embedding_model != stats['model']:
    print("⚠️  WARNING: Model mismatch!")
    print(f"  Expected: {settings.vector_embedding_model}")
    print(f"  Found: {stats['model']}")
```

### KG Validation
```python
# Check edge count and types
import pandas as pd

edges = pd.read_csv("data/runtime/tn_master_kg_edges.csv")
print(f"Total edges: {len(edges)}")
print(f"Unique relation types: {edges['relation'].nunique()}")
print(f"Source types: {edges['x_type'].unique()}")
print(f"Target types: {edges['y_type'].unique()}")
```

### Local Formulary Validation
```python
# Verify medicines data
import json

with open("data/runtime/tn_master_medicines.jsonl") as f:
    medicines = [json.loads(line) for line in f]

print(f"Total medicines: {len(medicines)}")
print(f"Sample: {medicines[0]}")
```

## 6. Performance Optimization

### Vector Store
- FAISS index: ~100ms per query on GPU
- Memory: ~1-2GB for index + metadata
- Pre-load at service startup (lazy loading already implemented)

### KG
- CSV loading: ~50ms for disease query
- Neo4j querying: ~100-200ms per cypher query
- Prefer Neo4j for large graphs (>1M edges)

### Local Formulary
- CSV loading: ~30ms
- In-memory search: <5ms

## 7. Troubleshooting

### Vector Store Model Mismatch
```
Error: "Embedding dimension mismatch"
Solution:
1. Check VECTOR_EMBEDDING_MODEL in .env
2. Verify vector_store_stats.json contains same model
3. If mismatch: Rebuild vector store with correct model
```

### KG Edge Loading Fails
```
Error: "KG CSV missing required columns"
Solution:
1. Verify KG export includes: x_id, x_type, relation, y_id, y_type
2. Check CSV encoding (UTF-8)
3. Ensure no circular references
```

### Neo4j Connection Issues
```
Error: "Failed to connect to Neo4j"
Solution:
1. Verify NEO4J_URI is accessible
2. Check credentials (NEO4J_USER, NEO4J_PASSWORD)
3. Ensure firewall allows port 7687
```

## 8. File Mapping Reference

| Data Source | Input File | Project Path | Backend |
|-------------|-----------|--------------|---------|
| Final Release | final_data_release.db | data/runtime/ | SQLite (optional) |
| Medicines | final_medicines.jsonl | data/runtime/tn_master_medicines.jsonl | CSV/JSONL |
| Evidence Sections | final_evidence_sections.jsonl | data/processed/tn_evidence_sections.jsonl | JSONL |
| KG Edges | final_data_release.db → kg_edges | data/runtime/tn_master_kg_edges.csv | CSV |
| Vector Store | graphrag notebook output | data/runtime/vector_store/ | FAISS |
| Unified KG (opt) | notebook38f27ecf91 output | data/runtime/tn_unified_kg* | Pickle |

## 9. Next Steps

1. **Immediate**: Run data preparation phase (Phase 1)
2. **Short-term**: Run vector store notebook (Phase 3)
3. **Optional**: Run KG merge notebook if enhancing with Hetionet
4. **Verify**: Run integration tests (Phase 5)
5. **Monitor**: Track performance metrics during production rollout

## 10. References

- [Vector Index Client](libs/knowledge_connectors/vector_index_client.py)
- [KG Client](libs/knowledge_connectors/neo4j_client.py)
- [Retrieval Service](services/retrieval/hybrid_retriever.py)
- [Settings Configuration](libs/config/settings.py)
- [Notebook: KG Pipeline](notebook38f27ecf91%20(2).ipynb)
- [Notebook: Vector Store](graphrag-cdss-m-moire-s-mantique.ipynb)

# Data Integration Checklist

Use this checklist to track the integration of Tunisian data, knowledge graphs, and vector stores into the Clinical Prescription System.

## Pre-Integration Verification

- [ ] **Verify final_data_release/ exists**
  - Location: `final_data_release/`
  - Contains: `final_data_release.db`, medicines, evidence sections, manifest
  - Command: `ls -lh final_data_release/`

- [ ] **Verify notebooks are present**
  - KG notebook: `notebook38f27ecf91 (2).ipynb`
  - Vector notebook: `graphrag-cdss-m-moire-s-mantique.ipynb`
  - Command: `ls -1 *.ipynb`

- [ ] **Check available disk space**
  - Vector store needs ~2-5GB
  - KG data needs ~1-2GB
  - Command: `df -h`

- [ ] **Verify Python environment**
  - Required: Python 3.10+, pandas, numpy, torch
  - Command: `python --version && pip list | grep -E "(torch|pandas|faiss)"`

## Phase 1: Data Preparation

### 1.1 Extract Medicines Data
- [ ] Copy medicines to runtime
  ```bash
  cp final_data_release/final_medicines.jsonl data/runtime/tn_master_medicines.jsonl
  ```
- [ ] Verify file exists and has content
  ```bash
  wc -l data/runtime/tn_master_medicines.jsonl
  head -1 data/runtime/tn_master_medicines.jsonl | jq .
  ```

### 1.2 Extract Evidence Sections
- [ ] Copy evidence sections
  ```bash
  cp final_data_release/final_evidence_sections.jsonl data/processed/tn_evidence_sections.jsonl
  ```
- [ ] Verify file exists
  ```bash
  wc -l data/processed/tn_evidence_sections.jsonl
  ```

### 1.3 Extract KG Edges from SQLite
- [ ] Verify SQLite database exists
  ```bash
  sqlite3 final_data_release/final_data_release.db ".tables"
  ```
- [ ] Export KG edges
  ```bash
  sqlite3 final_data_release/final_data_release.db \
    ".mode csv" ".output data/runtime/tn_master_kg_edges.csv" \
    "SELECT * FROM kg_edges;"
  ```
- [ ] Verify CSV header
  ```bash
  head -1 data/runtime/tn_master_kg_edges.csv
  ```

### 1.4 Data Quality Checks
- [ ] Medicine records are valid JSON
  ```bash
  python -c "import json; [json.loads(l) for l in open('data/runtime/tn_master_medicines.jsonl')]"
  ```
- [ ] Evidence sections have required fields
  ```bash
  # Should have: source, title, content, metadata
  head -1 data/processed/tn_evidence_sections.jsonl | jq 'keys'
  ```
- [ ] KG edges have required columns
  ```bash
  # Should have: x_id, x_type, relation, y_id, y_type
  head -2 data/runtime/tn_master_kg_edges.csv | tail -1
  ```

## Phase 2: Optional - KG Notebook Integration

Skip this phase if you don't need Hetionet/PrimeKG merging.

- [ ] **Open KG notebook**
  ```bash
  jupyter notebook "notebook38f27ecf91 (2).ipynb"
  ```

- [ ] **Configure notebook parameters**
  - [ ] Update `DISEASE_QUERY` if needed (default: "parkinson")
  - [ ] Update `PRIMEKG_SCOPE` (recommended: "disease_neighbors")
  - [ ] Set `PRIMEKG_CSV_CANDIDATES` to include `data/runtime/tn_master_kg_edges.csv`
  - [ ] Set `HET_URI`, `HET_USER`, `HET_PASSWORD` (or leave for Hetionet public)

- [ ] **Run all notebook cells**
  - [ ] Cell 1: Dependencies
  - [ ] Cell 2: Configuration
  - [ ] Cells 3-19: Processing and visualization

- [ ] **Verify notebook outputs**
  - [ ] Check for `*_nodes.pkl` files
  - [ ] Check for `*_edges.pkl` files
  - [ ] Check for `*_metadata.json`
  - [ ] Check for `*_value_analysis.json`

- [ ] **Move outputs to project** (optional)
  ```bash
  mv parkinson_unified_production_*.pkl data/runtime/
  ```

- [ ] **Update settings if using unified KG**
  ```env
  # Update .env:
  KG_JSON_PATH=data/runtime/parkinson_unified_production_metadata.json
  ```

## Phase 3: Vector Store Integration (REQUIRED)

This phase creates the semantic vector index required for retrieval.

- [ ] **Open vector store notebook**
  ```bash
  jupyter notebook graphrag-cdss-m-moire-s-mantique.ipynb
  ```

- [ ] **Configure data paths in notebook**
  - [ ] `PQAA_PATH`: Point to your PQAA data (if available)
  - [ ] `PQAU_PATH`: Point to your PQAU data (if available)
  - [ ] `TEXTBOOK_DIR`: Point to textbooks (if available)
  - [ ] `OUTPUT_DIR`: Should be `Path('data/runtime/vector_store')`

- [ ] **Configure embedding model**
  - [ ] Use `EMBED_MODEL_NAME = "BAAI/bge-m3"` (must match project!)
  - [ ] Verify in notebook output section

- [ ] **Run all notebook cells**
  - [ ] Cell 1: Install dependencies
  - [ ] Cell 2: Configuration & imports
  - [ ] Cells 3-25: Build vector store
  - [ ] This may take 30-60 minutes depending on data size

- [ ] **Monitor notebook progress**
  - [ ] Watch for tqdm progress bars
  - [ ] Verify GPU/CPU usage
  - [ ] Check memory consumption (should stay <8GB)

- [ ] **Verify vector store outputs**
  ```bash
  ls -lh data/runtime/vector_store/
  # Should contain:
  # - medical_knowledge.faiss
  # - all_texts.pkl
  # - all_metadata.pkl
  # - vector_store_stats.json
  ```

- [ ] **Check vector store statistics**
  ```bash
  python -c "import json; print(json.dumps(json.load(open('data/runtime/vector_store/vector_store_stats.json')), indent=2))"
  ```

- [ ] **Verify model consistency**
  - [ ] Check that model in `vector_store_stats.json` is "BAAI/bge-m3"
  - [ ] Total passages should be >1000
  - [ ] Embedding dimension should be 1024 (for BGE-M3)

## Phase 4: Project Configuration

- [ ] **Update .env file** (or create if needed)
  ```bash
  cp .env.example .env
  ```

- [ ] **Configure vector backend**
  ```env
  VECTOR_BACKEND=faiss
  VECTOR_FAISS_INDEX_PATH=data/runtime/vector_store/medical_knowledge.faiss
  VECTOR_FAISS_METADATA_PATH=data/runtime/vector_store/all_metadata.pkl
  VECTOR_PICKLE_TEXTS_PATH=data/runtime/vector_store/all_texts.pkl
  VECTOR_EMBEDDING_MODEL=BAAI/bge-m3
  VECTOR_CORPUS_PATH=data/processed/tn_evidence_sections.jsonl
  ```

- [ ] **Configure KG backend**
  ```env
  KG_BACKEND=csv
  KG_CATALOG_PATH=data/runtime/tn_master_kg_edges.csv
  # Or for Neo4j:
  # KG_BACKEND=neo4j
  # NEO4J_URI=bolt://your-instance:7687
  # NEO4J_USER=neo4j
  # NEO4J_PASSWORD=your-password
  ```

- [ ] **Configure local formulary**
  ```env
  LOCAL_FORMULARY_CATALOG_PATH=data/runtime/tn_master_medicines.jsonl
  ```

- [ ] **Configure models** (should already be set by models_configuration.md)
  ```env
  RERANKER_MODEL=BAAI/bge-reranker-v2-m3
  RERANKER_FALLBACK_MODEL=cross-encoder/ms-marco-MiniLM-L6-v2
  TRANSLATION_MODEL=facebook/nllb-200-distilled-1.3B
  DEDUPLICATION_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  LLM_MODEL=Qwen3-32B
  ```

## Phase 5: Integration Verification

- [ ] **Run verification script**
  ```bash
  python tools/verify_data_integration.py
  ```
  - [ ] Final data release: ✓
  - [ ] Runtime data structure: ✓
  - [ ] Vector store: ✓
  - [ ] Configuration: ✓
  - [ ] Services: ✓

- [ ] **Quick Python import test**
  ```bash
  python -c "
  from libs.config.settings import get_settings
  from apps.api.container import get_vector_client, get_kg_client, get_local_formulary_client
  
  s = get_settings()
  v = get_vector_client()
  k = get_kg_client()
  l = get_local_formulary_client()
  
  print('✓ All services loaded')
  print(f'  Vector: {v.backend}')
  print(f'  KG: {k.backend}')
  print(f'  Local: {l.backend}')
  "
  ```

- [ ] **Test vector retrieval**
  ```bash
  python -c "
  from libs.knowledge_connectors.vector_index_client import VectorIndexClient
  from libs.config.settings import get_settings
  
  settings = get_settings()
  client = VectorIndexClient(
      backend='faiss',
      embedding_model_name=settings.vector_embedding_model,
      faiss_index_path=settings.vector_faiss_index_path,
      faiss_metadata_path=settings.vector_faiss_metadata_path,
      pickle_texts_path=settings.vector_pickle_texts_path,
  )
  
  results = client.similarity_search('hypertension treatment', top_k=3)
  print(f'✓ Retrieved {len(results)} results')
  for r in results:
      print(f'  - Score: {r.score}, Source: {r.source}')
  "
  ```

- [ ] **Test KG retrieval**
  ```bash
  python -c "
  from services.retrieval.kg_retriever import KGRetriever
  
  retriever = KGRetriever()
  results = retriever.retrieve('hypertension treatment')
  print(f'✓ Retrieved {len(results)} facts')
  "
  ```

- [ ] **Test local formulary**
  ```bash
  python -c "
  from services.retrieval.local_formulary_retriever import LocalFormularyRetriever
  
  retriever = LocalFormularyRetriever()
  results = retriever.retrieve('aspirin')
  print(f'✓ Retrieved {len(results)} products')
  "
  ```

## Phase 6: Unit Tests

- [ ] **Run backend tests**
  ```bash
  python -m pytest tests/unit/test_runtime_backends.py -v
  ```
  - [ ] test_vector_index: PASS
  - [ ] test_kg_client: PASS
  - [ ] test_local_formulary: PASS

- [ ] **Run retrieval tests**
  ```bash
  python -m pytest tests/unit/ -k retrieval -v
  ```

- [ ] **Run integration tests** (if available)
  ```bash
  python -m pytest tests/integration/ -v
  ```

## Phase 7: Production Validation

- [ ] **Performance testing**
  ```bash
  # Vector search latency
  python -c "
  import time
  from apps.api.container import get_vector_client
  
  client = get_vector_client()
  for _ in range(10):
      start = time.time()
      results = client.similarity_search('treatment', top_k=5)
      elapsed = (time.time() - start) * 1000
      print(f'Query latency: {elapsed:.1f}ms')
  "
  ```

- [ ] **Load testing**
  ```bash
  # Run 100 concurrent queries
  ab -n 100 -c 10 http://localhost:8000/api/retrieve
  ```

- [ ] **Memory usage check**
  ```bash
  # Monitor service memory
  ps aux | grep python
  free -h
  ```

- [ ] **Data consistency validation**
  ```bash
  python -c "
  from libs.config.settings import get_settings
  from apps.api.container import get_retrieval_service
  
  svc = get_retrieval_service()
  # Run end-to-end retrieval
  from libs.contracts.patient import PatientSnapshot
  
  patient = PatientSnapshot(age=60, sex='M', conditions=['hypertension'])
  # This will test full pipeline
  print('✓ End-to-end retrieval test passed')
  "
  ```

## Phase 8: Documentation & Handoff

- [ ] **Create deployment notes**
  - [ ] Record which models are being used
  - [ ] Document custom configurations
  - [ ] Note any data gaps or limitations

- [ ] **Update README**
  - [ ] Add data integration section
  - [ ] Include quick-start commands
  - [ ] Link to [DATA_INTEGRATION_GUIDE.md](DATA_INTEGRATION_GUIDE.md)

- [ ] **Archive verification artifacts**
  ```bash
  mkdir -p logs/integration_$(date +%Y%m%d_%H%M%S)
  python tools/verify_data_integration.py > logs/integration_$(date +%Y%m%d_%H%M%S)/verify.log
  cp .env logs/integration_$(date +%Y%m%d_%H%M%S)/.env.bak
  ```

- [ ] **Commit to version control**
  ```bash
  git add docs/DATA_INTEGRATION_GUIDE.md
  git add tools/verify_data_integration.py
  git add .env (if not in .gitignore)
  git commit -m "feat: Integrate Tunisian data, KG, and vector stores"
  ```

## Troubleshooting

### Vector Store Issues
- [ ] **FAISS index not found**
  - Solution: Run vector store notebook (Phase 3)
  
- [ ] **Model mismatch error**
  - Solution: Check `vector_store_stats.json` model matches `VECTOR_EMBEDDING_MODEL`
  
- [ ] **Out of memory**
  - Solution: Reduce `FAISS_METADATA_PATH` size or use CPU-only mode

### KG Issues
- [ ] **CSV parsing error**
  - Solution: Check CSV encoding (should be UTF-8)
  
- [ ] **Missing columns**
  - Solution: Verify KG export includes: x_id, x_type, relation, y_id, y_type

- [ ] **Neo4j connection failed**
  - Solution: Check `NEO4J_URI` and credentials

### Data Issues
- [ ] **Corrupted JSONL**
  - Solution: Validate with `python -c "import json; [json.loads(l) for l in open('file.jsonl')]"`
  
- [ ] **Missing Tunisian medicines**
  - Solution: Check `final_data_release/final_medicines.jsonl` has required fields

## Success Criteria

All of the following must be true for successful integration:

- [ ] Vector store index loads without errors
- [ ] KG retrieval returns results for clinical queries
- [ ] Local formulary retrieves Tunisian medicines
- [ ] All services pass unit tests
- [ ] Query latency <500ms (p95)
- [ ] No memory leaks in long-running tests
- [ ] Models are consistent across components
- [ ] Data quality validated and documented

## Next Steps After Integration

1. **Fine-tune reranking**: Run reranker benchmark with clinical queries
2. **Validate clinical accuracy**: Have clinicians review retrieved evidence
3. **Performance optimization**: Profile and optimize hot paths
4. **Monitoring setup**: Add logs and metrics for production
5. **Documentation**: Create runbooks for operations team

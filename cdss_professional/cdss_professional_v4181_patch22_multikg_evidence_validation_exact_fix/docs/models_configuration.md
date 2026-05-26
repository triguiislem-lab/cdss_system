# Model Configuration Guide

This document describes the integrated models for the Clinical Prescription System Tunisia runtime.

## Vector Retrieval & Embedding

### BGE-M3 (BAAI/bge-m3)
- **Role**: Main vector retrieval model
- **Type**: Dense retrieval / embedding model
- **Characteristics**:
  - Multilingual support (100+ languages)
  - 384-dimensional embeddings
  - Strong performance on clinical information retrieval
  - Supports both retrieval and reranking tasks
- **Configuration**: `vector_embedding_model = "BAAI/bge-m3"`
- **Use Case**: Converting clinical queries and evidence into dense vectors for semantic similarity search

## Reranking

### BGE Reranker v2 M3 (BAAI/bge-reranker-v2-m3)
- **Role**: Main reranking model
- **Type**: Cross-encoder for relevance scoring
- **Characteristics**:
  - Multilingual support
  - Direct relevance scoring (no embedding space required)
  - Superior accuracy for evidence ranking
  - Medical terminology awareness
- **Configuration**: `reranker_model = "BAAI/bge-reranker-v2-m3"`
- **Use Case**: Re-score retrieved evidence chunks based on clinical relevance to queries

### ms-marco-MiniLM-L6-v2 (cross-encoder/ms-marco-MiniLM-L6-v2)
- **Role**: English-only reranking fallback
- **Type**: Cross-encoder for relevance scoring
- **Characteristics**:
  - Lightweight (smaller memory footprint)
  - English language optimized
  - Fast inference suitable for fallback scenarios
- **Configuration**: `reranker_fallback_model = "cross-encoder/ms-marco-MiniLM-L6-v2"`
- **Use Case**: Fallback when processing English-only content or resource-constrained environments

## Translation

### NLLB-200 Distilled 1.3B (facebook/nllb-200-distilled-1.3B)
- **Role**: Multilingual translation support
- **Type**: Sequence-to-sequence transformer (distilled)
- **Characteristics**:
  - Supports 200+ languages
  - Lightweight distilled version (1.3B parameters)
  - Preserves medical terminology during translation
  - Fast inference suitable for edge deployment
- **Configuration**: `translation_model = "facebook/nllb-200-distilled-1.3B"`
- **Supported Languages**: Arabic, English, French, German, Spanish, Portuguese, Italian, Japanese, Chinese, Korean, etc.
- **Use Case**:
  - Translating clinical guidance to local languages (e.g., Tunisian Arabic)
  - Multilingual evidence retrieval and presentation
  - Localizing prescriptions and safety information

## Deduplication & Similarity

### paraphrase-multilingual-MiniLM-L12-v2 (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **Role**: Lightweight multilingual similarity and deduplication
- **Type**: Sentence embeddings model
- **Characteristics**:
  - Multilingual (50+ languages)
  - Lightweight (384-dimensional embeddings)
  - Fast inference suitable for real-time processing
  - Cross-lingual semantic similarity
- **Configuration**: `deduplication_model = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"`
- **Use Case**:
  - Deduplicating similar evidence chunks across languages
  - Finding paraphrased content in knowledge base
  - Clustering similar clinical guidance
  - Low-latency similarity scoring

## LLM - Generation

### Qwen3-32B
- **Role**: Clinical prescription generation and reasoning
- **Type**: Large language model for instruction-following and reasoning
- **Characteristics**:
  - 32B parameters
  - Strong medical/clinical understanding
  - Multilingual support
  - Efficient inference
- **Configuration**: `llm_model = "Qwen3-32B"`
- **Use Case**:
  - Generating prescriptions from clinical evidence
  - Reasoning over evidence bundles
  - Medical terminology understanding
  - Multilingual response generation

## Environment Variables

Configure models via `.env`:

```bash
# Vector embeddings (main retrieval model)
VECTOR_EMBEDDING_MODEL=BAAI/bge-m3

# Reranking models
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_FALLBACK_MODEL=cross-encoder/ms-marco-MiniLM-L6-v2

# Translation
TRANSLATION_MODEL=facebook/nllb-200-distilled-1.3B

# Deduplication
DEDUPLICATION_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

# LLM Generation
LLM_MODEL=Qwen3-32B
```

## Integration Points

### 1. Vector Retrieval (`services/retrieval/vector_retriever.py`)
- Uses `VECTOR_EMBEDDING_MODEL` for semantic search
- Integrated via `VectorIndexClient`

### 2. Reranking (`services/retrieval/evidence_ranker.py`)
- Uses `RERANKER_MODEL` for relevance scoring
- Falls back to `RERANKER_FALLBACK_MODEL` for English-only content
- Combines with traditional scoring weights for hybrid ranking

### 3. Translation (`services/localization/translation_service.py`)
- Uses `TRANSLATION_MODEL` for multilingual translation
- Supports batch translation for efficiency
- Preserves medical terminology through FLORES-200 language codes

### 4. Deduplication (`services/retrieval/deduplication_service.py`)
- Uses `DEDUPLICATION_MODEL` for similarity detection
- Supports configurable similarity thresholds
- Applied to chunks, facts, and products

### 5. Generation (`services/generation/llm_router.py`)
- Uses `LLM_MODEL` for prescription generation
- Falls back to notebook heuristic if generation fails
- Supports OpenAI-compatible API or local inference

## Performance Considerations

### Model Loading
- All models use lazy loading (loaded on first use)
- Use `CUDA` when available for faster inference
- Consider memory constraints for concurrent model usage

### Inference Optimization
- BGE-M3: ~100ms per query (300+ queries/sec on GPU)
- BGE Reranker v2 M3: ~50ms per relevance score
- NLLB-200 Distilled: ~200-500ms per translation (depending on length)
- paraphrase-multilingual-MiniLM: ~5-10ms per similarity (highly parallelizable)
- Qwen3-32B: Variable based on output length (typically 1-5 seconds)

### Resource Usage

| Model | Parameters | Memory | Recommended Setup |
|-------|-----------|--------|-------------------|
| BGE-M3 | 279M | ~1.1GB | GPU recommended |
| BGE Reranker v2 M3 | 270M | ~1.1GB | GPU recommended |
| NLLB-200 Distilled | 1.3B | ~2.6GB | GPU recommended |
| paraphrase-multilingual-MiniLM | 66M | ~250MB | CPU sufficient |
| ms-marco-MiniLM-L6-v2 | 22M | ~90MB | CPU efficient |
| Qwen3-32B | 32B | ~64GB | GPU required |

## Fallback Behavior

The system maintains graceful degradation:
- **BGE Reranker v2 M3** unavailable → Use **ms-marco-MiniLM-L6-v2**
- **Translation** unavailable → Present content in original language
- **Deduplication** unavailable → Skip duplicate removal (return all results)
- **LLM Generation** unavailable → Use notebook heuristic templates

## Custom Model Configuration

To use different models, update `.env`:

```bash
# Alternative reranker
RERANKER_MODEL=cross-encoder/qnli-distilroberta-base

# Alternative translation
TRANSLATION_MODEL=Helsinki-NLP/opus-mt-en-ar

# Alternative deduplication
DEDUPLICATION_MODEL=sentence-transformers/multilingual-e5-large
```

## References

- [BAAI BGE Models](https://huggingface.co/BAAI)
- [Meta NLLB Models](https://huggingface.co/facebook/nllb-200)
- [Sentence Transformers](https://www.sbert.net/)
- [Qwen Models](https://huggingface.co/Qwen)

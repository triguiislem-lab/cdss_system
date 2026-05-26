"""
Integration Guide for New Models in Clinical Prescription System

This guide provides examples of how to use the newly integrated models:
- BGE-M3: Vector retrieval
- BGE Reranker v2 M3: Evidence reranking
- ms-marco-MiniLM-L6-v2: English fallback reranking
- NLLB-200 Distilled 1.3B: Translation
- paraphrase-multilingual-MiniLM-L12-v2: Deduplication
- Qwen3-32B: LLM generation
"""

# ==============================================================================
# 1. VECTOR RETRIEVAL with BGE-M3
# ==============================================================================

from services.retrieval.vector_retriever import VectorRetriever
from libs.knowledge_connectors.vector_index_client import VectorIndexClient

# Initialize with BGE-M3 model
vector_client = VectorIndexClient(
    backend="faiss",
    embedding_model_name="BAAI/bge-m3",  # Now using BGE-M3
    faiss_index_path="path/to/index",
    faiss_metadata_path="path/to/metadata"
)

retriever = VectorRetriever(client=vector_client)

# Query example
results = retriever.retrieve(
    query="What is the treatment for hypertension?",
    top_k=5
)

for chunk in results:
    print(f"Score: {chunk.score}, Content: {chunk.content[:100]}...")


# ==============================================================================
# 2. EVIDENCE RERANKING with BGE Reranker v2 M3
# ==============================================================================

from services.retrieval.evidence_ranker import EvidenceRanker
from libs.contracts.evidence import EvidenceChunk

# Initialize ranker with configured models
ranker = EvidenceRanker(
    reranker_model="BAAI/bge-reranker-v2-m3",
    fallback_model="cross-encoder/ms-marco-MiniLM-L6-v2"
)

# Example chunks to rerank
chunks = [
    EvidenceChunk(
        source="guideline",
        title="Hypertension Management",
        content="First-line agents include...",
        score=0.75
    ),
    EvidenceChunk(
        source="safety_rule",
        title="Drug Interactions",
        content="ACE inhibitors may interact with...",
        score=0.68
    ),
]

# Rerank evidence
query_terms = ["hypertension", "treatment"]
ranked = ranker.rank_chunks(chunks, query_terms=query_terms)

for chunk in ranked:
    print(f"Reranked score: {chunk.score}")


# ==============================================================================
# 3. TRANSLATION with NLLB-200 Distilled 1.3B
# ==============================================================================

from services.localization.translation_service import TranslationService

translator = TranslationService(
    model_name="facebook/nllb-200-distilled-1.3B"
)

# Single translation
english_text = "Take one tablet twice daily"
arabic_text = translator.translate(
    text=english_text,
    source_lang="en",
    target_lang="ar"  # Tunisian Arabic
)
print(f"English: {english_text}")
print(f"Arabic: {arabic_text}")

# Batch translation (more efficient)
english_texts = [
    "Take one tablet twice daily",
    "May cause drowsiness",
    "Avoid alcohol consumption"
]
arabic_texts = translator.batch_translate(
    texts=english_texts,
    source_lang="en",
    target_lang="ar",
    batch_size=8
)

# Get available languages
langs = translator.get_supported_languages()
print(f"Supported languages: {langs}")


# ==============================================================================
# 4. DEDUPLICATION with paraphrase-multilingual-MiniLM-L12-v2
# ==============================================================================

from services.retrieval.deduplication_service import DeduplicationService
from libs.contracts.evidence import EvidenceChunk

deduplicator = DeduplicationService(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    similarity_threshold=0.85
)

# Example: Deduplicate evidence chunks
chunks = [
    EvidenceChunk(
        source="guideline",
        title="Hypertension Treatment",
        content="First-line treatment for hypertension includes ACE inhibitors",
        score=0.9
    ),
    EvidenceChunk(
        source="textbook",
        title="Management of High Blood Pressure",
        content="Initial therapy for high blood pressure may include ACE inhibitor drugs",
        score=0.85
    ),
    EvidenceChunk(
        source="guideline",
        title="Drug Safety",
        content="Avoid NSAIDs with ACE inhibitors due to renal impairment risk",
        score=0.72
    ),
]

# Deduplicate
result = deduplicator.deduplicate_chunks(chunks)

print(f"Kept {len(result.kept_items)} items")
print(f"Removed {result.removed_count} duplicates")

# Show similarity pairs
for text1, text2, similarity in result.similarity_pairs:
    print(f"Similar (sim={similarity:.3f}):")
    print(f"  - {text1[:60]}...")
    print(f"  - {text2[:60]}...")

# Find similar items to a query
query = "What is the treatment for high blood pressure?"
similar = deduplicator.find_similar(
    query_text=query,
    items=chunks,
    extract_text=lambda x: x.content,
    top_k=3,
    threshold=0.75
)

for idx, similarity in similar:
    print(f"Similar chunk {idx}: {similarity:.3f}")


# ==============================================================================
# 5. LLM GENERATION with Qwen3-32B
# ==============================================================================

from services.generation.llm_router import LLMRouter
from libs.contracts.patient import PatientSnapshot
from libs.contracts.evidence import EvidenceBundle

# Initialize router with Qwen3-32B
llm_router = LLMRouter(
    backend="openai_compatible",  # or "llama_cpp", "notebook_heuristic"
    model="Qwen3-32B",
    base_url="http://localhost:8000",  # Your inference server
    temperature=0.2,
    max_output_tokens=400
)

# Generate prescription from evidence
patient = PatientSnapshot(
    age=55,
    sex="M",
    conditions=["hypertension"],
    current_meds=["Metoprolol 50mg daily"]
)

evidence = EvidenceBundle(
    chunks=[],  # Populated by retrieval service
    facts=[],   # Populated by retrieval service
    products=[] # Populated by retrieval service
)

prompt = """Based on the patient profile and evidence, generate a prescription.
Patient: 55-year-old male with hypertension on Metoprolol."""

prescription = llm_router.generate_structured_text(
    prompt=prompt,
    snapshot=patient,
    evidence=evidence
)

print("Generated Prescription:")
print(prescription)


# ==============================================================================
# 6. INTEGRATED HYBRID RETRIEVAL (All components together)
# ==============================================================================

from apps.api.container import (
    get_vector_client,
    get_retrieval_service,
    get_translation_service,
    get_deduplication_service,
    get_generation_service
)

# Get all services from container
retrieval_svc = get_retrieval_service()
translation_svc = get_translation_service()
deduplication_svc = get_deduplication_service()
generation_svc = get_generation_service()

# Example workflow:
# 1. Retrieve evidence using BGE-M3 + reranking
evidence_bundle = retrieval_svc.retrieve(patient_snapshot, top_k_vector_results=10)

# 2. Deduplicate using multilingual embeddings
deduplicated_chunks = deduplication_svc.deduplicate_chunks(
    evidence_bundle.chunks,
    threshold=0.85
)

# 3. Translate to local language
translated_guidance = translation_svc.translate(
    text=deduplicated_chunks[0].content if deduplicated_chunks else "",
    source_lang="en",
    target_lang="ar"
)

# 4. Generate prescription using Qwen3-32B
prescription = generation_svc.generate(patient_snapshot, evidence_bundle)

print("Complete Workflow Result:")
print(f"Original evidence: {len(evidence_bundle.chunks)} chunks")
print(f"After dedup: {len(deduplicated_chunks)} chunks")
print(f"Translated guidance: {translated_guidance[:100]}...")
print(f"Generated prescription: {prescription}")


# ==============================================================================
# 7. CONFIGURATION VIA ENVIRONMENT VARIABLES
# ==============================================================================

"""
.env file example:

# Vector embeddings
VECTOR_EMBEDDING_MODEL=BAAI/bge-m3

# Reranking
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_FALLBACK_MODEL=cross-encoder/ms-marco-MiniLM-L6-v2

# Translation
TRANSLATION_MODEL=facebook/nllb-200-distilled-1.3B

# Deduplication
DEDUPLICATION_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

# LLM
LLM_MODEL=Qwen3-32B

# Generation backend
GENERATION_BACKEND=openai_compatible
GENERATION_BASE_URL=http://localhost:8000
GENERATION_MODEL=Qwen3-32B
"""


# ==============================================================================
# 8. ERROR HANDLING AND FALLBACKS
# ==============================================================================

from services.retrieval.evidence_ranker import EvidenceRanker

try:
    # Try main reranker
    ranker = EvidenceRanker(
        reranker_model="BAAI/bge-reranker-v2-m3",
        fallback_model="cross-encoder/ms-marco-MiniLM-L6-v2"
    )
except Exception as e:
    print(f"Failed to load main reranker: {e}")
    print("Using fallback reranker")
    ranker = EvidenceRanker(
        fallback_model="cross-encoder/ms-marco-MiniLM-L6-v2"
    )

# Translation with fallback
try:
    translator = TranslationService()
    translation = translator.translate("Hello", source_lang="en", target_lang="ar")
except Exception as e:
    print(f"Translation failed: {e}, using original text")
    translation = "Hello"  # Fallback


# ==============================================================================
# 9. PERFORMANCE TIPS
# ==============================================================================

"""
Performance optimization recommendations:

1. BATCH PROCESSING
   - Use batch_translate() for multiple items
   - Deduplicate in batches for better GPU utilization
   - Process multiple queries through BGE-M3 together

2. CACHING
   - Cache translation results for common phrases
   - Cache embedding results using @lru_cache
   - Store computed similarity matrices

3. GPU ACCELERATION
   - Use GPU for BGE-M3, BGE Reranker, NLLB-200
   - Keep paraphrase-multilingual-MiniLM on GPU for speed
   - Reserve GPU memory for Qwen3-32B (needs ~64GB)

4. MODEL SELECTION
   - Use paraphrase-multilingual-MiniLM for quick similarity checks
   - Use BGE-M3 for primary retrieval
   - Use ms-marco fallback only when necessary
   - Use NLLB-200 distilled (lightweight) for translation

5. LATENCY TARGETS
   - Vector search (BGE-M3): ~100ms per query
   - Reranking (BGE v2 M3): ~50ms per item
   - Translation (NLLB-200): ~500ms per 50 tokens
   - Deduplication (MiniLM): ~5ms per item
   - Generation (Qwen3-32B): 1-5 seconds per prescription
"""

print(__doc__)

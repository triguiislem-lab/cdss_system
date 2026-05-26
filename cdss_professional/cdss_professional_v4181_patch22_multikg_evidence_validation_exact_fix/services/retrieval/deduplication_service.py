"""Deduplication service for clinical evidence using multilingual embeddings.

Uses sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 to identify
and deduplicate similar evidence items across languages while maintaining
semantic equivalence.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from libs.contracts.evidence import EvidenceChunk, KnowledgeGraphFact, LocalProductEvidence


@dataclass
class DeduplicationResult:
    """Result of deduplication operation."""
    kept_items: list
    removed_items: list
    removed_count: int
    similarity_pairs: list[tuple[str, str, float]]


class DeduplicationService:
    """Multilingual deduplication using paraphrase-multilingual-MiniLM-L12-v2.

    Model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
    - Multilingual embeddings (50+ languages)
    - Lightweight (384 dimensions)
    - Fast inference suitable for real-time deduplication
    - Preserves semantic meaning across languages
    """

    def __init__(
        self,
        model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        similarity_threshold: float = 0.85,
    ):
        """Initialize deduplication service.

        Args:
            model_name: HuggingFace model identifier
            similarity_threshold: Similarity score (0-1) above which items are considered duplicates
        """
        self.model_name = model_name
        self.similarity_threshold = similarity_threshold
        self._model = None
        self._initialized = False

    def _ensure_loaded(self) -> None:
        """Lazy-load the embedding model."""
        if self._initialized:
            return
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            self._model = SentenceTransformer(self.model_name)
            self._initialized = True
        except ImportError:
            raise ImportError(
                "sentence-transformers library required for deduplication. "
                "Install with: pip install sentence-transformers"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to load model {self.model_name}: {e}")

    def deduplicate_chunks(
        self,
        chunks: list[EvidenceChunk],
        threshold: Optional[float] = None,
    ) -> DeduplicationResult:
        """Deduplicate evidence chunks based on semantic similarity.

        Args:
            chunks: List of evidence chunks to deduplicate
            threshold: Optional override for similarity threshold

        Returns:
            DeduplicationResult with kept items, removed items, and similarity pairs
        """
        return self._deduplicate_items(
            chunks,
            extract_text=lambda x: x.content,
            threshold=threshold
        )

    def deduplicate_facts(
        self,
        facts: list[KnowledgeGraphFact],
        threshold: Optional[float] = None,
    ) -> DeduplicationResult:
        """Deduplicate knowledge graph facts.

        Args:
            facts: List of KG facts to deduplicate
            threshold: Optional override for similarity threshold

        Returns:
            DeduplicationResult with kept items and removed duplicates
        """
        return self._deduplicate_items(
            facts,
            extract_text=lambda x: f"{x.subject} {x.predicate} {x.object}",
            threshold=threshold
        )

    def deduplicate_products(
        self,
        products: list[LocalProductEvidence],
        threshold: Optional[float] = None,
    ) -> DeduplicationResult:
        """Deduplicate local formulary products.

        Args:
            products: List of products to deduplicate
            threshold: Optional override for similarity threshold

        Returns:
            DeduplicationResult with kept items and removed duplicates
        """
        return self._deduplicate_items(
            products,
            extract_text=lambda x: f"{x.product_name} {x.active_ingredient} {x.strength}",
            threshold=threshold
        )

    def _deduplicate_items(
        self,
        items: list,
        extract_text,
        threshold: Optional[float] = None,
    ) -> DeduplicationResult:
        """Core deduplication logic.

        Uses cosine similarity between embeddings to identify duplicates.
        Keeps the first occurrence and removes subsequent similar items.
        """
        if not items:
            return DeduplicationResult([], [], 0, [])

        threshold = threshold or self.similarity_threshold
        self._ensure_loaded()

        # Extract texts and encode
        texts = [extract_text(item) for item in items]
        embeddings = self._model.encode(texts, convert_to_tensor=True)

        # Track which items to keep
        kept_indices = []
        removed_indices = set()
        similarity_pairs = []

        for i, embedding_i in enumerate(embeddings):
            if i in removed_indices:
                continue

            kept_indices.append(i)

            # Compare with all subsequent items
            for j in range(i + 1, len(embeddings)):
                if j in removed_indices:
                    continue

                embedding_j = embeddings[j]
                similarity = self._cosine_similarity(embedding_i, embedding_j)

                if similarity >= threshold:
                    removed_indices.add(j)
                    similarity_pairs.append((texts[i], texts[j], float(similarity)))

        # Build results
        kept_items = [items[i] for i in kept_indices]
        removed_items = [items[i] for i in sorted(removed_indices)]

        return DeduplicationResult(
            kept_items=kept_items,
            removed_items=removed_items,
            removed_count=len(removed_indices),
            similarity_pairs=similarity_pairs,
        )

    @staticmethod
    def _cosine_similarity(vec_a, vec_b) -> float:
        """Compute cosine similarity between two vectors."""
        try:
            # Support both numpy arrays and torch tensors
            import torch
            if isinstance(vec_a, torch.Tensor):
                vec_a = vec_a.cpu().numpy()
            if isinstance(vec_b, torch.Tensor):
                vec_b = vec_b.cpu().numpy()
        except ImportError:
            pass

        dot_product = (vec_a * vec_b).sum()
        norm_a = math.sqrt((vec_a * vec_a).sum())
        norm_b = math.sqrt((vec_b * vec_b).sum())

        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot_product / (norm_a * norm_b))

    def find_similar(
        self,
        query_text: str,
        items: list,
        extract_text,
        top_k: int = 5,
        threshold: Optional[float] = None,
    ) -> list[tuple[int, float]]:
        """Find similar items to a query text.

        Returns:
            List of (item_index, similarity_score) tuples, sorted by similarity descending
        """
        threshold = threshold or self.similarity_threshold
        self._ensure_loaded()

        query_embedding = self._model.encode([query_text], convert_to_tensor=True)[0]
        item_texts = [extract_text(item) for item in items]
        item_embeddings = self._model.encode(item_texts, convert_to_tensor=True)

        similarities = []
        for idx, item_embedding in enumerate(item_embeddings):
            sim = self._cosine_similarity(query_embedding, item_embedding)
            if sim >= threshold:
                similarities.append((idx, sim))

        # Sort by similarity descending and return top_k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

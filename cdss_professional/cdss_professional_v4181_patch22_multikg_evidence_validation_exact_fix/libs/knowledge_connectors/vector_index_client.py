from __future__ import annotations

import csv
import json
import math
import pickle
from pathlib import Path
from typing import Any

from libs.contracts.evidence import EvidenceChunk


SAFETY_CRITICAL_FILTER_KEYS = {
    "accepted_for_clinical_use", "accepted_for_runtime_retrieval",
    "active_ingredient",
    "active_ingredient_canonical",
    "ingredient",
    "quality_tier",
    "strict_mono_localization_eligible",
}


class VectorIndexClient:
    """Configurable vector/text retrieval adapter.

    Supported backends:
    - ``stub``: bundled JSON fixture
    - ``json`` / ``jsonl`` / ``csv``: file-backed corpus with lexical scoring
    - ``semantic_jsonl`` / ``semantic_csv``: lexical prefilter + SentenceTransformer rerank
    - ``kaggle_pickle``: notebook-style ``all_metadata.pkl`` / ``all_texts.pkl`` assets
    - ``faiss``: optional FAISS + SentenceTransformer backend when available

    The lexical path is intentionally notebook-friendly: it works on exported
    corpora immediately, while the FAISS path can later be pointed at your real
    embedding index.
    """

    def __init__(
        self,
        backend: str = "stub",
        fixture_path: Path | None = None,
        corpus_path: Path | None = None,
        faiss_index_path: Path | None = None,
        faiss_metadata_path: Path | None = None,
        embedding_model_name: str | None = None,
        pickle_metadata_path: Path | None = None,
        pickle_texts_path: Path | None = None,
        faiss_stats_path: Path | None = None,
        query_instruction: str | None = None,
        allow_stub_fallbacks: bool = False,
        fail_closed_filters: bool = True,
    ) -> None:
        self.backend = backend
        self.fixture_path = fixture_path or Path(__file__).resolve().parents[2] / "examples" / "demo_fixtures" / "vector_chunks_stub.json"
        self.corpus_path = corpus_path
        self.faiss_index_path = faiss_index_path
        self.faiss_metadata_path = faiss_metadata_path
        self.embedding_model_name = embedding_model_name or "sentence-transformers/all-MiniLM-L6-v2"
        self.pickle_metadata_path = pickle_metadata_path
        self.pickle_texts_path = pickle_texts_path
        self.faiss_stats_path = faiss_stats_path
        self.query_instruction = query_instruction
        self.allow_stub_fallbacks = allow_stub_fallbacks
        self.fail_closed_filters = fail_closed_filters
        self._faiss_stats: dict[str, Any] | None = None
        self._faiss_index = None
        self._faiss_metadata: list[dict[str, Any]] | None = None
        self._faiss_texts: list[Any] | None = None
        self._encoder = None
        self._corpus_cache: list[EvidenceChunk] | None = None
        self._model_status: str = "not_loaded"

    def similarity_search(
        self,
        query: str,
        top_k: int = 5,
        filters: dict[str, str] | None = None,
    ) -> list[EvidenceChunk]:
        if self.backend in {"final_release_jsonl", "stream_jsonl"}:
            return self._stream_jsonl_rank(query=query, top_k=top_k, filters=filters)
        if self.backend == "faiss":
            results = self._similarity_search_faiss(query=query, top_k=top_k)
            if results:
                return self._apply_filters(results, filters)
        corpus = self._load_corpus()
        if self.backend in {"semantic", "semantic_json", "semantic_jsonl", "semantic_csv"}:
            results = self._similarity_search_semantic(corpus=corpus, query=query, top_k=top_k, filters=filters)
            if results:
                return results
        scored = self._lexical_rank(corpus, query=query, filters=filters)
        return scored[:top_k]

    def _load_corpus(self) -> list[EvidenceChunk]:
        if self.backend == "stub":
            return self._load_json_like(self.fixture_path)
        if self._corpus_cache is not None:
            return self._corpus_cache
        if self.backend in {"json", "jsonl", "semantic", "semantic_json", "semantic_jsonl"}:
            if self.corpus_path is None:
                self._corpus_cache = self._load_json_like(self.fixture_path) if self.allow_stub_fallbacks else []
                return self._corpus_cache
            self._corpus_cache = self._load_json_like(self.corpus_path)
            return self._corpus_cache
        if self.backend in {"csv", "semantic_csv"}:
            if self.corpus_path is None or not self.corpus_path.exists():
                return []
            self._corpus_cache = self._load_csv(self.corpus_path)
            return self._corpus_cache
        if self.backend == "kaggle_pickle":
            self._corpus_cache = self._load_kaggle_pickle()
            return self._corpus_cache
        return self._load_json_like(self.fixture_path) if self.allow_stub_fallbacks else []

    def _load_json_like(self, path: Path) -> list[EvidenceChunk]:
        if not path.exists():
            # Production behavior is fail-closed: a missing evidence file returns no
            # evidence instead of fabricating a guideline chunk. Demo fixtures still
            # work when an explicit existing stub file is configured.
            return []
        if path.suffix.lower() == ".jsonl":
            items = [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
        else:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
            items = payload["items"] if isinstance(payload, dict) and "items" in payload else payload
        out: list[EvidenceChunk] = []
        for item in items:
            normalized = self._normalize_record(item)
            if normalized is not None:
                out.append(normalized)
        return out

    def _load_csv(self, path: Path) -> list[EvidenceChunk]:
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            return [chunk for row in reader if (chunk := self._normalize_record(row)) is not None]

    def _load_kaggle_pickle(self) -> list[EvidenceChunk]:
        metadata_path, texts_path = self._resolve_pickle_paths()
        if metadata_path is None:
            return self._load_json_like(self.fixture_path) if self.allow_stub_fallbacks else []
        try:
            metadata = pickle.loads(metadata_path.read_bytes())
            texts = pickle.loads(texts_path.read_bytes()) if texts_path and texts_path.exists() else None
        except Exception:
            return self._load_json_like(self.fixture_path) if self.allow_stub_fallbacks else []

        items = []
        if isinstance(metadata, dict):
            items = metadata.get("items", []) or metadata.get("metadata", []) or []
        elif isinstance(metadata, list):
            items = metadata
        out: list[EvidenceChunk] = []
        for idx, item in enumerate(items):
            text_value = None
            if isinstance(texts, list) and idx < len(texts):
                text_value = texts[idx]
            normalized = self._normalize_pickle_record(item, idx=idx, text_value=text_value)
            if normalized is not None:
                out.append(normalized)
        return out

    def _resolve_pickle_paths(self) -> tuple[Path | None, Path | None]:
        if self.pickle_metadata_path and self.pickle_metadata_path.exists():
            return self.pickle_metadata_path, self.pickle_texts_path
        if self.corpus_path and self.corpus_path.exists():
            if self.corpus_path.is_dir():
                meta = self.corpus_path / "all_metadata.pkl"
                texts = self.corpus_path / "all_texts.pkl"
                return (meta if meta.exists() else None), (texts if texts.exists() else None)
            if self.corpus_path.name == "all_metadata.pkl":
                sibling = self.corpus_path.with_name("all_texts.pkl")
                return self.corpus_path, sibling if sibling.exists() else None
        return None, None

    def _lexical_rank(self, candidates: list[EvidenceChunk], query: str, filters: dict[str, str] | None = None) -> list[EvidenceChunk]:
        query_tokens = [token for token in query.lower().split() if len(token) > 2]
        scored: list[EvidenceChunk] = []
        for item in candidates:
            if not self._matches_filters(item, filters):
                continue
            scored_item = self._score_lexical_item(item, query, query_tokens)
            if scored_item is not None:
                scored.append(scored_item)
        ranked = sorted(scored, key=lambda x: x.score, reverse=True)
        return ranked

    def _stream_jsonl_rank(self, query: str, top_k: int, filters: dict[str, str] | None = None) -> list[EvidenceChunk]:
        path = self.corpus_path
        if path is None or not path.exists() or path.suffix.lower() != ".jsonl":
            return []
        query_tokens = [token for token in query.lower().split() if len(token) > 2]
        keep = max(top_k * 8, top_k)
        scored: list[EvidenceChunk] = []
        with path.open("r", encoding="utf-8-sig") as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    continue
                item = self._normalize_record(raw)
                if item is None or not self._matches_filters(item, filters):
                    continue
                scored_item = self._score_lexical_item(item, query, query_tokens)
                if scored_item is None:
                    continue
                metadata = dict(scored_item.metadata or {})
                metadata.update(
                    {
                        "vector_backend": self.backend,
                        "source_priority": "primary_final_data_release",
                        "final_data_release_used": True,
                    }
                )
                scored.append(scored_item.model_copy(update={"metadata": metadata}))
                if len(scored) > keep * 3:
                    scored = sorted(scored, key=lambda x: x.score, reverse=True)[:keep]
        return sorted(scored, key=lambda x: x.score, reverse=True)[:top_k]

    @staticmethod
    def _score_lexical_item(item: EvidenceChunk, query: str, query_tokens: list[str]) -> EvidenceChunk | None:
        text = f"{item.title} {item.content}".lower()
        overlap = sum(1 for token in query_tokens if token in text)
        density = overlap / max(1, len(set(query_tokens)))
        exact_phrase = 0.12 if query.lower() in text else 0.0
        metadata_boost = 0.0
        subject = f"{item.source} {item.metadata.get('section', '')} {item.metadata.get('book', '')}".lower()
        if any(token in subject for token in query_tokens):
            metadata_boost += 0.06
        source_boost = 0.0
        source_text = f"{item.source} {item.metadata.get('authority_class', '')} {item.metadata.get('source_system', '')}".lower()
        if any(token in source_text for token in ["tunisia", "dpm", "rcp", "local", "bdpm", "smpc", "label"]):
            source_boost += 0.10
        score = float(item.score or 0.0) + (0.28 * density) + exact_phrase + metadata_boost + source_boost
        if overlap > 0 or float(item.score or 0.0) >= 0.6:
            return item.model_copy(update={"score": round(score, 3)})
        return None

    def _similarity_search_semantic(
        self,
        corpus: list[EvidenceChunk],
        query: str,
        top_k: int,
        filters: dict[str, str] | None = None,
    ) -> list[EvidenceChunk]:
        prefiltered = self._lexical_rank(corpus, query=query, filters=filters)
        if not prefiltered:
            return []
        prefiltered = prefiltered[: max(top_k * 20, 80)]
        try:
            if self._encoder is None:
                self._encoder = self._load_sentence_transformer()
            query_vector = self._encoder.encode([query], normalize_embeddings=True)[0]
            texts = [f"{item.title}\n{item.content}"[:4000] for item in prefiltered]
            doc_vectors = self._encoder.encode(texts, normalize_embeddings=True)
        except Exception as exc:
            self._model_status = f"semantic_model_error:{type(exc).__name__}"
            return [
                self._with_model_metadata(item, model_used=False, reason=self._model_status)
                for item in prefiltered[:top_k]
            ]

        scored: list[EvidenceChunk] = []
        for item, vector in zip(prefiltered, doc_vectors):
            similarity = self._cosine_similarity(query_vector, vector)
            blended = (0.35 * float(item.score or 0.0)) + (0.65 * similarity)
            scored.append(
                self._with_model_metadata(
                    item.model_copy(update={"score": round(blended, 3)}),
                    model_used=True,
                    reason="sentence_transformer_semantic_rerank",
                    semantic_score=round(similarity, 3),
                )
            )
        return sorted(scored, key=lambda x: x.score, reverse=True)[:top_k]

    def _similarity_search_faiss(self, query: str, top_k: int) -> list[EvidenceChunk]:
        if self.faiss_index_path is None or self.faiss_metadata_path is None:
            return []
        try:
            import faiss  # type: ignore
        except Exception:
            return []
        if self._faiss_index is None:
            if not self.faiss_index_path.exists() or not self.faiss_metadata_path.exists():
                return []
            self._faiss_index = faiss.read_index(str(self.faiss_index_path))
            self._faiss_stats = self._load_faiss_stats()
            self._adopt_embedding_model_from_stats()
            self._faiss_metadata = self._load_faiss_metadata()
            self._faiss_texts = self._load_faiss_texts()
        try:
            if self._encoder is None:
                self._encoder = self._load_sentence_transformer()
            encoded_query = self._format_faiss_query(query)
            vector = self._encoder.encode([encoded_query], normalize_embeddings=True)
        except Exception as exc:
            self._model_status = f"faiss_embedding_model_error:{type(exc).__name__}"
            return []
        expected_dim = getattr(self._faiss_index, "d", None)
        actual_dim = int(vector.shape[1]) if len(getattr(vector, "shape", [])) >= 2 else None
        if expected_dim is not None and actual_dim is not None and actual_dim != int(expected_dim):
            self._model_status = f"faiss_dimension_mismatch:model_dim={actual_dim}:index_dim={expected_dim}"
            return []
        distances, indexes = self._faiss_index.search(vector, top_k)
        out: list[EvidenceChunk] = []
        metadata_items = self._faiss_metadata or []
        for idx, dist in zip(indexes[0], distances[0]):
            if idx < 0 or idx >= len(metadata_items):
                continue
            item = metadata_items[idx]
            normalized = self._normalize_record(item) if isinstance(item, dict) else None
            if normalized is None:
                text_value = self._faiss_texts[idx] if self._faiss_texts and idx < len(self._faiss_texts) else None
                normalized = self._normalize_pickle_record(item, idx=idx, text_value=text_value)
            elif self._faiss_texts and idx < len(self._faiss_texts) and not normalized.content:
                normalized = normalized.model_copy(update={"content": str(self._faiss_texts[idx])})
            if normalized is None:
                continue
            score = self._faiss_score(float(dist)) if dist is not None else float(normalized.score or 0.0)
            out.append(
                self._with_model_metadata(
                    normalized.model_copy(update={"score": round(score, 3)}),
                    model_used=True,
                    reason=self._model_status if self._model_status != "not_loaded" else "faiss_sentence_transformer_search",
                )
            )
        return out

    def _load_faiss_metadata(self) -> list[dict[str, Any]]:
        if self.faiss_metadata_path is None or not self.faiss_metadata_path.exists():
            return []
        suffix = self.faiss_metadata_path.suffix.lower()
        if suffix == ".pkl":
            payload = pickle.loads(self.faiss_metadata_path.read_bytes())
        elif suffix == ".parquet":
            import pandas as pd  # type: ignore
            payload = pd.read_parquet(self.faiss_metadata_path).to_dict(orient="records")
        elif suffix == ".jsonl":
            payload = [json.loads(line) for line in self.faiss_metadata_path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
        else:
            payload = json.loads(self.faiss_metadata_path.read_text(encoding="utf-8-sig"))
        return payload["items"] if isinstance(payload, dict) and "items" in payload else list(payload or [])

    def _load_faiss_stats(self) -> dict[str, Any]:
        candidates: list[Path] = []
        if self.faiss_stats_path is not None:
            candidates.append(self.faiss_stats_path)
        if self.faiss_index_path is not None:
            candidates.extend([
                self.faiss_index_path.with_name("tn_prescription_evidence_vector_store_stats.json"),
                self.faiss_index_path.with_name("vector_store_stats.json"),
            ])
        if self.faiss_metadata_path is not None:
            candidates.extend([
                self.faiss_metadata_path.with_name("tn_prescription_evidence_vector_store_stats.json"),
                self.faiss_metadata_path.with_name("vector_store_stats.json"),
            ])
        for path in candidates:
            try:
                if path and path.exists():
                    return json.loads(path.read_text(encoding="utf-8-sig"))
            except Exception:
                continue
        return {}


    def _adopt_embedding_model_from_stats(self) -> None:
        """Use the model declared by vector_store_stats.json when possible.

        The Kaggle vector backup was indexed with
        ``pritamdeka/S-PubMedBert-MS-MARCO``.  If the runtime still points to a
        generic embedding model, FAISS dimensions can mismatch and the fallback
        silently returns no evidence.  A local model path supplied through the
        environment remains authoritative; otherwise the stats model is used.
        """
        stats_model = str((self._faiss_stats or {}).get("model") or "").strip()
        if not stats_model:
            return
        current = str(self.embedding_model_name or "").strip()
        stats_slug = stats_model.split("/")[-1].lower().replace("_", "-")
        current_norm = current.lower().replace("_", "-")
        current_path_exists = False
        try:
            current_path_exists = bool(current and Path(current).is_absolute() and Path(current).exists())
        except Exception:
            current_path_exists = False
        # A local S-PubMedBert mirror may be configured as a path; keep it if it
        # clearly matches the stats model. Otherwise the stats file is the source
        # of truth because using E5/BGE against the PubMedBert-built FAISS index
        # causes dimension mismatch and zero fallback evidence.
        if current_path_exists and stats_slug and stats_slug in current_norm:
            return
        if stats_model and current != stats_model:
            self.embedding_model_name = stats_model

    def _format_faiss_query(self, query: str) -> str:
        instruction = self.query_instruction
        if not instruction and self._faiss_stats:
            instruction = str(self._faiss_stats.get("query_instruction") or "")
        if instruction and not str(query).startswith(instruction):
            return f"{instruction}{query}"
        return query

    def _faiss_score(self, distance: float) -> float:
        metric = str((self._faiss_stats or {}).get("metric", "")).lower()
        if "inner" in metric or "cosine" in metric:
            return round(max(0.0, min(1.0, distance)), 4)
        return round(1.0 / (1.0 + math.exp(-distance)), 4)

    def _load_sentence_transformer(self):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore

            encoder = SentenceTransformer(self.embedding_model_name)
            self._model_status = "sentence_transformer_loaded"
            return encoder
        except TypeError as exc:
            if "word_embedding_dimension" not in str(exc):
                self._model_status = f"sentence_transformer_error:{type(exc).__name__}"
                raise
            return self._load_sentence_transformer_with_manual_pooling()
        except Exception as exc:
            self._model_status = f"sentence_transformer_error:{type(exc).__name__}"
            raise

    def _load_sentence_transformer_with_manual_pooling(self):
        from sentence_transformers import SentenceTransformer, models  # type: ignore

        word_model = models.Transformer(
            self.embedding_model_name,
            max_seq_length=768,
            model_args={"local_files_only": True},
            tokenizer_args={"local_files_only": True},
        )
        pooling_model = models.Pooling(
            word_embedding_dimension=word_model.get_word_embedding_dimension(),
            pooling_mode_mean_tokens=True,
            pooling_mode_cls_token=False,
            pooling_mode_max_tokens=False,
        )
        self._model_status = "manual_mean_pooling_loaded"
        return SentenceTransformer(modules=[word_model, pooling_model])

    def _load_faiss_texts(self) -> list[Any] | None:
        if self.pickle_texts_path and self.pickle_texts_path.exists():
            try:
                return pickle.loads(self.pickle_texts_path.read_bytes())
            except Exception:
                return None
        if self.faiss_metadata_path:
            sibling = self.faiss_metadata_path.with_name("all_texts.pkl")
            if sibling.exists():
                try:
                    return pickle.loads(sibling.read_bytes())
                except Exception:
                    return None
        return None

    @staticmethod
    def _cosine_similarity(vec_a: Any, vec_b: Any) -> float:
        try:
            a = vec_a.tolist()
        except AttributeError:
            a = list(vec_a)
        try:
            b = vec_b.tolist()
        except AttributeError:
            b = list(vec_b)
        dot = sum(float(x) * float(y) for x, y in zip(a, b))
        norm_a = math.sqrt(sum(float(x) * float(x) for x in a))
        norm_b = math.sqrt(sum(float(y) * float(y) for y in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))

    def _with_model_metadata(
        self,
        item: EvidenceChunk,
        *,
        model_used: bool,
        reason: str,
        semantic_score: float | None = None,
    ) -> EvidenceChunk:
        metadata = dict(item.metadata or {})
        metadata["vector_backend"] = self.backend
        metadata["embedding_model"] = self.embedding_model_name
        metadata["embedding_model_used"] = model_used
        metadata["embedding_model_status"] = reason
        if semantic_score is not None:
            metadata["semantic_similarity"] = semantic_score
        return item.model_copy(update={"metadata": metadata})

    def _matches_filters(self, item: EvidenceChunk, filters: dict[str, str] | None) -> bool:
        if not filters:
            return True
        metadata = item.metadata or {}
        for key, value in filters.items():
            expected = str(value or "").lower().strip()
            if not expected:
                continue
            actual = metadata.get(key)
            if key == "accepted_for_runtime_retrieval" and actual in (None, ""):
                actual = metadata.get("accepted_for_clinical_use")

            if key == "language":
                tags = [str(x).lower() for x in metadata.get("locale_tags", [])]
                actual_lang = str(metadata.get("language", "")).lower().strip()
                if expected in tags or any(tag.startswith(f"{expected}-") for tag in tags) or actual_lang == expected:
                    continue
                return False if self.fail_closed_filters and (tags or actual_lang) else True

            if key == "route":
                actual_route = str(metadata.get("route", "")).lower().strip()
                if actual_route in {expected, "any"}:
                    continue
                return False if actual_route else True

            if key == "disease":
                actual_disease = str(metadata.get("disease", "")).lower().strip()
                if actual_disease == expected:
                    continue
                return False if actual_disease else True

            if key == "vulnerability":
                tags = [str(x).lower() for x in metadata.get("vulnerability_tags", [])]
                if expected in tags:
                    continue
                return False if tags else True

            if isinstance(actual, list):
                values = {str(x).lower().strip() for x in actual}
                if expected in values:
                    continue
                return False
            if actual in (None, ""):
                return False if self.fail_closed_filters and key in SAFETY_CRITICAL_FILTER_KEYS else True
            if str(actual).lower().strip() != expected:
                return False
        return True

    def _apply_filters(self, items: list[EvidenceChunk], filters: dict[str, str] | None) -> list[EvidenceChunk]:
        return [item for item in items if self._matches_filters(item, filters)]

    @staticmethod
    def _normalize_record(item: dict[str, Any]) -> EvidenceChunk | None:
        if not isinstance(item, dict):
            return None
        title = _first(item, "title", "heading", "section_title_normalized", "section_title", "section_kind", "section", "local_product_name", "nom") or "Untitled evidence"
        content = _first(item, "content", "retrieval_text", "text", "chunk", "body", "section_text_normalized", "section_text")
        if not content:
            return None
        source = _first(item, "source", "dataset", "origin", "source_system", "authority_level") or "general"
        metadata = dict(item.get("metadata", {}) or {})
        for key in [
            "title", "heading", "section_title", "section_kind", "section", "nom",
            "content", "retrieval_text", "text", "chunk", "body", "section_text", "section_title_normalized", "section_text_normalized",
            "source", "dataset", "origin", "source_system", "authority_level",
            "score", "confidence", "evidence_rank", "metadata", "evidence_uid", "evidence_id", "original_section_id", "authority_class",
            "active_ingredient_canonical", "active_ingredient_raw", "ingredient_canonical", "local_product_name",
            "strength_normalized", "strength_raw", "form_normalized", "form_raw", "route_inferred",
            "quality_tier", "accepted_for_clinical_use", "accepted_for_runtime_retrieval",
        ]:
            if key in item and key != "metadata":
                metadata.setdefault(key, item[key])
        if metadata.get("active_ingredient_canonical") and not metadata.get("active_ingredient"):
            metadata["active_ingredient"] = metadata["active_ingredient_canonical"]
        if metadata.get("ingredient_canonical") and not metadata.get("active_ingredient"):
            metadata["active_ingredient"] = metadata["ingredient_canonical"]
        if metadata.get("local_product_name") and not metadata.get("product_name"):
            metadata["product_name"] = metadata["local_product_name"]
        if metadata.get("section_kind") and not metadata.get("section"):
            metadata["section"] = metadata["section_kind"]
        if metadata.get("route_inferred") and not metadata.get("route"):
            metadata["route"] = metadata["route_inferred"]
        if metadata.get("form_normalized") and not metadata.get("form"):
            metadata["form"] = metadata["form_normalized"]
        if metadata.get("strength_normalized") and not metadata.get("strength"):
            metadata["strength"] = metadata["strength_normalized"]
        score = item.get("score", None)
        if score in (None, ""):
            score = item.get("confidence", None)
        if score in (None, ""):
            rank = float(item.get("evidence_rank", 0.0) or 0.0)
            score = rank / 100.0 if rank else 0.0
        return EvidenceChunk(
            source=str(source),
            title=str(title),
            content=str(content),
            score=float(score or 0.0),
            metadata=metadata,
        )

    @staticmethod
    def _normalize_pickle_record(item: Any, idx: int, text_value: Any = None) -> EvidenceChunk | None:
        metadata = item if isinstance(item, dict) else {"value": item}
        title = _first(metadata, "title", "heading", "section_title", "chunk_title") or f"Chunk {idx}"
        content = text_value or _first(metadata, "content", "text", "chunk", "body")
        if not content:
            return None
        source = _first(metadata, "source", "dataset", "origin", "source_name") or "vector_pickle"
        merged_meta = dict(metadata)
        merged_meta.setdefault("pickle_index", idx)
        return EvidenceChunk(
            source=str(source),
            title=str(title),
            content=str(content),
            score=float(metadata.get("score", 0.0) or 0.0) if isinstance(metadata, dict) else 0.0,
            metadata=merged_meta,
        )


def _first(item: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return str(value)
    return None

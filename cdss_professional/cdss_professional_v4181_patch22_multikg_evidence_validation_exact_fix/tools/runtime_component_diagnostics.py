from __future__ import annotations

import argparse
import importlib
import json
import os
import time
from pathlib import Path
from typing import Any

from libs.config import get_settings
from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.neo4j_client import Neo4jClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from services.retrieval.evidence_ranker import EvidenceRanker


DEFAULTS = {
    "faiss_index": "/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/medical_knowledge.faiss",
    "faiss_metadata": "/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_metadata.pkl",
    "faiss_texts": "/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_texts.pkl",
    "embedding_model": "/kaggle/input/datasets/islemtrigui6/s-pubmedbert-ms-marco/model",
    "reranker_model": "/kaggle/input/datasets/islemtrigui/cdss-bge-reranker-v2-m3",
    "kg_dir": "/kaggle/working/kg_cdss_review_outputs/cdss_integration_files",
    "local_catalog": "final_data_release/final_medicines.csv",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Kaggle runtime diagnostics for CDSS components.")
    parser.add_argument("--output", type=Path, default=Path("runtime_component_diagnostics.json"))
    parser.add_argument("--query", default="fièvre paracetamol traitement symptomatique")
    parser.add_argument("--skip-heavy", action="store_true", help="Skip model loading tests.")
    args = parser.parse_args()

    settings = get_settings()
    _sync_defaults_from_settings(settings)
    report: dict[str, Any] = {
        "environment": _environment_report(),
        "configured_settings": _settings_report(settings),
        "paths": _paths_report(),
        "imports": _imports_report(),
        "components": {},
    }
    if not args.skip_heavy:
        report["components"]["embedding_model"] = _test_embedding_model(args.query)
        report["components"]["reranker_model"] = _test_reranker_model(args.query)
        report["components"]["faiss_vector_retrieval"] = _test_faiss_vector(args.query)
    report["components"]["kg_retrieval"] = _test_kg()
    report["components"]["local_formulary"] = _test_local_formulary(args.query)

    report = _json_safe(report)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nSaved report to: {args.output}")


def _environment_report() -> dict[str, str | None]:
    keys = [
        "VECTOR_BACKEND",
        "VECTOR_EMBEDDING_MODEL",
        "RERANKER_MODEL",
        "KG_BACKEND",
        "KG_CATALOG_PATH",
        "LOCAL_FORMULARY_CATALOG_PATH",
        "GENERATION_BACKEND",
        "GENERATION_MODEL",
    ]
    return {key: os.environ.get(key) for key in keys}


def _settings_report(settings) -> dict[str, str]:
    return {
        "VECTOR_BACKEND": settings.vector_backend,
        "VECTOR_EMBEDDING_MODEL": settings.vector_embedding_model,
        "RERANKER_MODEL": settings.reranker_model,
        "KG_BACKEND": settings.kg_backend,
        "KG_CATALOG_PATH": settings.kg_catalog_path,
        "LOCAL_FORMULARY_CATALOG_PATH": settings.local_formulary_catalog_path,
        "GENERATION_BACKEND": settings.generation_backend,
        "GENERATION_MODEL": settings.generation_model,
    }


def _sync_defaults_from_settings(settings) -> None:
    DEFAULTS["embedding_model"] = settings.vector_embedding_model
    DEFAULTS["reranker_model"] = settings.reranker_model
    DEFAULTS["kg_dir"] = settings.kg_catalog_path
    DEFAULTS["local_catalog"] = settings.local_formulary_catalog_path
    DEFAULTS["faiss_index"] = settings.vector_faiss_index_path or DEFAULTS["faiss_index"]
    DEFAULTS["faiss_metadata"] = settings.vector_faiss_metadata_path or DEFAULTS["faiss_metadata"]
    DEFAULTS["faiss_texts"] = settings.vector_pickle_texts_path or DEFAULTS["faiss_texts"]


def _paths_report() -> dict[str, dict[str, Any]]:
    out = {}
    for name, raw in DEFAULTS.items():
        path = Path(raw)
        out[name] = {
            "path": raw,
            "exists": path.exists(),
            "size_mb": round(path.stat().st_size / 1024**2, 2) if path.exists() and path.is_file() else None,
        }
    return out


def _imports_report() -> dict[str, dict[str, Any]]:
    modules = ["fastapi", "uvicorn", "pydantic", "pydantic_settings", "sentence_transformers", "transformers", "torch", "accelerate", "safetensors", "faiss"]
    out = {}
    for name in modules:
        try:
            mod = importlib.import_module(name)
            out[name] = {"ok": True, "version": getattr(mod, "__version__", None)}
        except Exception as exc:
            out[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return out


def _test_embedding_model(query: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        client = VectorIndexClient(backend="faiss", embedding_model_name=DEFAULTS["embedding_model"])
        model = client._load_sentence_transformer()
        emb = model.encode([query, "asthme salbutamol"], normalize_embeddings=True)
        return {
            "ok": True,
            "duration_ms": _elapsed(started),
            "shape": list(emb.shape),
            "embedding_model_status": client._model_status,
        }
    except Exception as exc:
        return {"ok": False, "duration_ms": _elapsed(started), "error": f"{type(exc).__name__}: {exc}"}


def _test_reranker_model(query: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        from sentence_transformers import CrossEncoder

        model = CrossEncoder(DEFAULTS["reranker_model"])
        scores = model.predict([
            [query, "Paracetamol can be used for fever when not contraindicated."],
            [query, "Metformin is used for diabetes."],
        ])
        return {"ok": True, "duration_ms": _elapsed(started), "scores": [float(x) for x in scores]}
    except Exception as exc:
        return {"ok": False, "duration_ms": _elapsed(started), "error": f"{type(exc).__name__}: {exc}"}


def _test_faiss_vector(query: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        client = VectorIndexClient(
            backend="faiss",
            faiss_index_path=Path(DEFAULTS["faiss_index"]),
            faiss_metadata_path=Path(DEFAULTS["faiss_metadata"]),
            pickle_texts_path=Path(DEFAULTS["faiss_texts"]),
            embedding_model_name=DEFAULTS["embedding_model"],
        )
        chunks = client.similarity_search(query, top_k=5, filters={})
        return {
            "ok": bool(chunks),
            "duration_ms": _elapsed(started),
            "count": len(chunks),
            "top": [chunk.model_dump() for chunk in chunks[:3]],
        }
    except Exception as exc:
        return {"ok": False, "duration_ms": _elapsed(started), "error": f"{type(exc).__name__}: {exc}"}


def _test_kg() -> dict[str, Any]:
    started = time.perf_counter()
    try:
        client = Neo4jClient(backend="cdss_csv_dir", csv_path=Path(DEFAULTS["kg_dir"]))
        facts = client.fetch_related_facts("ibuprofen asthma contraindication", limit=5, filters={})
        return {
            "ok": bool(facts),
            "duration_ms": _elapsed(started),
            "count": len(facts),
            "top": [fact.model_dump() for fact in facts[:3]],
        }
    except Exception as exc:
        return {"ok": False, "duration_ms": _elapsed(started), "error": f"{type(exc).__name__}: {exc}"}


def _test_local_formulary(query: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        client = LocalFormularyClient(backend="csv", catalog_path=Path(DEFAULTS["local_catalog"]))
        products = client.load_products()
        ranker = EvidenceRanker(reranker_model=DEFAULTS["reranker_model"])
        ranked = ranker.rank_products([p for p in products if "PARACETAMOL" in p.active_ingredient.upper()][:20], query_terms=query.split())
        return {
            "ok": bool(products),
            "duration_ms": _elapsed(started),
            "catalog_count": len(products),
            "paracetamol_ranked_count": len(ranked),
            "top": [product.model_dump() for product in ranked[:3]],
        }
    except Exception as exc:
        return {"ok": False, "duration_ms": _elapsed(started), "error": f"{type(exc).__name__}: {exc}"}


def _elapsed(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    try:
        import numpy as np  # type: ignore

        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            return float(value)
        if isinstance(value, np.ndarray):
            return value.tolist()
    except Exception:
        pass
    return value


if __name__ == "__main__":
    main()

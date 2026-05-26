from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KAGGLE_RUNTIME_ROOT = Path("/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases")


def runtime_root() -> Path:
    """Return the primary runtime root.

    In Kaggle/demo mode this must be the full generated runtime package, not
    the bundled project data/runtime sample.  The sample remains only a local
    development fallback when no Kaggle input exists.
    """
    configured = os.environ.get("CDSS_RUNTIME_DATA_ROOT") or os.environ.get("CDSS_RUNTIME_SOURCE")
    if configured:
        return Path(configured)
    if DEFAULT_KAGGLE_RUNTIME_ROOT.exists():
        return DEFAULT_KAGGLE_RUNTIME_ROOT
    return PROJECT_ROOT / "data" / "runtime"


def env_path(*names: str, default: str | Path | None = None) -> Path | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return Path(value)
    if default is None:
        return None
    return Path(default)


def runtime_file(*parts: str) -> Path:
    return runtime_root().joinpath(*parts)


def project_runtime_file(*parts: str) -> Path:
    return PROJECT_ROOT / "data" / "runtime" / Path(*parts)


def prefer_existing(*paths: Path | None) -> Path | None:
    for path in paths:
        if path and path.exists():
            return path
    return next((p for p in paths if p is not None), None)


def localization_db_path() -> Path | None:
    return prefer_existing(
        env_path("LOCALIZATION_DB_PATH", "TN_LOCALIZATION_SQLITE_PATH"),
        runtime_file("sqlite", "tn_localization.sqlite"),
    )


def vector_metadata_jsonl_path() -> Path | None:
    return prefer_existing(
        env_path("EVIDENCE_METADATA_JSONL_PATH"),
        runtime_file("faiss", "tn_prescription_evidence_metadata.jsonl"),
        env_path("VECTOR_CORPUS_PATH"),
    )


def vector_metadata_parquet_path() -> Path | None:
    return prefer_existing(
        env_path("EVIDENCE_METADATA_PATH", "VECTOR_FAISS_METADATA_PATH"),
        runtime_file("faiss", "tn_prescription_evidence_metadata.parquet"),
    )


def kg_relations_csv_path() -> Path | None:
    return prefer_existing(
        env_path("KG_RELATIONS_CSV_PATH", "KG_CATALOG_PATH"),
        runtime_file("kuzu_build_csv", "kuzu_kg_relations.csv"),
    )


def kg_entities_csv_path() -> Path | None:
    return prefer_existing(
        env_path("KG_ENTITIES_CSV_PATH"),
        runtime_file("kuzu_build_csv", "kuzu_entities.csv"),
    )


def optional_runtime_csv(env_name: str, filename: str) -> Path | None:
    """Resolve optional CSV helpers without forcing project data/runtime.

    These helper CSVs may exist in development bundles.  In Kaggle full-runtime
    mode the authoritative aliases/catalog usually live in SQLite/KG/vector
    files, so a missing CSV is acceptable and should not silently fall back to
    project data/runtime unless CDSS_ALLOW_PROJECT_RUNTIME_FALLBACK=true.
    """
    explicit = env_path(env_name)
    if explicit and explicit.exists():
        return explicit
    candidate = runtime_file(filename)
    if candidate.exists():
        return candidate
    if os.environ.get("CDSS_ALLOW_PROJECT_RUNTIME_FALLBACK", "false").lower() in {"1", "true", "yes"}:
        project_candidate = project_runtime_file(filename)
        if project_candidate.exists():
            return project_candidate
    return explicit or candidate

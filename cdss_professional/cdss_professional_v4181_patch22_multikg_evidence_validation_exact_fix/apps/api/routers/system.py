from __future__ import annotations

import os
from pathlib import Path
import zipfile
import shutil
import hashlib

from fastapi import APIRouter

from apps.api.schemas import RuntimeStatusResponse
from libs.config import get_settings

try:
    from services.llm.qwen_provider import shared_transformers_status
except Exception:  # pragma: no cover - optional runtime dependency
    shared_transformers_status = None

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status", response_model=RuntimeStatusResponse)
def runtime_status() -> RuntimeStatusResponse:
    settings = get_settings()
    try:
        qwen_cache = shared_transformers_status() if shared_transformers_status else {"available": False}
    except Exception as exc:
        qwen_cache = {"available": False, "error_type": type(exc).__name__, "error": str(exc)[:200]}
    return RuntimeStatusResponse(
        status="ok",
        app_name=settings.app_name,
        api_prefix=settings.api_prefix,
        generation_backend=settings.generation_backend or settings.llm_backend,
        generation_model=settings.generation_model or settings.llm_model,
        vector_backend=settings.vector_backend,
        kg_backend=settings.kg_backend,
        local_formulary_backend=settings.local_formulary_backend,
        clinical_llm_extraction_enabled=settings.clinical_llm_extraction_enabled,
        clinical_llm_extraction_policy=settings.clinical_llm_extraction_policy,
        qwen_model_cache=qwen_cache,
        note="Run one FastAPI backend per notebook/session so the shared Qwen cache is owned by a single process.",
    )


@router.get("/model-cache")
def model_cache_status() -> dict:
    if shared_transformers_status is None:
        return {"available": False, "reason": "shared qwen provider not importable"}
    return shared_transformers_status()


@router.get("/readiness")
def readiness_status() -> dict:
    """Clinical readiness, not only process liveness.

    Readiness is fail-closed for clinical runtime assets: it verifies that the
    configured vector, KG, and local formulary backends have their required
    files present instead of treating non-empty backend names as ready.
    """
    settings = get_settings()
    try:
        qwen_cache = shared_transformers_status() if shared_transformers_status else {"available": False}
    except Exception as exc:
        qwen_cache = {"available": False, "error_type": type(exc).__name__, "error": str(exc)[:200]}

    def resolve(value: str) -> Path | None:
        if not value:
            return None
        p = Path(value)
        if p.is_absolute():
            return p
        return Path(__file__).resolve().parents[3] / p

    def exists(value: str) -> bool:
        p = resolve(value)
        return bool(p and p.exists())

    def kuzu_extract_root() -> Path:
        configured = os.environ.get("CDSS_KUZU_EXTRACT_DIR")
        if configured:
            return Path(configured)
        kaggle_working = Path("/kaggle/working")
        if kaggle_working.exists():
            return kaggle_working / "cdss_kuzu_backups"
        return Path(__file__).resolve().parents[3] / ".runtime" / "cdss_kuzu_backups"

    def extract_kuzu_zip(zip_path: Path) -> Path | None:
        if not zip_path.exists() or zip_path.suffix.lower() != ".zip":
            return None
        target = kuzu_extract_root() / zip_path.stem
        marker = target / ".cdss_kuzu_extracted.ok"
        has_db = any(target.rglob("db.kuzu")) if target.exists() else False
        if marker.exists() and has_db:
            return target
        target.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(target)
            marker.write_text(str(zip_path), encoding="utf-8")
            return target
        except Exception:
            return None

    def find_kuzu_zip(base: Path) -> Path | None:
        if base.is_file() and base.suffix.lower() == ".zip":
            return base
        if not base.exists() or not base.is_dir():
            return None
        for name in ["hetionet_primekg_kuzu_full.zip", "hetionet_primekg_kuzu_database.zip", "kuzu_database.zip"]:
            candidate = base / name
            if candidate.exists():
                return candidate
        zips = sorted(
            [p for p in base.glob("*.zip") if "kuzu" in p.name.lower() or "primekg" in p.name.lower() or "hetionet" in p.name.lower()],
            key=lambda p: p.stat().st_size if p.exists() else 0,
            reverse=True,
        )
        return zips[0] if zips else None


    def safe_path_name(value: str) -> str:
        return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in str(value))[:120] or "kuzu_db"

    def is_under_path(path: Path, root: Path) -> bool:
        try:
            path.resolve().relative_to(root.resolve())
            return True
        except Exception:
            return False

    def chmod_writable(path: Path) -> None:
        try:
            if path.is_dir():
                path.chmod(0o777)
                for child in path.rglob("*"):
                    try:
                        child.chmod(0o777 if child.is_dir() else 0o666)
                    except Exception:
                        pass
            elif path.exists():
                path.chmod(0o666)
        except Exception:
            pass

    def materialize_kaggle_kuzu_path(path: Path | None) -> Path | None:
        if path is None or not path.exists():
            return path
        if not is_under_path(path, Path("/kaggle/input")):
            chmod_writable(path)
            return path
        materialized_root = kuzu_extract_root() / "materialized"
        materialized_root.mkdir(parents=True, exist_ok=True)
        resolved = path.resolve()
        copy_source = path
        return_suffix = Path("")
        # Preserve the portable Hetionet/PrimeKG CSV export next to db.kuzu.
        # If we copy only db.kuzu, the Kuzu DB may work but the CSV fallback
        # loses nodes.csv/edges.csv. Materialize the parent KG folder instead.
        if path.name == "db.kuzu" and (path.parent / "nodes.csv").exists() and (path.parent / "edges.csv").exists():
            copy_source = path.parent
            return_suffix = Path("db.kuzu")
        digest = hashlib.sha1(str(resolved).encode("utf-8")).hexdigest()[:12]
        target_name = f"{safe_path_name(copy_source.parent.name)}__{safe_path_name(copy_source.name)}__{digest}"
        target = materialized_root / target_name
        marker = materialized_root / f"{target_name}.source"
        try:
            if target.exists() and marker.exists() and marker.read_text(encoding="utf-8") == str(resolved):
                chmod_writable(target)
                return target / return_suffix if return_suffix else target
            if target.exists():
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            if copy_source.is_dir():
                shutil.copytree(copy_source, target)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(copy_source, target)
            marker.write_text(str(resolved), encoding="utf-8")
            chmod_writable(target)
            return target / return_suffix if return_suffix else target
        except Exception:
            return path

    def resolve_kuzu(value: str) -> Path | None:
        base = resolve(value)
        if base is None:
            return None
        if base.is_file() and base.suffix.lower() == ".zip":
            extracted = extract_kuzu_zip(base)
            return resolve_kuzu(str(extracted)) if extracted else base
        if base.name.endswith(".kuzu"):
            return materialize_kaggle_kuzu_path(base)
        if not base.exists() or not base.is_dir():
            return base
        for candidate in [
            base / "tn_kg_safety.kuzu",
            base / "hetionet_primekg.kuzu",
            base / "hetionet_primekg_kuzu_full" / "db.kuzu",
            base / "db.kuzu",
            base / ".kuzu",
        ]:
            if candidate.exists():
                return materialize_kaggle_kuzu_path(candidate)
        direct = sorted([
            child for child in base.iterdir()
            if child.is_dir() and (child.name.endswith(".kuzu") or child.name == "db.kuzu")
        ])
        if direct:
            return materialize_kaggle_kuzu_path(direct[0])
        nested_db = sorted([child for child in base.rglob("db.kuzu") if child.exists()])
        if nested_db:
            return materialize_kaggle_kuzu_path(nested_db[0])
        nested = sorted([child for child in base.rglob("*.kuzu") if child.is_dir()])
        if nested:
            return materialize_kaggle_kuzu_path(nested[0])
        marker_dirs = []
        for child in base.rglob("*"):
            if child.is_dir() and any((child / marker).exists() for marker in ("catalog.kz", "data.kz", "metadata.kz")):
                marker_dirs.append(child)
        if marker_dirs:
            selected = sorted(marker_dirs, key=lambda x: ("primekg" not in x.name.lower() and "hetionet" not in x.name.lower(), len(str(x))))[0]
            return materialize_kaggle_kuzu_path(selected)
        zip_candidate = find_kuzu_zip(base)
        if zip_candidate:
            extracted = extract_kuzu_zip(zip_candidate)
            if extracted:
                return resolve_kuzu(str(extracted))
        return materialize_kaggle_kuzu_path(base)

    def kuzu_exists(value: str) -> bool:
        p = resolve_kuzu(value)
        return bool(p and p.exists())

    generation_backend = settings.generation_backend or settings.llm_backend
    qwen_required = str(generation_backend).lower() == "transformers"
    model_path_exists = exists(settings.generation_model or settings.llm_model)
    qwen_loaded = (not qwen_required) or bool(qwen_cache.get("actual_load_count_this_process", 0) >= 1)

    vector_backend = str(settings.vector_backend or "").lower()
    vector_checks = {"backend": vector_backend}
    if vector_backend == "faiss":
        vector_checks.update({
            "index_exists": exists(settings.vector_faiss_index_path),
            "metadata_exists": exists(settings.vector_faiss_metadata_path),
            "stats_exists": exists(settings.vector_faiss_stats_path) if settings.vector_faiss_stats_path else True,
        })
        vector_ready = vector_checks["index_exists"] and vector_checks["metadata_exists"] and vector_checks["stats_exists"]
    elif vector_backend in {"final_release_jsonl", "stream_jsonl", "json", "jsonl", "semantic_jsonl"}:
        vector_checks["corpus_exists"] = exists(settings.vector_corpus_path)
        vector_ready = vector_checks["corpus_exists"]
    elif vector_backend in {"stub", "demo"}:
        vector_checks["fixture_exists"] = exists(settings.vector_fixture_path)
        vector_checks["demo_backend"] = True
        vector_ready = bool(settings.allow_stub_fallbacks and vector_checks["fixture_exists"])
    else:
        vector_ready = bool(vector_backend)

    kg_backend = str(settings.kg_backend or "").lower()
    kg_checks = {"backend": kg_backend}
    if kg_backend in {"kuzu", "kuzu_file", "kuzu_safety"}:
        kg_checks["kuzu_db_exists"] = kuzu_exists(settings.kg_kuzu_db_path)
        kg_checks["resolved_kuzu_db_path"] = str(resolve_kuzu(settings.kg_kuzu_db_path) or "")
        kg_ready = kg_checks["kuzu_db_exists"]
    elif kg_backend == "csv":
        kg_checks["csv_exists"] = exists(settings.kg_catalog_path)
        kg_ready = kg_checks["csv_exists"]
    elif kg_backend in {"stub", "demo"}:
        kg_checks["fixture_exists"] = exists(settings.kg_fixture_path)
        kg_checks["demo_backend"] = True
        kg_ready = bool(settings.allow_stub_fallbacks and kg_checks["fixture_exists"])
    else:
        kg_ready = bool(kg_backend)

    backup_backend = str(settings.kg_backup_backend or "").lower()
    backup_path = settings.kg_backup_kuzu_db_path or settings.hetionet_primekg_kuzu_db_path
    backup_kuzu_db_exists = kuzu_exists(backup_path) if backup_path else False
    kg_checks["backup_enabled"] = bool(settings.kg_backup_enabled)
    kg_checks["backup_backend"] = backup_backend
    kg_checks["backup_kuzu_db_exists"] = backup_kuzu_db_exists
    kg_checks["resolved_backup_kuzu_db_path"] = str(resolve_kuzu(backup_path) or "") if backup_path else ""

    def resolve_tn_med_db_path() -> Path | None:
        configured = resolve(getattr(settings, "tn_med_db_path", ""))
        if configured and configured.exists():
            return configured
        root = resolve(getattr(settings, "tn_med_data_root", ""))
        if root:
            for candidate in [root / "database" / "TN_Med.db", root / "TN_Med.db"]:
                if candidate.exists():
                    return candidate
            if root.exists() and root.is_dir():
                matches = sorted(root.rglob("TN_Med.db"))
                if matches:
                    return matches[0]
        return configured or (root / "database" / "TN_Med.db" if root else None)

    formulary_backend = str(settings.local_formulary_backend or "").lower()
    formulary_checks = {"backend": formulary_backend}
    if formulary_backend in {"sqlite", "sqlite_tn_localization", "tn_localization_sqlite"}:
        formulary_checks["sqlite_exists"] = exists(settings.localization_db_path)
        formulary_ready = formulary_checks["sqlite_exists"]
    elif formulary_backend == "csv":
        formulary_checks["catalog_exists"] = exists(settings.local_formulary_catalog_path)
        formulary_ready = formulary_checks["catalog_exists"]
    elif formulary_backend in {"stub", "demo"}:
        formulary_checks["fixture_exists"] = exists(settings.local_formulary_fixture_path)
        formulary_checks["demo_backend"] = True
        formulary_ready = bool(settings.allow_stub_fallbacks and formulary_checks["fixture_exists"])
    else:
        formulary_ready = bool(formulary_backend)

    tn_med_path = resolve_tn_med_db_path()
    tn_med_checks = {
        "enabled": bool(getattr(settings, "tn_med_enabled", False)),
        "required_for_readiness": bool(getattr(settings, "tn_med_required_for_readiness", False)),
        "data_root": getattr(settings, "tn_med_data_root", ""),
        "db_path": str(tn_med_path or ""),
        "db_exists": bool(tn_med_path and tn_med_path.exists()),
    }
    tn_med_ready = (not tn_med_checks["enabled"]) or tn_med_checks["db_exists"]

    stub_backend_active = any(b in {"stub", "demo"} for b in [vector_backend, kg_backend, formulary_backend])
    stub_backend_blocked = bool(settings.clinical_action_enabled and stub_backend_active and not settings.allow_stub_fallbacks)
    ready = bool(qwen_loaded and vector_ready and kg_ready and formulary_ready and (tn_med_ready or not getattr(settings, "tn_med_required_for_readiness", False)) and not stub_backend_blocked)
    return {
        "ready": ready,
        "patch22_exact_source_fix": True,
        "patch22_exact_source_fix_version": "cdss_professional_v4181_patch22_multikg_evidence_validation_exact_fix",
        "qwen_required": qwen_required,
        "qwen_model_path_exists": model_path_exists if qwen_required else None,
        "qwen_loaded": qwen_loaded,
        "vector_ready": vector_ready,
        "kg_ready": kg_ready,
        "backup_kuzu_db_exists": backup_kuzu_db_exists,
        "formulary_ready": formulary_ready,
        "tn_med_ready": tn_med_ready,
        "stub_backend_blocked": stub_backend_blocked,
        "resource_checks": {
            "vector": vector_checks,
            "kg": kg_checks,
            "formulary": formulary_checks,
            "tn_med_db_v1": tn_med_checks,
        },
        "actual_load_count_this_process": qwen_cache.get("actual_load_count_this_process"),
        "cache_hits": qwen_cache.get("cache_hits"),
        "cache_misses": qwen_cache.get("cache_misses"),
        "process_id": qwen_cache.get("process_id"),
        "note": "/health = process alive; /readiness = clinically ready after warmup/resources.",
    }

from functools import lru_cache
import os
from pathlib import Path
import zipfile
import shutil
import hashlib

from libs.config import AppSettings, RuntimePipelineConfig, get_settings
from libs.governance import DeploymentGovernanceService
from libs.knowledge_connectors import LocalFormularyClient, Neo4jClient, VectorIndexClient, TNMedEnrichmentClient
from services.audit import AuditService, FileAuditRepository, InMemoryAuditRepository
from services.audit.repository import AuditRepository
from services.clinical_understanding.llm_extractor import LEVEL1_EXTRACTION_SYSTEM_PROMPT, QwenClinicalExtractor
from services.order_extraction.llm_mediqa_oe_extractor import MEDIQA_OE_SYSTEM_PROMPT, QwenMediqaOeExtractor
from services.order_extraction.service import MedicalOrderExtractionService
from services.clinical_understanding.service import ClinicalUnderstandingService
from services.clinical_understanding.translator import TranslationStep
from services.generation.llm_router import LLMRouter
from services.generation.prescription_generator import PrescriptionGenerator
from services.generation.service import GenerationService
from services.localization.service import LocalizationService
from services.localization.translation_service import TranslationService
from services.orchestration.pipeline import PrescriptionPipeline
from services.orchestration.stage_runner import StageRunner
from services.retrieval.deduplication_service import DeduplicationService
from services.retrieval.evidence_ranker import EvidenceRanker
from services.retrieval.hybrid_retriever import HybridRetriever
from services.retrieval.kg_retriever import KGRetriever, MultiKGRetriever
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever
from services.retrieval.service import RetrievalService
from services.retrieval.vector_retriever import VectorRetriever
from services.retrieval.tn_med_enrichment_retriever import TNMedEnrichmentRetriever
from services.safety.service import SafetyService


def _resolve_path(value: str) -> Path | None:
    if not value:
        return None
    path = Path(value)
    if path.is_absolute():
        return path
    root = Path(__file__).resolve().parents[2]
    return root / path


def _kuzu_extract_root() -> Path:
    configured = os.environ.get("CDSS_KUZU_EXTRACT_DIR")
    if configured:
        return Path(configured)
    kaggle_working = Path("/kaggle/working")
    if kaggle_working.exists():
        return kaggle_working / "cdss_kuzu_backups"
    return Path("/tmp/cdss_kuzu_backups")


def _extract_kuzu_zip(zip_path: Path) -> Path | None:
    """Extract Kaggle-packaged Kuzu backups and return the extraction folder.

    The Hetionet/PrimeKG dataset built in the supporting notebook is uploaded
    as ``hetionet_primekg_kuzu_full.zip``.  Inside the archive the real Kuzu DB
    lives at ``hetionet_primekg_kuzu_full/db.kuzu``.  Kuzu cannot open the zip
    directly, and using only the dataset root makes readiness look green while
    ``backup_only`` returns zero facts.
    """
    if not zip_path.exists() or zip_path.suffix.lower() != ".zip":
        return None
    target = _kuzu_extract_root() / zip_path.stem
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


def _find_kuzu_zip(base: Path) -> Path | None:
    if base.is_file() and base.suffix.lower() == ".zip":
        return base
    if not base.exists() or not base.is_dir():
        return None
    preferred_names = [
        "hetionet_primekg_kuzu_full.zip",
        "hetionet_primekg_kuzu_database.zip",
        "kuzu_database.zip",
    ]
    for name in preferred_names:
        candidate = base / name
        if candidate.exists():
            return candidate
    zips = sorted(
        [p for p in base.glob("*.zip") if "kuzu" in p.name.lower() or "primekg" in p.name.lower() or "hetionet" in p.name.lower()],
        key=lambda p: p.stat().st_size if p.exists() else 0,
        reverse=True,
    )
    return zips[0] if zips else None




def _safe_path_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in str(value))[:120] or "kuzu_db"


def _is_under_path(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False


def _chmod_writable(path: Path) -> None:
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


def _materialize_kaggle_kuzu_path(path: Path | None) -> Path | None:
    """Copy Kuzu DB directories from read-only /kaggle/input to /kaggle/working.

    Kuzu creates lock/write-sidecar files when opening a database. On Kaggle, a
    DB can exist under /kaggle/input and pass readiness, yet the live client can
    fail to open it and then return zero backup facts. The KG-build notebook
    explicitly copies db.kuzu to /kaggle/working before querying; the API does
    the same here for both zipped and already-extracted DB assets.
    """
    if path is None or not path.exists():
        return path
    kaggle_input = Path("/kaggle/input")
    if not _is_under_path(path, kaggle_input):
        _chmod_writable(path)
        return path

    materialized_root = _kuzu_extract_root() / "materialized"
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
    target_name = f"{_safe_path_name(copy_source.parent.name)}__{_safe_path_name(copy_source.name)}__{digest}"
    target = materialized_root / target_name
    marker = materialized_root / f"{target_name}.source"

    try:
        if target.exists() and marker.exists() and marker.read_text(encoding="utf-8") == str(resolved):
            _chmod_writable(target)
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
        _chmod_writable(target)
        return target / return_suffix if return_suffix else target
    except Exception:
        return path


def _resolve_kuzu_db_path(value: str) -> Path | None:
    """Resolve Kuzu DB paths, including Kaggle nested, zipped, and read-only exports."""
    base = _resolve_path(value)
    if base is None:
        return None

    if base.is_file() and base.suffix.lower() == ".zip":
        extracted = _extract_kuzu_zip(base)
        return _resolve_kuzu_db_path(str(extracted)) if extracted else base

    if base.name.endswith(".kuzu"):
        return _materialize_kaggle_kuzu_path(base)

    if not base.exists() or not base.is_dir():
        return base

    preferred = [
        base / "tn_kg_safety.kuzu",
        base / "hetionet_primekg.kuzu",
        base / "hetionet_primekg_kuzu_full" / "db.kuzu",
        base / "db.kuzu",
        base / ".kuzu",
    ]
    for candidate in preferred:
        if candidate.exists():
            return _materialize_kaggle_kuzu_path(candidate)

    direct_kuzu_dirs = sorted([
        child for child in base.iterdir()
        if child.is_dir() and (child.name.endswith(".kuzu") or child.name == "db.kuzu")
    ])
    if direct_kuzu_dirs:
        return _materialize_kaggle_kuzu_path(direct_kuzu_dirs[0])

    nested_db = sorted([child for child in base.rglob("db.kuzu") if child.exists()])
    if nested_db:
        return _materialize_kaggle_kuzu_path(nested_db[0])

    nested_kuzu_dirs = sorted([child for child in base.rglob("*.kuzu") if child.is_dir()])
    if nested_kuzu_dirs:
        return _materialize_kaggle_kuzu_path(nested_kuzu_dirs[0])

    marker_dirs = []
    for child in base.rglob("*"):
        if not child.is_dir():
            continue
        if any((child / marker).exists() for marker in ("catalog.kz", "data.kz", "metadata.kz")):
            marker_dirs.append(child)
    if marker_dirs:
        selected = sorted(
            marker_dirs,
            key=lambda x: ("primekg" not in x.name.lower() and "hetionet" not in x.name.lower(), len(str(x))),
        )[0]
        return _materialize_kaggle_kuzu_path(selected)

    zip_candidate = _find_kuzu_zip(base)
    if zip_candidate:
        extracted = _extract_kuzu_zip(zip_candidate)
        if extracted:
            return _resolve_kuzu_db_path(str(extracted))

    return _materialize_kaggle_kuzu_path(base)


@lru_cache(maxsize=1)
def get_runtime_config() -> RuntimePipelineConfig:
    settings = get_settings()
    return settings.to_runtime_config()


@lru_cache(maxsize=1)
def get_audit_repository() -> AuditRepository:
    settings = get_settings()
    if settings.audit_backend == "file":
        return FileAuditRepository(settings.audit_dir)
    return InMemoryAuditRepository()


@lru_cache(maxsize=1)
def get_vector_client() -> VectorIndexClient:
    settings = get_settings()
    return VectorIndexClient(
        backend=settings.vector_backend,
        fixture_path=_resolve_path(settings.vector_fixture_path),
        corpus_path=_resolve_path(settings.vector_corpus_path),
        faiss_index_path=_resolve_path(settings.vector_faiss_index_path),
        faiss_metadata_path=_resolve_path(settings.vector_faiss_metadata_path),
        embedding_model_name=settings.vector_embedding_model,
        pickle_metadata_path=_resolve_path(settings.vector_pickle_metadata_path),
        pickle_texts_path=_resolve_path(settings.vector_pickle_texts_path),
        faiss_stats_path=_resolve_path(settings.vector_faiss_stats_path),
        query_instruction=settings.vector_query_instruction or None,
        allow_stub_fallbacks=settings.allow_stub_fallbacks,
        fail_closed_filters=settings.fail_closed_evidence_filters,
    )


@lru_cache(maxsize=1)
def get_vector_fallback_client() -> VectorIndexClient | None:
    settings = get_settings()
    if not settings.vector_fallback_backend:
        return None
    return VectorIndexClient(
        backend=settings.vector_fallback_backend,
        fixture_path=_resolve_path(settings.vector_fixture_path),
        corpus_path=None,
        faiss_index_path=_resolve_path(settings.vector_fallback_faiss_index_path or settings.vector_faiss_index_path),
        faiss_metadata_path=_resolve_path(settings.vector_fallback_faiss_metadata_path or settings.vector_faiss_metadata_path),
        embedding_model_name=settings.vector_embedding_model,
        pickle_metadata_path=_resolve_path(settings.vector_pickle_metadata_path),
        pickle_texts_path=_resolve_path(settings.vector_pickle_texts_path),
        faiss_stats_path=_resolve_path(settings.vector_fallback_faiss_stats_path or settings.vector_faiss_stats_path),
        query_instruction=settings.vector_query_instruction or None,
        allow_stub_fallbacks=settings.allow_stub_fallbacks,
        fail_closed_filters=settings.fail_closed_evidence_filters,
    )


@lru_cache(maxsize=1)
def get_kg_client() -> Neo4jClient:
    settings = get_settings()
    kg_path = settings.kg_kuzu_db_path if settings.kg_backend in {"kuzu", "kuzu_file", "kuzu_safety"} and settings.kg_kuzu_db_path else settings.kg_catalog_path
    kg_csv_path = _resolve_kuzu_db_path(kg_path) if settings.kg_backend in {"kuzu", "kuzu_file", "kuzu_safety"} else _resolve_path(kg_path)
    return Neo4jClient(
        backend=settings.kg_backend,
        fixture_path=_resolve_path(settings.kg_fixture_path),
        json_path=_resolve_path(settings.kg_json_path),
        csv_path=kg_csv_path,
        uri=settings.neo4j_uri or None,
        user=settings.neo4j_user or None,
        password=settings.neo4j_password or None,
        database=settings.neo4j_database,
    )


@lru_cache(maxsize=1)
def get_backup_kg_clients() -> list[Neo4jClient]:
    settings = get_settings()
    if not settings.kg_backup_enabled:
        return []

    backend = settings.kg_backup_backend or "kuzu"
    raw_paths = [settings.kg_backup_kuzu_db_path, settings.hetionet_primekg_kuzu_db_path]
    clients: list[Neo4jClient] = []
    seen_paths: set[str] = set()
    for raw_path in raw_paths:
        if not raw_path:
            continue
        resolved = _resolve_kuzu_db_path(raw_path) if backend in {"kuzu", "kuzu_file", "kuzu_safety"} else _resolve_path(raw_path)
        marker = str(resolved) if resolved else ""
        if not marker or marker in seen_paths:
            continue
        seen_paths.add(marker)
        clients.append(
            Neo4jClient(
                backend=backend,
                fixture_path=_resolve_path(settings.kg_fixture_path),
                json_path=None,
                csv_path=resolved,
                uri=settings.neo4j_uri or None,
                user=settings.neo4j_user or None,
                password=settings.neo4j_password or None,
                database=settings.neo4j_database,
            )
        )
    return clients


@lru_cache(maxsize=1)
def get_kg_retriever() -> MultiKGRetriever:
    settings = get_settings()
    return MultiKGRetriever(
        primary_retriever=KGRetriever(client=get_kg_client(), enable_curated_fallbacks=settings.kg_curated_fallback_enabled),
        backup_retrievers=[KGRetriever(client=client, enable_curated_fallbacks=False) for client in get_backup_kg_clients()],
        backup_enabled=settings.kg_backup_enabled,
        backup_score_multiplier=settings.kg_backup_score_multiplier,
        backup_min_support_facts=getattr(settings, "kg_backup_min_support_facts", 3),
        backup_reserved_limit=getattr(settings, "kg_backup_reserved_limit", 8),
        default_source_mode=getattr(settings, "kg_source_mode", "primary_plus_backups"),
    )


@lru_cache(maxsize=1)
def get_local_formulary_client() -> LocalFormularyClient:
    settings = get_settings()
    catalog_path = settings.localization_db_path if settings.local_formulary_backend in {"sqlite", "sqlite_tn_localization", "tn_localization_sqlite"} and settings.localization_db_path else settings.local_formulary_catalog_path
    return LocalFormularyClient(
        backend=settings.local_formulary_backend,
        fixture_path=_resolve_path(settings.local_formulary_fixture_path),
        catalog_path=_resolve_path(catalog_path),
    )


@lru_cache(maxsize=1)
def get_tn_med_enrichment_client() -> TNMedEnrichmentClient:
    settings = get_settings()
    return TNMedEnrichmentClient(
        db_path=_resolve_path(settings.tn_med_db_path) if settings.tn_med_db_path else None,
        data_root=_resolve_path(settings.tn_med_data_root) if settings.tn_med_data_root else None,
        enabled=settings.tn_med_enabled,
    )


@lru_cache(maxsize=1)
def get_tn_med_enrichment_retriever() -> TNMedEnrichmentRetriever | None:
    settings = get_settings()
    if not settings.tn_med_enabled:
        return None
    return TNMedEnrichmentRetriever(client=get_tn_med_enrichment_client(), enabled=True)


@lru_cache(maxsize=1)
def get_generation_service() -> GenerationService:
    settings = get_settings()
    router = LLMRouter(
        backend=settings.generation_backend or settings.llm_backend,
        model=settings.generation_model or settings.llm_model or None,
        base_url=settings.generation_base_url or None,
        api_key=settings.generation_api_key or None,
        system_prompt=settings.generation_system_prompt or None,
        temperature=settings.generation_temperature,
        max_output_tokens=settings.generation_max_output_tokens,
        timeout_seconds=settings.generation_timeout_seconds,
        transformers_device_map=settings.generation_transformers_device_map,
        transformers_dtype=settings.generation_transformers_dtype,
        trust_remote_code=settings.generation_trust_remote_code,
        llama_cpp_model_path=settings.llama_cpp_model_path or None,
        llama_cpp_n_gpu_layers=settings.llama_cpp_n_gpu_layers,
    )
    generator = PrescriptionGenerator(llm_router=router)
    return GenerationService(generator=generator)


@lru_cache(maxsize=1)
def get_retrieval_service() -> RetrievalService:
    settings = get_settings()
    hybrid = HybridRetriever(
        vector_retriever=VectorRetriever(client=get_vector_client(), fallback_client=get_vector_fallback_client()),
        kg_retriever=get_kg_retriever(),
        local_retriever=LocalFormularyRetriever(client=get_local_formulary_client()),
        tn_med_retriever=get_tn_med_enrichment_retriever(),
        tn_med_enabled=settings.tn_med_enabled,
        ranker=EvidenceRanker(
            reranker_model=settings.reranker_model,
            fallback_model=settings.reranker_fallback_model,
        ),
    )
    return RetrievalService(retriever=hybrid, deduplicator=get_deduplication_service() if settings.deduplication_enabled else None)


@lru_cache(maxsize=1)
def get_translation_service() -> TranslationService:
    """Get translation service with configured NLLB-200 model."""
    settings = get_settings()
    return TranslationService(model_name=settings.translation_model)


@lru_cache(maxsize=1)
def get_deduplication_service() -> DeduplicationService:
    """Get deduplication service with configured multilingual embeddings."""
    settings = get_settings()
    return DeduplicationService(model_name=settings.deduplication_model)


@lru_cache(maxsize=1)
def get_clinical_understanding_service() -> ClinicalUnderstandingService:
    settings = get_settings()
    translator = TranslationStep(model_translator=get_translation_service(), model_target_lang="en")
    llm_extractor = None
    if settings.clinical_llm_extraction_enabled:
        level1_router = LLMRouter(
            backend=settings.clinical_llm_extraction_backend or settings.generation_backend or settings.llm_backend,
            model=settings.clinical_llm_extraction_model or settings.generation_model or settings.llm_model or None,
            base_url=settings.generation_base_url or None,
            api_key=settings.generation_api_key or None,
            system_prompt=LEVEL1_EXTRACTION_SYSTEM_PROMPT,
            temperature=settings.clinical_llm_extraction_temperature,
            max_output_tokens=settings.clinical_llm_extraction_max_output_tokens,
            timeout_seconds=settings.generation_timeout_seconds,
            transformers_device_map=settings.generation_transformers_device_map,
            transformers_dtype=settings.generation_transformers_dtype,
            trust_remote_code=settings.generation_trust_remote_code,
            llama_cpp_model_path=settings.llama_cpp_model_path or None,
            llama_cpp_n_gpu_layers=settings.llama_cpp_n_gpu_layers,
        )
        llm_extractor = QwenClinicalExtractor(
            llm_router=level1_router,
            confidence_threshold=settings.clinical_llm_extraction_confidence_threshold,
        )
    return ClinicalUnderstandingService(
        translator=translator,
        llm_extractor=llm_extractor,
        llm_extraction_mode=settings.clinical_llm_extraction_mode,
        llm_extraction_policy=settings.clinical_llm_extraction_policy,
    )



@lru_cache(maxsize=1)
def get_medical_order_extraction_service() -> MedicalOrderExtractionService:
    settings = get_settings()
    enabled = bool(settings.medical_order_llm_extraction_enabled or settings.clinical_llm_extraction_enabled)
    llm_extractor = None
    if enabled:
        router = LLMRouter(
            backend=settings.medical_order_llm_extraction_backend or settings.clinical_llm_extraction_backend or settings.generation_backend or settings.llm_backend,
            model=settings.medical_order_llm_extraction_model or settings.clinical_llm_extraction_model or settings.generation_model or settings.llm_model or None,
            base_url=settings.generation_base_url or None,
            api_key=settings.generation_api_key or None,
            system_prompt=MEDIQA_OE_SYSTEM_PROMPT,
            temperature=settings.medical_order_llm_extraction_temperature,
            max_output_tokens=settings.medical_order_llm_extraction_max_output_tokens,
            timeout_seconds=settings.generation_timeout_seconds,
            transformers_device_map=settings.generation_transformers_device_map,
            transformers_dtype=settings.generation_transformers_dtype,
            trust_remote_code=settings.generation_trust_remote_code,
            llama_cpp_model_path=settings.llama_cpp_model_path or None,
            llama_cpp_n_gpu_layers=settings.llama_cpp_n_gpu_layers,
        )
        llm_extractor = QwenMediqaOeExtractor(
            llm_router=router,
            confidence_threshold=settings.medical_order_llm_extraction_confidence_threshold,
        )
    return MedicalOrderExtractionService(
        llm_mediqa_oe_extractor=llm_extractor,
        llm_mediqa_oe_mode=settings.medical_order_llm_extraction_mode or settings.clinical_llm_extraction_mode,
        llm_mediqa_oe_policy=settings.medical_order_llm_extraction_policy,
    )

@lru_cache(maxsize=1)
def get_governance_service() -> DeploymentGovernanceService:
    settings = get_settings()
    root = Path(__file__).resolve().parents[2]
    manifest_path = _resolve_path(settings.deployment_manifest_path)
    return DeploymentGovernanceService(project_root=root, manifest_path=manifest_path)

@lru_cache(maxsize=1)
def get_pipeline() -> PrescriptionPipeline:
    settings: AppSettings = get_settings()
    if settings.clinical_deployment_mode:
        get_governance_service().require_ready()
    return PrescriptionPipeline(
        config=settings.to_runtime_config(),
        clinical_understanding=get_clinical_understanding_service(),
        retrieval=get_retrieval_service(),
        generation=get_generation_service(),
        safety=SafetyService(),
        localization=LocalizationService(),
        audit=AuditService(repository=get_audit_repository()),
        stage_runner=StageRunner(),
        medical_order_extractor=get_medical_order_extraction_service(),
    )

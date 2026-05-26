from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SharedTransformerConfig:
    model_path: str
    device_map: str = "auto"
    dtype: str = "auto"
    trust_remote_code: bool = True


_MODEL_LOCK = threading.RLock()
_LOAD_COUNT = 0
_LAST_MODEL_KEY: tuple[str, str, str, bool] | None = None


def _canonical_model_path(model_path: str) -> str:
    """Normalize model identifiers so Level 1 and Level 2 hit the same cache key.

    Local paths may be passed as absolute paths, relative paths, or strings with
    trailing slashes. Without canonicalization, the same model can be loaded more
    than once because lru_cache sees different keys.
    """
    value = str(model_path or "").strip()
    if not value:
        return value
    try:
        p = Path(value).expanduser()
        if p.exists():
            return str(p.resolve())
    except Exception:
        pass
    return value.rstrip("/")


def _resolve_torch_dtype(dtype: str) -> Any:
    import torch

    if not dtype or str(dtype).lower() == "auto":
        return "auto"
    return getattr(torch, str(dtype))


@lru_cache(maxsize=1)
def _load_shared_transformers_lm(
    canonical_model_path: str,
    device_map: str = "auto",
    dtype: str = "auto",
    trust_remote_code: bool = True,
):
    global _LOAD_COUNT, _LAST_MODEL_KEY
    with _MODEL_LOCK:
        from transformers import AutoModelForCausalLM, AutoTokenizer

        torch_dtype = _resolve_torch_dtype(dtype)
        tokenizer = AutoTokenizer.from_pretrained(canonical_model_path, trust_remote_code=trust_remote_code)
        model = AutoModelForCausalLM.from_pretrained(
            canonical_model_path,
            device_map=device_map or "auto",
            torch_dtype=torch_dtype,
            trust_remote_code=trust_remote_code,
            low_cpu_mem_usage=True,
        )
        try:
            model.eval()
        except Exception:
            pass
        _LOAD_COUNT += 1
        _LAST_MODEL_KEY = (canonical_model_path, device_map or "auto", dtype or "auto", bool(trust_remote_code))
        return tokenizer, model


def get_shared_transformers_lm(
    model_path: str,
    device_map: str = "auto",
    dtype: str = "auto",
    trust_remote_code: bool = True,
):
    """Return the process-local shared Hugging Face causal LM.

    This is the single shared model layer for Qwen inside one Python process.
    Level-1 extraction and Level-2 generation must both call this function.

    Important:
    - This prevents duplicate Qwen loads *inside the same process*.
    - It cannot share memory across separate `!python` commands or separate
      uvicorn processes. Production/notebook validation should keep one API
      process alive and send all requests to it.
    """
    canonical = _canonical_model_path(model_path)
    return _load_shared_transformers_lm(
        canonical,
        device_map or "auto",
        dtype or "auto",
        bool(trust_remote_code),
    )


def shared_transformers_status() -> dict[str, Any]:
    info = _load_shared_transformers_lm.cache_info()
    return {
        "cache_hits": info.hits,
        "cache_misses": info.misses,
        "cache_currsize": info.currsize,
        "cache_maxsize": info.maxsize,
        "actual_load_count_this_process": _LOAD_COUNT,
        "last_model_key": list(_LAST_MODEL_KEY) if _LAST_MODEL_KEY else None,
        "process_id": os.getpid(),
        "note": "Cache is process-local. If process_id changes, it is a different cache/model owner.",
    }


def clear_shared_transformers_cache() -> None:
    """Clear the process-local model cache and release CUDA allocator blocks.

    Use this only between validation phases, not during normal request handling.
    """
    _load_shared_transformers_lm.cache_clear()
    try:
        import gc
        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass

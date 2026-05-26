from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class MultilingualRetrievalConfig(BaseModel):
    enabled: bool = False
    translation_enabled: bool = False
    reranker_enabled: bool = False
    nllb_model_path: str = ""
    multilingual_e5_model_path: str = ""
    mini_lm_reranker_path: str = ""
    alias_model_path: str = ""
    allow_online_download: bool = False


class MultilingualQueryExpansion(BaseModel):
    original_query: str
    expanded_queries: list[str] = Field(default_factory=list)
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class MultilingualRetrievalStack:
    """V4.22 offline-first multilingual retrieval scaffold.

    The class intentionally avoids loading external models unless enabled and
    model paths exist.  This lets the architecture be present in the source tree
    without causing Kaggle benchmark downloads or slow startup.
    """

    def __init__(self, config: MultilingualRetrievalConfig | None = None):
        self.config = config or MultilingualRetrievalConfig()

    def validate_offline_assets(self) -> dict[str, Any]:
        paths = {
            "nllb_model_path": self.config.nllb_model_path,
            "multilingual_e5_model_path": self.config.multilingual_e5_model_path,
            "mini_lm_reranker_path": self.config.mini_lm_reranker_path,
            "alias_model_path": self.config.alias_model_path,
        }
        existence = {name: (bool(path) and Path(path).exists()) for name, path in paths.items()}
        ok = (not self.config.enabled) or all(existence.values()) or not self.config.allow_online_download
        return {
            "enabled": self.config.enabled,
            "allow_online_download": self.config.allow_online_download,
            "paths_exist": existence,
            "offline_safe": not self.config.allow_online_download,
            "ok": ok,
        }

    def expand_query(self, query: str, language: str | None = None) -> MultilingualQueryExpansion:
        if not self.config.enabled:
            return MultilingualQueryExpansion(
                original_query=query,
                expanded_queries=[query],
                diagnostics={"multilingual_retrieval_enabled": False},
            )
        variants = [query]
        q = query.strip()
        # Cheap alias/query expansion only; model-based translation is a future
        # enabled path after offline assets are validated.
        aliases = {
            "fièvre": "fever",
            "fievre": "fever",
            "حمى": "fever",
            "سخانة": "fever",
            "toux": "cough",
            "سعال": "cough",
            "douleur": "pain",
        }
        for src, dst in aliases.items():
            if src in q.lower() and dst not in q.lower():
                variants.append(f"{query} {dst}")
        return MultilingualQueryExpansion(
            original_query=query,
            expanded_queries=list(dict.fromkeys(variants)),
            diagnostics={
                "multilingual_retrieval_enabled": True,
                "language": language,
                "model_loading": "not_loaded_in_scaffold",
            },
        )

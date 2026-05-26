"""Compatibility shim for legacy imports.

The active settings implementation lives in libs.config.settings.  This file is
kept only so old notebooks/scripts that import `settings` do not read a stale
duplicate configuration.
"""

from libs.config.settings import AppSettings, get_settings
from libs.config.runtime import RuntimePipelineConfig

__all__ = ["AppSettings", "RuntimePipelineConfig", "get_settings"]

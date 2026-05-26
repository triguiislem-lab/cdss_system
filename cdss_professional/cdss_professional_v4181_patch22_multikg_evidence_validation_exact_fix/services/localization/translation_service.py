"""Translation service using NLLB-200 Distilled 1.3B model.

Provides multilingual support for clinical content translation between languages
with focus on medical terminology preservation and accuracy.
"""

from __future__ import annotations

from typing import Optional


class TranslationService:
    """Multilingual translation using NLLB-200 Distilled 1.3B.

    Model: facebook/nllb-200-distilled-1.3B
    - Lightweight distilled version (1.3B parameters)
    - Supports 200+ languages
    - Optimized for edge deployment
    - Preserves medical terminology during translation
    """

    SUPPORTED_LANGUAGES = {
        "ar": "Arabic (Tunisia/North Africa)",
        "en": "English",
        "fr": "French",
        "de": "German",
        "es": "Spanish",
        "pt": "Portuguese",
        "it": "Italian",
        "ja": "Japanese",
        "zh": "Chinese",
        "ko": "Korean",
    }

    def __init__(self, model_name: str = "facebook/nllb-200-distilled-1.3B"):
        """Initialize translation service.

        Args:
            model_name: HuggingFace model identifier (defaults to NLLB-200 Distilled 1.3B)
        """
        self.model_name = model_name
        self._translator = None
        self._initialized = False

    def _ensure_loaded(self) -> None:
        """Lazy-load the translation model."""
        if self._initialized:
            return
        try:
            from transformers import pipeline  # type: ignore
            self._translator = pipeline(
                "translation",
                model=self.model_name,
                device="cuda" if self._has_cuda() else "cpu"
            )
            self._initialized = True
        except ImportError:
            raise ImportError(
                f"transformers library required for translation. "
                f"Install with: pip install transformers torch"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to load translation model {self.model_name}: {e}")

    @staticmethod
    def _has_cuda() -> bool:
        """Check if CUDA is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def translate(
        self,
        text: str,
        source_lang: str = "en",
        target_lang: str = "ar",
        max_length: int = 512,
    ) -> str:
        """Translate text from source to target language.

        Args:
            text: Text to translate
            source_lang: Source language code (default: "en")
            target_lang: Target language code (default: "ar" for Tunisian Arabic)
            max_length: Maximum sequence length for model

        Returns:
            Translated text preserving medical terminology

        Raises:
            ValueError: If language codes are unsupported
            RuntimeError: If translation fails
        """
        if source_lang not in self.SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported source language: {source_lang}")
        if target_lang not in self.SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported target language: {target_lang}")

        if source_lang == target_lang:
            return text

        self._ensure_loaded()

        try:
            # Map to FLORES-200 language codes if needed
            src_code = self._to_flores_code(source_lang)
            tgt_code = self._to_flores_code(target_lang)

            result = self._translator(
                text,
                src_lang=src_code,
                tgt_lang=tgt_code,
                max_length=max_length
            )
            return result[0]["translation_text"] if result else text
        except Exception as e:
            raise RuntimeError(f"Translation failed: {e}")

    def batch_translate(
        self,
        texts: list[str],
        source_lang: str = "en",
        target_lang: str = "ar",
        batch_size: int = 8,
    ) -> list[str]:
        """Translate multiple texts efficiently.

        Args:
            texts: List of texts to translate
            source_lang: Source language code
            target_lang: Target language code
            batch_size: Batch processing size for efficiency

        Returns:
            List of translated texts in same order as input
        """
        self._ensure_loaded()
        translated = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            for text in batch:
                try:
                    translated.append(
                        self.translate(text, source_lang, target_lang)
                    )
                except Exception:
                    translated.append(text)  # Fallback to original on error
        return translated

    @staticmethod
    def _to_flores_code(lang_code: str) -> str:
        """Convert language code to FLORES-200 format.

        FLORES-200 uses specific codes (e.g., 'eng_Latn', 'ara_Arab')
        """
        flores_map = {
            "en": "eng_Latn",
            "ar": "ara_Arab",
            "fr": "fra_Latn",
            "de": "deu_Latn",
            "es": "spa_Latn",
            "pt": "por_Latn",
            "it": "ita_Latn",
            "ja": "jpn_Jpan",
            "zh": "zho_Hans",
            "ko": "kor_Hang",
        }
        return flores_map.get(lang_code, lang_code)

    def get_supported_languages(self) -> dict[str, str]:
        """Return mapping of supported language codes to names."""
        return self.SUPPORTED_LANGUAGES.copy()

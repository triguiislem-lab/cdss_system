# Translation Service

The NestJS backend includes a `TranslationModule` that talks to a LibreTranslate HTTP server. LibreTranslate itself is a separate Python service, so it is not imported directly inside the NestJS code.

## Run LibreTranslate locally

```powershell
py -m venv .venv-libretranslate
.\.venv-libretranslate\Scripts\activate
pip install libretranslate
libretranslate --host 0.0.0.0 --port 5000
```

Then configure the backend:

```env
LIBRETRANSLATE_URL=http://localhost:5000
LIBRETRANSLATE_API_KEY=
TRANSLATION_SOURCE_LANG=fr
TRANSLATION_TARGET_LANGS=en,ar
TRANSLATION_TIMEOUT_MS=15000
```

## Endpoints

All endpoints are under the global API prefix, so by default they start with `/api`.

`GET /api/translations/languages`

Returns the languages available from the running LibreTranslate server.

`POST /api/translations/translate`

```json
{
  "text": "Bonjour",
  "source": "fr",
  "target": "en"
}
```

`POST /api/translations/translate-fields`

Useful for CMS content or dynamic data created in French.

```json
{
  "source": "fr",
  "targets": ["en", "ar"],
  "fields": {
    "title": "Pourquoi MedCity Connect ?",
    "description": "Une plateforme médicale connectée."
  }
}
```

The response keeps the source value and adds translated values per field:

```json
{
  "source": "fr",
  "targets": ["en", "ar"],
  "fields": {
    "title": {
      "fr": "Pourquoi MedCity Connect ?",
      "en": "Why MedCity Connect?",
      "ar": "لماذا ميدسيتي كونيكت؟"
    }
  },
  "status": "auto_translated"
}
```

## Notes for CMS integration

Use `TranslationService.translateFields()` when creating or updating CMS entities. Store translated content either in dedicated JSON columns such as `translations`, or in language-specific fields depending on the final database model.

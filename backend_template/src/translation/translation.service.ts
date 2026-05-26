import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SUPPORTED_TRANSLATION_LANGUAGES,
  SupportedTranslationLanguage,
} from './dto/translation.dto';

type LibreTranslatePayload = {
  q: string;
  source: string;
  target: string;
  format: 'text';
  api_key?: string;
};

type LibreTranslateResponse = {
  translatedText?: string;
  error?: string;
};

type FieldTranslationResult = Record<
  string,
  Record<SupportedTranslationLanguage, string>
>;

@Injectable()
export class TranslationService {
  constructor(private readonly config: ConfigService) {}

  async getLanguages() {
    return this.requestLibreTranslate('/languages', {
      method: 'GET',
    });
  }

  async translateText(
    text: string,
    target: SupportedTranslationLanguage,
    source: SupportedTranslationLanguage | 'auto' = this.defaultSourceLanguage(),
  ) {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return '';
    }

    if (source !== 'auto' && source === target) {
      return normalizedText;
    }

    const apiKey = this.config.get<string>('LIBRETRANSLATE_API_KEY');
    const payload: LibreTranslatePayload = {
      q: normalizedText,
      source,
      target,
      format: 'text',
      ...(apiKey ? { api_key: apiKey } : {}),
    };

    const data = await this.requestLibreTranslate<LibreTranslateResponse>(
      '/translate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!data.translatedText) {
      throw new BadGatewayException(
        data.error || 'LibreTranslate did not return translated text',
      );
    }

    return data.translatedText;
  }

  async translateFields(
    fields: Record<string, string>,
    source = this.defaultSourceLanguage(),
    targets = this.defaultTargetLanguages(),
  ) {
    const result: FieldTranslationResult = {};
    const uniqueTargets = [...new Set(targets)].filter(
      (language): language is SupportedTranslationLanguage =>
        SUPPORTED_TRANSLATION_LANGUAGES.includes(language),
    );

    for (const [field, value] of Object.entries(fields)) {
      if (typeof value !== 'string') {
        continue;
      }

      result[field] = {
        [source]: value,
      } as Record<SupportedTranslationLanguage, string>;

      await Promise.all(
        uniqueTargets.map(async (target) => {
          result[field][target] = await this.translateText(
            value,
            target,
            source,
          );
        }),
      );
    }

    return {
      source,
      targets: uniqueTargets,
      fields: result,
      status: 'auto_translated',
    };
  }

  private defaultSourceLanguage(): SupportedTranslationLanguage {
    const source = this.config.get<string>('TRANSLATION_SOURCE_LANG', 'fr');
    return this.ensureSupportedLanguage(source, 'fr');
  }

  private defaultTargetLanguages(): SupportedTranslationLanguage[] {
    const raw = this.config.get<string>('TRANSLATION_TARGET_LANGS', 'en,ar');
    const targets = raw
      .split(',')
      .map((language) => language.trim())
      .filter(Boolean)
      .map((language) => this.ensureSupportedLanguage(language, 'en'));

    return [...new Set(targets)];
  }

  private ensureSupportedLanguage(
    language: string,
    fallback: SupportedTranslationLanguage,
  ): SupportedTranslationLanguage {
    if (
      SUPPORTED_TRANSLATION_LANGUAGES.includes(
        language as SupportedTranslationLanguage,
      )
    ) {
      return language as SupportedTranslationLanguage;
    }

    return fallback;
  }

  private async requestLibreTranslate<T = unknown>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const baseUrl = this.config
      .get<string>('LIBRETRANSLATE_URL', 'http://localhost:5000')
      .replace(/\/$/, '');
    const timeoutMs = this.config.get<number>('TRANSLATION_TIMEOUT_MS', 15000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => ({}))) as T & {
        error?: string;
      };

      if (!response.ok) {
        throw new BadGatewayException(
          data.error || `LibreTranslate returned HTTP ${response.status}`,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'LibreTranslate service is not reachable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

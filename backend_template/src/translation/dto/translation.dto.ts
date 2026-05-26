import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export const SUPPORTED_TRANSLATION_LANGUAGES = ['fr', 'en', 'ar'] as const;
export type SupportedTranslationLanguage =
  (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];

export class TranslateTextDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsIn(['auto', ...SUPPORTED_TRANSLATION_LANGUAGES])
  source?: 'auto' | SupportedTranslationLanguage;

  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  target: SupportedTranslationLanguage;
}

export class TranslateFieldsDto {
  @IsObject()
  fields: Record<string, string>;

  @IsOptional()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  source?: SupportedTranslationLanguage;

  @IsOptional()
  @IsArray()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES, { each: true })
  targets?: SupportedTranslationLanguage[];
}

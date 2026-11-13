/**
 * Languages Google Meet offers for live captions. Codes are BCP 47 tags: they
 * are what Quilly stores and what Meet's caption request carries; names are
 * what the UI shows.
 */

export interface CaptionLanguage {
  /** BCP 47 tag; the stored value. */
  code: string;
  /** Name shown in Quilly. */
  name: string;
}

/** Setting value meaning "no language of Quilly's own": follow Meet's, else the browser's. */
export const AUTO_CAPTION_LANGUAGE = '';

const LANGUAGES: readonly CaptionLanguage[] = [
  { code: 'af-ZA', name: 'Afrikaans' },
  { code: 'sq-AL', name: 'Albanian' },
  { code: 'am-ET', name: 'Amharic' },
  { code: 'ar-AE', name: 'Arabic (Arab Emirates)' },
  { code: 'ar-EG', name: 'Arabic (Egypt)' },
  { code: 'ar-LB', name: 'Arabic (Levant)' },
  { code: 'ar-MA', name: 'Arabic (Maghrebi)' },
  { code: 'ar-SA', name: 'Arabic (Peninsular Gulf)' },
  { code: 'hy-AM', name: 'Armenian' },
  { code: 'az-AZ', name: 'Azerbaijani' },
  { code: 'eu-ES', name: 'Basque' },
  { code: 'bn-BD', name: 'Bengali (Bangladesh)' },
  { code: 'bg-BG', name: 'Bulgarian' },
  { code: 'my-MM', name: 'Burmese' },
  { code: 'ca-ES', name: 'Catalan' },
  { code: 'yue-Hant-HK', name: 'Chinese (Cantonese)' },
  { code: 'cmn-Hant-TW', name: 'Chinese (Mandarin, Traditional)' },
  { code: 'cmn-Hans-CN', name: 'Chinese (Simplified)' },
  { code: 'cs-CZ', name: 'Czech' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'en-US', name: 'English' },
  { code: 'en-AU', name: 'English (Australia)' },
  { code: 'en-IN', name: 'English (India)' },
  { code: 'en-PH', name: 'English (Philippines)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'et-EE', name: 'Estonian' },
  { code: 'fa-IR', name: 'Farsi' },
  { code: 'fil-PH', name: 'Filipino' },
  { code: 'fi-FI', name: 'Finnish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'fr-CA', name: 'French (Canada)' },
  { code: 'gl-ES', name: 'Galician' },
  { code: 'ka-GE', name: 'Georgian' },
  { code: 'de-DE', name: 'German' },
  { code: 'el-GR', name: 'Greek' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'he-IL', name: 'Hebrew' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'hu-HU', name: 'Hungarian' },
  { code: 'is-IS', name: 'Icelandic' },
  { code: 'id-ID', name: 'Indonesian' },
  { code: 'xh-ZA', name: 'isiXhosa' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'jv-ID', name: 'Javanese' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'kk-KZ', name: 'Kazakh' },
  { code: 'km-KH', name: 'Khmer' },
  { code: 'rw-RW', name: 'Kinyarwanda' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'lo-LA', name: 'Lao' },
  { code: 'lv-LV', name: 'Latvian' },
  { code: 'lt-LT', name: 'Lithuanian' },
  { code: 'mk-MK', name: 'Macedonian' },
  { code: 'ms-MY', name: 'Malay' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'mn-MN', name: 'Mongolian' },
  { code: 'ne-NP', name: 'Nepali' },
  { code: 'nso-ZA', name: 'Northern Sotho' },
  { code: 'nb-NO', name: 'Norwegian' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ro-RO', name: 'Romanian' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'sr-RS', name: 'Serbian' },
  { code: 'st-ZA', name: 'Sesotho' },
  { code: 'si-LK', name: 'Sinhala' },
  { code: 'sk-SK', name: 'Slovak' },
  { code: 'sl-SI', name: 'Slovenian' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'su-ID', name: 'Sundanese' },
  { code: 'sw-KE', name: 'Swahili' },
  { code: 'ss-ZA', name: 'Swati' },
  { code: 'sv-SE', name: 'Swedish' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
  { code: 'th-TH', name: 'Thai' },
  { code: 've-ZA', name: 'Tshivenda' },
  { code: 'tn-ZA', name: 'Tswana' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'uk-UA', name: 'Ukrainian' },
  { code: 'ur-PK', name: 'Urdu' },
  { code: 'uz-UZ', name: 'Uzbek' },
  { code: 'vi-VN', name: 'Vietnamese' },
  { code: 'ts-ZA', name: 'Xitsonga' },
  { code: 'zu-ZA', name: 'Zulu' },
];

export const CAPTION_LANGUAGES: readonly CaptionLanguage[] = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name, 'en'));

const byCode = new Map(CAPTION_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

export function getCaptionLanguage(code: string): CaptionLanguage | undefined {
  return byCode.get(code.toLowerCase());
}

/** Name for a stored code; unknown codes are shown as they are. */
export function captionLanguageName(code: string, fallback = 'Automatic'): string {
  if (code === AUTO_CAPTION_LANGUAGE) return fallback;
  return getCaptionLanguage(code)?.name ?? code;
}

/** Lowercase, no punctuation, single spaces: for searching the catalogue by name. */
export function normalizeLanguageName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const FALLBACK_CAPTION_LANGUAGE = 'en-US';

/** The variant a bare language subtag stands for where the catalogue has several or names it differently. */
const PRIMARY_VARIANT: Readonly<Record<string, string>> = {
  ar: 'ar-EG',
  bn: 'bn-BD',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  no: 'nb-NO',
  pt: 'pt-PT',
  tl: 'fil-PH',
  zh: 'cmn-Hans-CN',
};

/** Chinese locales are tagged `zh-*` by browsers and `cmn-*` / `yue-*` by Meet. */
function chineseVariant(tag: string): string | null {
  const parts = tag.toLowerCase().split('-');
  if (parts[0] !== 'zh') return null;
  if (parts.includes('hk') || parts.includes('mo')) return 'yue-Hant-HK';
  if (parts.includes('tw') || parts.includes('hant')) return 'cmn-Hant-TW';
  return 'cmn-Hans-CN';
}

/**
 * The catalogue entry closest to the user's browser languages, most preferred
 * first: an exact tag, else the same language in the variant Meet lists.
 */
export function captionLanguageForLocales(locales: readonly string[]): string {
  for (const locale of locales) {
    const exact = getCaptionLanguage(locale);
    if (exact) return exact.code;
    const chinese = chineseVariant(locale);
    if (chinese) return chinese;
    const primary = locale.toLowerCase().split('-')[0] ?? '';
    const variant = PRIMARY_VARIANT[primary];
    if (variant) return variant;
    const sameLanguage = CAPTION_LANGUAGES.find((l) => l.code.toLowerCase().split('-')[0] === primary);
    if (sameLanguage) return sameLanguage.code;
  }
  return FALLBACK_CAPTION_LANGUAGE;
}

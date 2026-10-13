/**
 * Languages Google Meet offers for live captions, with the spellings Meet uses
 * for them. Codes are BCP 47 tags and are what Quilly stores; names are what
 * the UI shows and what the content script matches against Meet's own picker.
 */

export interface CaptionLanguage {
  /** BCP 47 tag; the stored value. */
  code: string;
  /** Name shown in Quilly. */
  name: string;
  /** Other spellings Meet uses for the same entry in its English UI. */
  aliases?: readonly string[];
}

/** Setting value meaning "do not touch Meet's caption language". */
export const MEET_DEFAULT_CAPTION_LANGUAGE = '';

const LANGUAGES: readonly CaptionLanguage[] = [
  { code: 'af-ZA', name: 'Afrikaans' },
  { code: 'sq-AL', name: 'Albanian' },
  { code: 'am-ET', name: 'Amharic' },
  { code: 'ar-AE', name: 'Arabic (Arab Emirates)', aliases: ['Arabic (United Arab Emirates)'] },
  { code: 'ar-EG', name: 'Arabic (Egypt)', aliases: ['Arabic'] },
  { code: 'ar-LB', name: 'Arabic (Levant)' },
  { code: 'ar-MA', name: 'Arabic (Maghrebi)' },
  { code: 'ar-SA', name: 'Arabic (Peninsular Gulf)', aliases: ['Arabic (Gulf)', 'Arabic (Saudi Arabia)'] },
  { code: 'hy-AM', name: 'Armenian' },
  { code: 'az-AZ', name: 'Azerbaijani' },
  { code: 'eu-ES', name: 'Basque' },
  { code: 'bn-BD', name: 'Bengali (Bangladesh)', aliases: ['Bengali', 'Bangla'] },
  { code: 'bg-BG', name: 'Bulgarian', aliases: ['Bulgarian (Bulgaria)'] },
  { code: 'my-MM', name: 'Burmese' },
  { code: 'ca-ES', name: 'Catalan' },
  { code: 'yue-Hant-HK', name: 'Chinese (Cantonese)', aliases: ['Cantonese', 'Chinese, Cantonese (Traditional)'] },
  { code: 'cmn-Hant-TW', name: 'Chinese (Mandarin, Traditional)', aliases: ['Chinese (Traditional)', 'Mandarin (Traditional)'] },
  { code: 'cmn-Hans-CN', name: 'Chinese (Simplified)', aliases: ['Chinese (Mandarin, Simplified)', 'Mandarin (Simplified)'] },
  { code: 'cs-CZ', name: 'Czech' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'en-US', name: 'English', aliases: ['English (United States)', 'English (US)'] },
  { code: 'en-AU', name: 'English (Australia)', aliases: ['Australian English'] },
  { code: 'en-IN', name: 'English (India)' },
  { code: 'en-PH', name: 'English (Philippines)' },
  { code: 'en-GB', name: 'English (UK)', aliases: ['English (United Kingdom)', 'British English'] },
  { code: 'et-EE', name: 'Estonian' },
  { code: 'fa-IR', name: 'Farsi', aliases: ['Persian'] },
  { code: 'fil-PH', name: 'Filipino', aliases: ['Tagalog'] },
  { code: 'fi-FI', name: 'Finnish' },
  { code: 'fr-FR', name: 'French', aliases: ['French (France)'] },
  { code: 'fr-CA', name: 'French (Canada)', aliases: ['Canadian French'] },
  { code: 'gl-ES', name: 'Galician' },
  { code: 'ka-GE', name: 'Georgian' },
  { code: 'de-DE', name: 'German', aliases: ['German (Germany)'] },
  { code: 'el-GR', name: 'Greek' },
  { code: 'gu-IN', name: 'Gujarati', aliases: ['Gujarati (India)'] },
  { code: 'he-IL', name: 'Hebrew' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'hu-HU', name: 'Hungarian' },
  { code: 'is-IS', name: 'Icelandic' },
  { code: 'id-ID', name: 'Indonesian' },
  { code: 'xh-ZA', name: 'isiXhosa', aliases: ['isiXhosa (South Africa)', 'Xhosa'] },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'jv-ID', name: 'Javanese' },
  { code: 'kn-IN', name: 'Kannada', aliases: ['Kannada (India)'] },
  { code: 'kk-KZ', name: 'Kazakh' },
  { code: 'km-KH', name: 'Khmer', aliases: ['Khmer (Cambodia)'] },
  { code: 'rw-RW', name: 'Kinyarwanda', aliases: ['Kinyarwanda (Rwanda)'] },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'lo-LA', name: 'Lao' },
  { code: 'lv-LV', name: 'Latvian' },
  { code: 'lt-LT', name: 'Lithuanian' },
  { code: 'mk-MK', name: 'Macedonian' },
  { code: 'ms-MY', name: 'Malay' },
  { code: 'ml-IN', name: 'Malayalam', aliases: ['Malayalam (India)'] },
  { code: 'mr-IN', name: 'Marathi', aliases: ['Marathi (India)'] },
  { code: 'mn-MN', name: 'Mongolian' },
  { code: 'ne-NP', name: 'Nepali' },
  { code: 'nso-ZA', name: 'Northern Sotho', aliases: ['Northern Sotho (South Africa)', 'Sepedi'] },
  { code: 'nb-NO', name: 'Norwegian', aliases: ['Norwegian Bokmål'] },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)', aliases: ['Portuguese'] },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', aliases: ['Brazilian Portuguese'] },
  { code: 'ro-RO', name: 'Romanian' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'sr-RS', name: 'Serbian' },
  { code: 'st-ZA', name: 'Sesotho', aliases: ['Sesotho (South Africa)', 'Southern Sotho'] },
  { code: 'si-LK', name: 'Sinhala' },
  { code: 'sk-SK', name: 'Slovak' },
  { code: 'sl-SI', name: 'Slovenian' },
  { code: 'es-MX', name: 'Spanish (Mexico)', aliases: ['Mexican Spanish', 'Spanish (Latin America)'] },
  { code: 'es-ES', name: 'Spanish (Spain)', aliases: ['Spanish', 'European Spanish'] },
  { code: 'su-ID', name: 'Sundanese' },
  { code: 'sw-KE', name: 'Swahili' },
  { code: 'ss-ZA', name: 'Swati', aliases: ['Swati (South Africa)', 'siSwati'] },
  { code: 'sv-SE', name: 'Swedish', aliases: ['Swedish (Sweden)'] },
  { code: 'ta-IN', name: 'Tamil', aliases: ['Tamil (India)'] },
  { code: 'te-IN', name: 'Telugu', aliases: ['Telugu (India)'] },
  { code: 'th-TH', name: 'Thai' },
  { code: 've-ZA', name: 'Tshivenda', aliases: ['Tshivenda (South Africa)', 'Venda'] },
  { code: 'tn-ZA', name: 'Tswana', aliases: ['Tswana (South Africa)', 'Setswana'] },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'uk-UA', name: 'Ukrainian' },
  { code: 'ur-PK', name: 'Urdu' },
  { code: 'uz-UZ', name: 'Uzbek' },
  { code: 'vi-VN', name: 'Vietnamese' },
  { code: 'ts-ZA', name: 'Xitsonga', aliases: ['Xitsonga (South Africa)', 'Tsonga'] },
  { code: 'zu-ZA', name: 'Zulu' },
];

export const CAPTION_LANGUAGES: readonly CaptionLanguage[] = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name, 'en'));

const byCode = new Map(CAPTION_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

export function getCaptionLanguage(code: string): CaptionLanguage | undefined {
  return byCode.get(code.toLowerCase());
}

/** Name for a stored code; unknown codes are shown as they are. */
export function captionLanguageName(code: string, fallback = 'Meet default'): string {
  if (code === MEET_DEFAULT_CAPTION_LANGUAGE) return fallback;
  return getCaptionLanguage(code)?.name ?? code;
}

/** Lowercase, no "beta" marker, no punctuation, single spaces: tolerant of Meet's wording drifting. */
export function normalizeLanguageName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bbeta\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Primary language subtag with the script or region that follows, e.g. "cmn-hans-cn" -> "cmn-hans". */
function languageKey(tag: string): string {
  const parts = tag.toLowerCase().split(/[-_]/).filter(Boolean);
  return parts.slice(0, 2).join('-');
}

function displayNames(locales: readonly string[]): Intl.DisplayNames[] {
  const out: Intl.DisplayNames[] = [];
  for (const locale of locales) {
    try {
      out.push(new Intl.DisplayNames([locale], { type: 'language' }));
    } catch {
      // unsupported locale tag; the English names still apply
    }
  }
  return out;
}

export interface LanguageOption {
  /** Machine value the option carries, when it has one (e.g. a `data-value` tag). */
  value?: string | null;
  /** Visible text of the option. */
  text: string;
}

/**
 * Finds the catalogue entry an option of Meet's language picker stands for.
 * The value wins when it is a language tag; otherwise the text is compared
 * with the English names and with the names the UI locales would render,
 * which is how a Meet UI in another language labels the same entries.
 */
export function matchCaptionLanguage(option: LanguageOption, locales: readonly string[] = []): CaptionLanguage | null {
  const value = option.value?.trim();
  if (value) {
    const exact = getCaptionLanguage(value);
    if (exact) return exact;
    const key = languageKey(value);
    const candidates = CAPTION_LANGUAGES.filter((l) => languageKey(l.code) === key);
    if (candidates.length === 1) return candidates[0]!;
  }
  const text = normalizeLanguageName(option.text);
  if (!text) return null;
  for (const language of CAPTION_LANGUAGES) {
    for (const name of [language.name, ...(language.aliases ?? [])]) if (normalizeLanguageName(name) === text) return language;
  }
  const names = displayNames(locales);
  if (names.length === 0) return null;
  const renders = (tag: string): boolean => names.some((dn) => normalizeLanguageName(safeDisplayName(dn, tag)) === text);
  // The full tag renders with its region ("English (United Kingdom)").
  const full = CAPTION_LANGUAGES.find((l) => renders(l.code));
  if (full) return full;
  // The bare language name ("English", "русский") belongs to the variant Meet lists without a qualifier.
  const bare = CAPTION_LANGUAGES.filter((l) => renders(primarySubtag(l.code)));
  if (bare.length === 0) return null;
  return bare.find((l) => [l.name, ...(l.aliases ?? [])].some((n) => !n.includes('('))) ?? bare[0]!;
}

function primarySubtag(tag: string): string {
  return tag.split('-')[0]!;
}

function safeDisplayName(dn: Intl.DisplayNames, tag: string): string {
  try {
    return dn.of(tag) ?? '';
  } catch {
    return '';
  }
}

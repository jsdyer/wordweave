export const TRANSFORMS = {
  cleanup: 'Clean spacing', lower: 'lowercase', upper: 'UPPERCASE', title: 'Title Case',
  sentence: 'Sentence case', camel: 'camelCase', pascal: 'PascalCase',
  snake: 'snake_case', kebab: 'kebab-case', slug: 'URL slug',
  NFC: 'Unicode NFC', NFD: 'Unicode NFD', NFKC: 'Unicode NFKC', NFKD: 'Unicode NFKD'
};

export function textSettings(value = {}) {
  return {
    maximumCharacters: Math.max(1000, Math.min(500000, Number(value.maximumCharacters) || 100000)),
    frequencyLimit: Math.max(10, Math.min(1000, Number(value.frequencyLimit) || 100)),
    readingWordsPerMinute: Math.max(50, Math.min(1000, Number(value.readingWordsPerMinute) || 200)),
    unicodePreviewLimit: Math.max(10, Math.min(1000, Number(value.unicodePreviewLimit) || 200))
  };
}

export function validLocale(locale = 'en') {
  try { return Intl.getCanonicalLocales(locale)[0] || 'en'; }
  catch { throw Error('Enter a valid language tag, such as en, fr or tr.'); }
}

export function checkText(text, config = {}) {
  if (typeof text !== 'string') throw Error('Enter plain text.');
  if (text.length > textSettings(config).maximumCharacters) throw Error(`Use at most ${textSettings(config).maximumCharacters.toLocaleString()} UTF-16 code units. Your text has not been changed.`);
  return text;
}

export function wordTokens(text, locale = 'en') {
  locale = validLocale(locale);
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)]
      .filter(x => x.isWordLike).map(x => x.segment);
  }
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

export function textReport(text, locale = 'en', config = {}) {
  checkText(text, config); locale = validLocale(locale); const settings = textSettings(config);
  const words = wordTokens(text, locale), counts = new Map();
  for (const word of words) {
    const key = word.normalize('NFC').toLocaleLowerCase(locale);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const frequency = [...counts].map(([word, count]) => ({word, count}))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, locale));
  const codePoints = [...text];
  return {
    words: words.length, uniqueWords: counts.size, codePoints: codePoints.length,
    codeUnits: text.length, bytes: new TextEncoder().encode(text).length,
    graphemes: typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(locale, {granularity: 'grapheme'}).segment(text)].length : null,
    lines: text ? text.split(/\r\n|\r|\n/u).length : 0,
    paragraphs: text.trim() ? text.replace(/\r\n?/g, '\n').trim().split(/\n[\t ]*\n+/u).filter(p => p.trim()).length : 0,
    readingMinutes: words.length / settings.readingWordsPerMinute,
    frequency: frequency.slice(0, settings.frequencyLimit), frequencyTotal: frequency.length,
    normalization: Object.fromEntries(['NFC','NFD','NFKC','NFKD'].map(form => [form, text.normalize(form) === text])),
    characters: codePoints.slice(0, settings.unicodePreviewLimit).map(char => ({
      char, point: 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
      description: characterDescription(char)
    })),
    segmentation: typeof Intl.Segmenter === 'function' ? 'Intl.Segmenter' : 'Unicode word-pattern fallback'
  };
}

export function characterDescription(char) {
  const names = {' ': 'Space', '\t': 'Tab', '\n': 'Line feed', '\r': 'Carriage return', '\u00a0': 'Non-breaking space', '\u200b': 'Zero-width space', '\u200c': 'Zero-width non-joiner', '\u200d': 'Zero-width joiner', '\ufeff': 'Byte-order mark / zero-width no-break space', '\u2028': 'Line separator', '\u2029': 'Paragraph separator'};
  if (names[char]) return names[char];
  if (/\p{Cc}|\p{Cf}/u.test(char)) return 'Control or format character';
  if (/\p{M}/u.test(char)) return 'Combining mark';
  return char;
}

function identifiers(text, locale) {
  return wordTokens(text.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2').replace(/_/g, ' '), locale)
    .map(w => w.toLocaleLowerCase(locale));
}
function capitalize(word, locale) { const [first, ...rest] = [...word]; return first ? first.toLocaleUpperCase(locale) + rest.join('') : ''; }

export function transformText(text, operation, options = {}, config = {}) {
  checkText(text, config); const locale = validLocale(options.locale || 'en');
  if (!Object.hasOwn(TRANSFORMS, operation)) throw Error('Choose a supported transformation.');
  if (['NFC','NFD','NFKC','NFKD'].includes(operation)) return text.normalize(operation);
  if (operation === 'lower') return text.toLocaleLowerCase(locale);
  if (operation === 'upper') return text.toLocaleUpperCase(locale);
  if (operation === 'cleanup') return text.replace(/\r\n?|\u2028/g, '\n').split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (operation === 'title') return text.toLocaleLowerCase(locale).replace(/(^|[^\p{L}\p{N}'’])([\p{L}\p{N}])/gu, (_, gap, first) => gap + first.toLocaleUpperCase(locale));
  if (operation === 'sentence') return text.toLocaleLowerCase(locale).replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu, (_, gap, first) => gap + first.toLocaleUpperCase(locale));
  if (operation === 'slug') {
    let value = text.normalize(options.asciiSlug ? 'NFKD' : 'NFC').toLocaleLowerCase(locale);
    if (options.asciiSlug) value = value.replace(/\p{M}/gu, '').replace(/[^a-z0-9\s-]/g, '-');
    return value.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  }
  const words = identifiers(text, locale);
  if (operation === 'snake') return words.join('_');
  if (operation === 'kebab') return words.join('-');
  if (operation === 'pascal') return words.map(w => capitalize(w, locale)).join('');
  return words.map((w, i) => i ? capitalize(w, locale) : w).join('');
}

export function frequencyCsv(report) {
  const quote = value => '"' + String(value).replace(/^[=+@\t\r-]/, "'$&").replaceAll('"', '""') + '"';
  return '\uFEFF' + [['Word (NFC, lowercased)', 'Occurrences in pasted text'], ...report.frequency.map(r => [r.word, r.count])].map(row => row.map(quote).join(',')).join('\r\n');
}

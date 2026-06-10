/**
 * Convert spoken punctuation/symbols into real characters.
 * e.g. "ronit at gmail dot com" → "ronit@gmail.com"
 */

const AT_PATTERNS = [
  /\bat\s*the\s*rate\b/gi,
  /\battherate\b/gi,
  /\bat\s*sign\b/gi,
  /\bat\s*symbol\b/gi,
];

const TLD_PATTERN = /\b(com|org|net|io|co|in|edu|gov|uk|au|ca|me|dev|ai)\b/i;
const EMAIL_PROVIDER = /\b(gmail|yahoo|outlook|hotmail|icloud|protonmail|company)\b/i;

function shouldNormalizeDots(text) {
  if (text.includes('@')) return true;
  const dotCount = (text.match(/\bdot\b/gi) || []).length;
  if (dotCount >= 2) return true;
  if (/\b\w+\s+dot\s+(com|org|net|io|co|in|edu|gov)\b/i.test(text)) return true;
  if (/\bat\s+(gmail|yahoo|outlook|hotmail|company)\b/i.test(text)) return true;
  if (/\bperiod\b/i.test(text) && dotCount >= 1) return true;
  return false;
}

function shouldNormalizePeriod(text) {
  return shouldNormalizeDots(text) || (text.match(/\bperiod\b/gi) || []).length >= 2;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeSpokenSymbols(text) {
  if (!text || typeof text !== 'string') return text;

  let t = text.trim();

  for (const pat of AT_PATTERNS) {
    t = t.replace(pat, '@');
  }

  // Lone "at" between email-like tokens: "john at gmail"
  t = t.replace(
    /(\w[\w.-]*)\s+at\s+(\w[\w.-]*)/gi,
    (match, before, after) => {
      if (EMAIL_PROVIDER.test(after) || TLD_PATTERN.test(after) || before.includes('.')) {
        return `${before}@${after}`;
      }
      return match;
    }
  );

  if (shouldNormalizeDots(t)) {
    t = t.replace(/\s+dot\s+/gi, '.');
    t = t.replace(/\bdot\b(?=\s*[\w])/gi, '.');
  }

  if (shouldNormalizePeriod(t)) {
    t = t.replace(/\s+period\s+/gi, '.');
  }

  t = t.replace(/\s*@\s*/g, '@');
  t = t.replace(/\s*\.\s*/g, '.');

  t = t.replace(/\s+underscore\s+/gi, '_');
  t = t.replace(/\s+hyphen\s+/gi, '-');
  t = t.replace(/\s+dash\s+/gi, '-');
  t = t.replace(/\s+slash\s+/gi, '/');

  // "3 dot 30" → "3.30" for times
  t = t.replace(/(\d)\s+dot\s+(\d)/gi, '$1.$2');

  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

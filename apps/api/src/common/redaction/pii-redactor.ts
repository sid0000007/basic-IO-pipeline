// Regex patterns are intentionally conservative (false-negative-friendly).
// They will not catch every PII variant; their job is to catch the obvious
// cases that show up in dashboards. Production teams that need stronger
// redaction should layer a real PII classifier on top in Phase 4.

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// `\b` doesn't anchor cleanly against `(`, so use a digit lookbehind/-ahead pair.
// This lets the leading `(` be captured as part of the phone match.
const PHONE_NA = /(?<!\d)\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g;
// Anchor each digit individually so the optional `[ -]?` between iterations
// doesn't eat the trailing separator after the last digit.
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;

export function redactPii(input: string): string {
  // Order matters: email first so its `@` is consumed before phone regex
  // could ever match around it; SSN before phone so the more-specific
  // pattern claims the digits first; card last because it's the most
  // expensive (Luhn check).
  let out = input.replace(EMAIL, '[email]');
  out = out.replace(SSN, '[ssn]');
  out = out.replace(PHONE_NA, '[phone]');
  out = out.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/[ -]/g, '');
    return isLuhnValid(digits) ? '[card]' : match;
  });
  return out;
}

function isLuhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const code = digits.charCodeAt(i) - 48;
    if (code < 0 || code > 9) return false;
    let val = code;
    if (alt) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
    alt = !alt;
  }
  return sum % 10 === 0;
}

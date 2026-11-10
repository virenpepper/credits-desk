// Removes what could identify the sender before Claude sees the text.
// The raw text is never stored; only the extracted claim fields are.

const SIGN_OFF =
  /^(--\s*|_{2,}|sent from my .*|get outlook for .*|(thanks|thank you|thx|best|best regards|regards|kind regards|warm regards|cheers|sincerely)[,.!]?)$/i;
const HEADER = /^(from|to|cc|bcc|sent|date|reply-to)\s*:/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;

export function scrub(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // Stop at the first sign-off once there is content: the rest is the signature.
    if (SIGN_OFF.test(line) && kept.join("").trim()) break;
    if (HEADER.test(line)) continue;
    kept.push(raw);
  }
  return kept
    .join("\n")
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Input sanitization (defense-in-depth alongside Zod validation).
 *
 * The request is already schema-validated at every boundary; these helpers
 * handle the second layer: stripping control characters that are legal JSON
 * but hostile in HTML/email/logs, and normalizing identity fields. Output
 * encoding lives at the presentation layer (see email/templates escapeHtml and
 * React's default escaping); nothing here replaces validation.
 */

const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Strip ASCII control chars, collapse whitespace and trim. Null-safe. */
export function sanitizeText(value: unknown, maxLength = 500): string {
  const text = String(value ?? "")
    .replace(CONTROL_RE, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}

/** Normalize + validate an e-mail address. Returns null when invalid. */
export function sanitizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** Escape a value for safe HTML embedding (used by server-rendered mail/views). */
export function escapeHtmlValue(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
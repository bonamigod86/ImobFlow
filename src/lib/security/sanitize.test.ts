import { describe, expect, it } from "vitest";
import {
  sanitizeText,
  sanitizeEmail,
  escapeHtmlValue,
} from "@/lib/security/sanitize";

/**
 * Sanitization contract — control chars stripped, bounded length, e-mail
 * normalization. Layered ON TOP of Zod validation (never a replacement).
 */
describe("sanitize", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(sanitizeText("a\u0000b\u001f\tc  d")).toBe("ab c d");
    // Newlines are preserved (they are meaningful in lead messages).
    expect(sanitizeText("l1\nl2")).toBe("l1\nl2");
  });

  it("caps length defensively", () => {
    expect(sanitizeText("x".repeat(5000))).toHaveLength(500);
    expect(sanitizeText("123", 2)).toBe("12");
  });

  it("normalizes and validates e-mails", () => {
    expect(sanitizeEmail(("  Owner@ACME.com "))).toBe("owner@acme.com");
    expect(sanitizeEmail("not-an-email")).toBeNull();
    expect(sanitizeEmail("")).toBeNull();
    expect(sanitizeEmail(null)).toBeNull();
  });

  it("returns empty string for null/undefined text", () => {
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(null)).toBe("");
  });

  it("escapes HTML entities for safe embedding", () => {
    expect(escapeHtmlValue(`<b>"x" & 'y'`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;");
  });
});
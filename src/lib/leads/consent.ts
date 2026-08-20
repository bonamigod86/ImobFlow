/**
 * LGPD consent contract shared by every capture surface.
 *
 * The server owns the statement text keyed by version; clients only assert
 * that consent was granted (`granted: true`) and optionally pin a known
 * version. Every capture persists a `LeadConsent` row with the exact text,
 * version, IP and origin URL for that grant.
 */

export const CONSENT_VERSIONS = {
  "2026-08-19.v1":
    "Autorizo o armazenamento e o tratamento dos dados informados para " +
    "viabilizar o contato comercial sobre o imóvel solicitado, em conformidade " +
    "com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). Posso " +
    "solicitar a correção ou exclusão dos meus dados a qualquer momento.",
} as const;

export type ConsentVersion = keyof typeof CONSENT_VERSIONS;

/** The version shown by production forms today. */
export const CURRENT_CONSENT_VERSION: ConsentVersion = "2026-08-19.v1";

/** Version guard — a stale client pinning an older version is rejected. */
export const CONSENT_VERSION_MAX = CURRENT_CONSENT_VERSION;

export function consentTextFor(version: string): string | null {
  return CONSENT_VERSIONS[version as ConsentVersion] ?? null;
}
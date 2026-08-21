import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 *
 * Every server-side module reads configuration through this singleton so that:
 *  - a missing/invalid variable fails fast at startup with a readable message;
 *  - production and worker processes share one source of truth;
 *  - the app never falls back to undefined behaviour for security-sensitive
 *    values such as `JWT_SECRET`.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /** Deployment ring — `production` vs `staging`/`development` (homologação). */
  APP_ENV: z
    .enum(["development", "staging", "production"])
    .optional()
    .transform((v) => v ?? (process.env.NODE_ENV === "production" ? "production" : "development")),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres"), {
      message: "DATABASE_URL must be a postgres:// connection string",
    }),

  REDIS_URL: z.string().min(1, "REDIS_URL is required").default("redis://localhost:6379"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .describe("HS256 signing secret for session JWTs"),

  JWT_EXPIRES_IN: z.string().min(1).default("8h"),

  SESSION_COOKIE: z.string().min(1).default("saas_session"),

  /** Root domain used for subdomain-based tenant resolution, e.g. "saas.local". Optional in local dev. */
  APP_DOMAIN: z.string().optional().default(""),

  APP_URL: z.string().url().default("http://localhost:3000"),

  /** Only consumed by the seed script; never trusted at runtime for authz. */
  SEED_ADMIN_PASSWORD: z.string().default("ChangeMe-123!"),

  // Object storage (S3-compatible: AWS S3, Cloudflare R2, MinIO…) for media.
  // When unset the app uses an in-proc LOCAL fallback (dev/test only).
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_BASE_URL: z.string().optional().default(""),

  /**
   * AES-256-GCM key used to encrypt outbound webhook HMAC secrets at rest.
   * Must be 32 bytes (base64 or raw hex when set). When empty, secrets are
   * stored as-is — acceptable for local dev only; set it in any real env.
   */
  INTEGRATION_SECRET_KEY: z.string().optional().default(""),

  // ---------------------------------------------------------------------------
  // Phase 5 — Billing (payment gateway webhooks + dunning)
  // ---------------------------------------------------------------------------

  /** Stripe webhook signing secret (starts with `whsec_`). Empty disables verification (dev). */
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_SECRET_KEY: z.string().optional().default(""),

  /** Asaas webhook signing token (`asaas-signature` HMAC-SHA256 base64). */
  ASAAS_WEBHOOK_SECRET: z.string().optional().default(""),
  ASAAS_API_KEY: z.string().optional().default(""),
  ASAAS_API_URL: z.string().optional().default("https://sandbox.asaas.com"),

  /** Custom gateway shared secret for the `x-webhook-signature` header. */
  CUSTOM_WEBHOOK_SECRET: z.string().optional().default(""),

  /** Days of grace a PAST_DUE account gets before automatic suspension. */
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(365).default(5),
  /** Days before the due date a PRE_DUE dunning notification is triggered. */
  BILLING_PRE_DUE_NOTIFY_DAYS: z.coerce.number().int().min(0).max(365).default(3),
  /** Cadence (days) of LATE_REMINDER re-notifications once a bill is PAST_DUE. */
  BILLING_DUNNING_LATE_EVERY_DAYS: z.coerce.number().int().min(1).max(90).default(3),
  /** Master switch for the automatic account suspension (grace expiry). */
  BILLING_AUTOSUSPEND_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // ---------------------------------------------------------------------------
  // Phase 6 — Transactional e-mail (Resend / SendGrid / SES / console)
  // ---------------------------------------------------------------------------

  /** Active transport. `console` logs to stdout (dev/test, no network). */
  EMAIL_PROVIDER: z
    .enum(["resend", "sendgrid", "ses", "console"])
    .default("console"),
  /** Shared key for Resend (`re_...`) and SendGrid (`SG.`). Empty is fine for console. */
  EMAIL_API_KEY: z.string().optional().default(""),
  /** From address for all transactional mail. */
  EMAIL_FROM: z.string().email().default("naoresponda@imob.example.com"),
  EMAIL_FROM_NAME: z.string().default("SaaS Imob"),
  /** AWS region used by the SES transport. */
  SES_REGION: z.string().optional().default("us-east-1"),
  SES_ACCESS_KEY_ID: z.string().optional().default(""),
  SES_SECRET_ACCESS_KEY: z.string().optional().default(""),

  /** Password-reset token lifetime in seconds (default 15 min). */
  RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),

  // ---------------------------------------------------------------------------
  // Phase 6 — Security hardening (rate limiting, CORS)
  // ---------------------------------------------------------------------------

  /** Window (seconds) used by the IP/tenant rate limiter (fail-open). */
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  /** Max auth attempts (login/forgot/reset) per IP per window. */
  RATE_LIMIT_AUTH: z.coerce.number().int().min(1).max(10000).default(10),
  /** Max public lead captures per IP per window (portal spikes). */
  RATE_LIMIT_PUBLIC_LEADS: z.coerce.number().int().min(1).max(100000).default(30),
  /** Max public page-impressions per IP per window (portal browsing). */
  RATE_LIMIT_PUBLIC_VIEWS: z.coerce.number().int().min(1).max(1000000).default(120),
  /** Comma-separated allowed origins for the /api/public/* CORS header. */
  CORS_ORIGINS: z.string().optional().default(""),

  // ---------------------------------------------------------------------------
  // Phase 6 — Privacy / LGPD (Checklist Item 20)
  // ---------------------------------------------------------------------------

  /** After how many days (from withdrawal) a consent-opted-out lead is anonymized. */
  GDPR_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration.\n${issues}\n\nCopy .env.example to .env and adjust the values.`,
    );
  }
  return parsed.data;
}

/**
 * Processes may load `.env` files through different mechanisms
 * (Next.js, tsx workers, vitest). Always validate at import time.
 */
export const env: Env = loadEnv();

/** Parse a duration like "300", "5m", "8h", "7d" into seconds. */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}". Use e.g. "8h", "30m", "3600".`);
  }
  const n = Number(match[1]!);
  const unit = match[2] ?? "s";
  const factors: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * factors[unit]!;
}
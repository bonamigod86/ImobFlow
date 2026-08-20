import { env } from "@/lib/config/env";
import type {
  EmailProviderName,
  EmailTransport,
  OutboundEmail,
} from "@/lib/email/types";
import { escapeHtml } from "@/lib/email/templates";
import { signRequest } from "@/lib/email/ses-signer";

/**
 * E-mail transport layer — Resend, SendGrid, Amazon SES or a local console.
 *
 * All providers are reached over plain HTTPS with `fetch` (no SDKs), so the
 * transport works in any Node 18+ runtime and is trivial to unit-test.
 *
 * Retry contract:
 *   - transient (429/5xx/network) -> throw (BullMQ retries with backoff);
 *   - permanent (4xx: bad key, invalid recipient) -> throw NonRetryableEmailError
 *     so the job is parked in the DLQ instead of being retried pointlessly.
 */

export class RetryableEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableEmailError";
  }
}

export class NonRetryableEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableEmailError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function postJson(url: string, apiKey: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await classify(response);
}

async function classify(response: Response): Promise<void> {
  if (response.status >= 200 && response.status < 300) return;
  const detail = (await response.text().catch(() => "")).slice(0, 500);
  const message = `HTTP ${response.status}: ${detail}`;
  if (response.status === 429 || response.status >= 500) {
    throw new RetryableEmailError(message);
  }
  throw new NonRetryableEmailError(message);
}

class ResendTransport implements EmailTransport {
  readonly name = "resend" as const;
  async send(message: OutboundEmail): Promise<void> {
    if (!env.EMAIL_API_KEY) {
      throw new NonRetryableEmailError("EMAIL_API_KEY is required for Resend.");
    }
    await postJson("https://api.resend.com/emails", env.EMAIL_API_KEY, {
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: [message.to.email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

class SendGridTransport implements EmailTransport {
  readonly name = "sendgrid" as const;
  async send(message: OutboundEmail): Promise<void> {
    if (!env.EMAIL_API_KEY) {
      throw new NonRetryableEmailError("EMAIL_API_KEY is required for SendGrid.");
    }
    await postJson("https://api.sendgrid.com/v3/mail/send", env.EMAIL_API_KEY, {
      personalizations: [{ to: [{ email: message.to.email, name: message.to.name }] }],
      from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
      subject: message.subject,
      content: [
        { type: "text/html", value: message.html },
        { type: "text/plain", value: message.text },
      ],
    });
  }
}

class SesTransport implements EmailTransport {
  readonly name = "ses" as const;
  async send(message: OutboundEmail): Promise<void> {
    const { SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY } = env;
    if (!SES_ACCESS_KEY_ID || !SES_SECRET_ACCESS_KEY) {
      throw new NonRetryableEmailError(
        "SES_ACCESS_KEY_ID/SES_SECRET_ACCESS_KEY are required for SES.",
      );
    }

    const host = `email.${SES_REGION}.amazonaws.com`;
    const form = [
      "Action=SendEmail",
      "Version=2010-12-01",
      `Source=${encodeURIComponent(env.EMAIL_FROM)}`,
      `Destination.ToAddresses.member.1=${encodeURIComponent(message.to.email)}`,
      `Message.Subject.Data=${encodeURIComponent(message.subject)}`,
      `Message.Body.Html.Data=${encodeURIComponent(message.html)}`,
      `Message.Body.Text.Data=${encodeURIComponent(message.text)}`,
    ].join("&");

    const { headers } = signRequest({
      method: "POST",
      host,
      path: "/",
      query: "",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: form,
      region: SES_REGION,
      service: "ses",
      accessKeyId: SES_ACCESS_KEY_ID,
      secretAccessKey: SES_SECRET_ACCESS_KEY,
      contentSha256Header: true,
    });

    const response = await fetch(`https://${host}/`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await classify(response);
  }
}

/** Dev/test transport: logs the message and never touches the network. */
class ConsoleTransport implements EmailTransport {
  readonly name = "console" as const;
  async send(message: OutboundEmail): Promise<void> {
    console.info(
      `[mail:${this.name}] to=${message.to.email} subject="${escapeHtml(message.subject)}" dedupe=${message.dedupeKey}`,
    );
  }
}

let cachedTransport: EmailTransport | null = null;

/** Select the active transport from EMAIL_PROVIDER (singleton per process). */
export function getEmailTransport(): EmailTransport {
  if (cachedTransport) return cachedTransport;
  const provider = env.EMAIL_PROVIDER as EmailProviderName;
  const map: Record<EmailProviderName, () => EmailTransport> = {
    resend: () => new ResendTransport(),
    sendgrid: () => new SendGridTransport(),
    ses: () => new SesTransport(),
    console: () => new ConsoleTransport(),
  };
  cachedTransport = map[provider]();
  return cachedTransport;
}

/** Test seam: clear the cached transport (used by unit tests). */
export function resetEmailTransport(): void {
  cachedTransport = null;
}

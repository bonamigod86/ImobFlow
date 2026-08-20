import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 signer (zero-dependency).
 *
 * Used by the SES e-mail transport. The algorithm is locked by a unit test
 * against the official AWS documentation example, so regressions surface as
 * test failures, never as silent `SignatureDoesNotMatch` at 3 a.m.
 *
 * References: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** AWS URI-encode: encodeURIComponent + the four chars SigV4 escapes. */
export function awsUriEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

/** Canonical query string: keys sorted, each key=value encoded. */
export function canonicalQuery(query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return "";
  return Object.keys(query)
    .sort()
    .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k]!)}`)
    .join("&");
}

/** Collapse whitespace runs to single spaces and trim (AWS canonical form). */
export function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Derive the signing key: kSecret -> kDate -> kRegion -> kService -> kSigning.
 */
export function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface SigV4SignInput {
  method: string;
  host: string;
  /** Path as sent (already percent-encoded if needed), e.g. "/". */
  path: string;
  /** Canonical query string (empty for none). */
  query?: string;
  /** Extra headers (lower-cased keys). `host`/`x-amz-date` are appended. */
  headers?: Record<string, string>;
  body: string | Buffer;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Advertise the body hash via an `x-amz-content-sha256` header (SES/ALB
   * require it; optional for S3/CloudFront). The payload hash is ALWAYS part
   * of the canonical request regardless of this flag.
   */
  contentSha256Header?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface SigV4SignResult {
  authorization: string;
  headers: Record<string, string>;
  payloadHash: string;
}

/**
 * Build the Authorization header + the required extra headers for a request.
 * Returns the header map the caller merges into the outbound HTTP call.
 */
export function signRequest(input: SigV4SignInput): SigV4SignResult {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.host,
    "x-amz-date": amzDate,
  };
  if (input.contentSha256Header) {
    headers["x-amz-content-sha256"] = payloadHash;
  }

  const canonicalHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = canonicalHeaderValue(headers[k] ?? "");
      return acc;
    }, {});

  const signedHeaders = Object.keys(canonicalHeaders).sort().join(";");

  const canonicalHeadersBlock = Object.keys(canonicalHeaders)
    .sort()
    .map((k) => `${k}:${canonicalHeaders[k]}\n`)
    .join("");

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path,
    input.query ?? "",
    canonicalHeadersBlock,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    input.service,
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization =
    `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    authorization,
    headers: {
      ...canonicalHeaders,
      authorization,
    },
    payloadHash,
  };
}

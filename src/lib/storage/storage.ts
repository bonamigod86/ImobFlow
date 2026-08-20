import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/config/env";

/**
 * Minimal S3-compatible object storage adapter.
 *
 * Works with AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, etc. — any
 * endpoint + access-key S3 API. Media objects never cross the app server on
 * the write path: the client uploads straight to a presigned URL, and the
 * processing worker reads/resizes directly from the bucket.
 *
 * When no S3 config is present (local dev/tests) the adapter falls back to a
 * throw-away in-process map so the rest of the pipeline stays testable.
 */

export interface StorageAdapter {
  /** Presigned PUT URL a client can upload to (expires 15m). */
  presignPut(key: string, opts?: { contentType?: string; expiresInSeconds?: number }): Promise<string>;
  /** Presigned GET URL for a stored object (expires 1h by default). */
  presignGet(key: string, opts?: { expiresInSeconds?: number }): Promise<string>;
  put(key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ size: number; contentType?: string }>;
  delete(key: string): Promise<void>;
}

function keyPrefix(): string {
  return env.S3_BUCKET ? "" : "local/";
}

let s3Client: S3Client | null = null;
function client(): S3Client {
  if (!s3Client) {
    const endpoint = env.S3_ENDPOINT || undefined;
    s3Client = new S3Client({
      region: env.S3_REGION,
      ...(endpoint
        ? { endpoint, forcePathStyle: true }
        : { forcePathStyle: true }),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID || "unused",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || "unused",
      },
    });
  }
  return s3Client;
}

function bucket(): string {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required for S3 storage.");
  return env.S3_BUCKET;
}

class S3Storage implements StorageAdapter {
  private resolve(key: string): string {
    return keyPrefix() + key;
  }

  async presignPut(key: string, opts?: { contentType?: string; expiresInSeconds?: number }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket(),
      Key: this.resolve(key),
      ...(opts?.contentType ? { ContentType: opts.contentType } : {}),
    });
    return getSignedUrl(client(), command, {
      expiresIn: opts?.expiresInSeconds ?? 900,
    });
  }

  async presignGet(key: string, opts?: { expiresInSeconds?: number }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket(), Key: this.resolve(key) });
    return getSignedUrl(client(), command, { expiresIn: opts?.expiresInSeconds ?? 3600 });
  }

  async put(key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void> {
    await client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: this.resolve(key),
        Body: body,
        ...(options?.contentType ? { ContentType: options.contentType } : {}),
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: this.resolve(key) }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${key}`);
    return Buffer.from(bytes);
  }

  async head(key: string): Promise<{ size: number; contentType?: string }> {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: this.resolve(key) }),
    );
    return {
      size: Number(res.ContentLength ?? 0),
      contentType: res.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: this.resolve(key) }));
  }
}

/** In-proc fallback so local dev/tests work without a bucket. */
class LocalStorage implements StorageAdapter {
  private objects = new Map<string, Buffer>();
  private counter = 0;

  async presignPut(): Promise<string> {
    return `local://put/${this.counter++}`;
  }
  async presignGet(): Promise<string> {
    return `local://get/${this.counter++}`;
  }
  async put(key: string, body: Buffer | Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }
  async get(key: string): Promise<Buffer> {
    const buf = this.objects.get(key);
    if (!buf) throw new Error(`Object not found in local storage: ${key}`);
    return buf;
  }
  async head(key: string): Promise<{ size: number; contentType?: string }> {
    const buf = this.objects.get(key);
    if (!buf) throw new Error(`Object not found in local storage: ${key}`);
    return { size: buf.length, contentType: "application/octet-stream" };
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  reset(): void {
    this.objects.clear();
  }
}

export const storage: StorageAdapter =
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID ? new S3Storage() : new LocalStorage();

/** True when real object storage is configured (vs. the local fallback). */
export const hasRealStorage = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID);
/** Public base URL for rendering stored objects (CDN/domain). */
export function publicUrlForKey(key: string): string {
  if (!env.S3_PUBLIC_BASE_URL) return "";
  return `${env.S3_PUBLIC_BASE_URL}/${encodeURIComponent(key)}`;
}

/** Reset the local fallback (tests). */
export function resetLocalStorage(): void {
  if (storage instanceof LocalStorage) storage.reset();
}
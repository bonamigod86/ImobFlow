import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

/** Disk-backed fallback so local dev uploads SURVIVE server restarts. */
class LocalStorage implements StorageAdapter {
  private root = path.join(process.cwd(), ".data", "media");

  private file(key: string): string {
    // Keys may contain "/" — keep the structure, but never escape the root.
    const safe = key.replace(/\.\./g, "__").replace(/^\/+/, "");
    return path.join(this.root, safe);
  }

  private async write(file: string, body: Buffer | Uint8Array): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async presignPut(): Promise<string> {
    return "local://put";
  }
  async presignGet(): Promise<string> {
    return "local://get";
  }
  async put(key: string, body: Buffer | Uint8Array): Promise<void> {
    await this.write(this.file(key), body);
  }
  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.file(key));
    } catch {
      throw new Error(`Object not found in local storage: ${key}`);
    }
  }
  async head(key: string): Promise<{ size: number; contentType?: string }> {
    try {
      const s = await stat(this.file(key));
      return { size: s.size, contentType: "application/octet-stream" };
    } catch {
      throw new Error(`Object not found in local storage: ${key}`);
    }
  }
  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
  async reset(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
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

/** Reset the local disk store (tests). */
export function resetLocalStorage(): Promise<void> {
  if (storage instanceof LocalStorage) return storage.reset();
  return Promise.resolve();
}
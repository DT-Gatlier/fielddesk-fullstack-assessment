import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Storage abstraction. The API and database only ever deal in opaque storage
 * keys ("<orgId>/<uuid>"); no filesystem path ever leaves this module.
 *
 * Production swap: an S3StorageProvider would implement the same interface —
 * put() = PutObject (or a multipart upload), openRead() = GetObject stream (or
 * the route would redirect to a short-lived pre-signed GET URL), delete() =
 * DeleteObject — against a private bucket with server-side encryption.
 */
export interface StorageProvider {
  /** Directory multer writes in-flight uploads to. */
  readonly tempDir: string;
  /** Moves a fully-received temp file into permanent storage under `key`. */
  put(key: string, tempPath: string): Promise<void>;
  openRead(key: string): Promise<{ stream: Readable; size: number }>;
  delete(key: string): Promise<void>;
  init(): Promise<void>;
}

const SAFE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

export class LocalDiskStorage implements StorageProvider {
  readonly root: string;
  readonly tempDir: string;

  constructor(dir: string) {
    this.root = resolve(dir, 'objects');
    this.tempDir = resolve(dir, 'tmp');
  }

  async init() {
    await mkdir(this.root, { recursive: true });
    await mkdir(this.tempDir, { recursive: true });
  }

  /** Keys are generated server-side, but are still validated so a bad key can never escape the root. */
  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error('invalid storage key');
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error('invalid storage key');
    return p;
  }

  async put(key: string, tempPath: string) {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await rename(tempPath, target); // same filesystem: atomic
  }

  async openRead(key: string) {
    const p = this.pathFor(key);
    const { size } = await stat(p);
    return { stream: createReadStream(p), size };
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}

export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

/**
 * Detects the real file type from its leading bytes ("magic numbers").
 * The client-declared MIME type and filename extension are ignored.
 */
export async function sniffContentType(path: string): Promise<AllowedType | null> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    const b = buf.subarray(0, bytesRead);
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
    return null;
  } finally {
    await fh.close();
  }
}

/** Display-only name: strips any path, control and quote characters. Never used for storage. */
export function sanitizeFilename(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim().slice(0, 200);
  return cleaned || 'file';
}

export const tempFilePath = (dir: string, name: string) => join(dir, name);

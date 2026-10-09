import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';

import {
  STORAGE_ROOT,
  type SaveFileResult,
  type StorageDriverPort,
} from './storage-driver.port';

@Injectable()
export class LocalStorageDriver implements StorageDriverPort {
  private readonly storageRoot: string;

  constructor(
    @Optional()
    @Inject(STORAGE_ROOT)
    customPath?: string,
  ) {
    this.storageRoot = path.resolve(customPath ?? path.join(process.cwd(), 'uploads'));
  }

  private resolveKeyPath(storageKey: string): string {
    // Validate storageKey against path traversal
    const safeKey = path.basename(storageKey);
    if (!safeKey || safeKey !== storageKey || storageKey.includes('..') || storageKey.includes('/') || storageKey.includes('\\')) {
      throw new NotFoundException('Resource not found');
    }
    const resolvedPath = path.resolve(this.storageRoot, safeKey);
    if (!resolvedPath.startsWith(this.storageRoot)) {
      throw new NotFoundException('Resource not found');
    }
    return resolvedPath;
  }

  async save(buffer: Buffer, originalFileName: string): Promise<SaveFileResult> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    // Extract sanitized extension (only alphanumeric)
    const rawExt = path.extname(originalFileName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const extension = rawExt ? `.${rawExt}` : '';
    const storageKey = `${randomUUID()}${extension}`;

    const filePath = path.join(this.storageRoot, storageKey);
    await fs.writeFile(filePath, buffer);

    return { storageKey };
  }

  async getStream(storageKey: string): Promise<Readable> {
    const filePath = this.resolveKeyPath(storageKey);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Resource not found');
    }
    return createReadStream(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.resolveKeyPath(storageKey);
    try {
      await fs.unlink(filePath);
    } catch {
      // Idempotent delete if file is already gone
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolveKeyPath(storageKey);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

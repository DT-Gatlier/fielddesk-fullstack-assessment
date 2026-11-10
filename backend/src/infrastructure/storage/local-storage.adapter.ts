import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { StorageAdapter } from './storage.interface.js';
import { logger } from '../logger.js';
import { NotFoundError } from '../../domain/errors/index.js';

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'uploads');
  }

  private getOrgDir(organisationId: string): string {
    // Sanitize organisationId to prevent directory traversal
    const safeOrgId = path.basename(organisationId).replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.baseDir, safeOrgId);
  }

  private getSafeFilePath(organisationId: string, storageKey: string): string {
    const orgDir = this.getOrgDir(organisationId);
    const safeKey = path.basename(storageKey).replace(/[^a-zA-Z0-9._-]/g, '');
    const resolvedPath = path.resolve(orgDir, safeKey);

    // Verify resolved path is strictly within the org directory
    if (!resolvedPath.startsWith(path.resolve(orgDir))) {
      throw new Error('Potential directory traversal detected');
    }

    return resolvedPath;
  }

  async saveFile(organisationId: string, storageKey: string, buffer: Buffer): Promise<void> {
    const orgDir = this.getOrgDir(organisationId);
    await fs.promises.mkdir(orgDir, { recursive: true });

    const filePath = this.getSafeFilePath(organisationId, storageKey);
    await fs.promises.writeFile(filePath, buffer);
    logger.debug({ organisationId, storageKey, bytes: buffer.length }, 'File saved to local storage');
  }

  async getFileStream(organisationId: string, storageKey: string): Promise<Readable> {
    const filePath = this.getSafeFilePath(organisationId, storageKey);
    const fileExists = await this.exists(organisationId, storageKey);
    if (!fileExists) {
      throw new NotFoundError('Attachment file not found on disk');
    }
    return fs.createReadStream(filePath);
  }

  async exists(organisationId: string, storageKey: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(organisationId, storageKey);
      await fs.promises.access(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(organisationId: string, storageKey: string): Promise<void> {
    try {
      const filePath = this.getSafeFilePath(organisationId, storageKey);
      if (await this.exists(organisationId, storageKey)) {
        await fs.promises.unlink(filePath);
        logger.debug({ organisationId, storageKey }, 'File deleted from local storage');
      }
    } catch (err: any) {
      logger.warn({ err: err.message, organisationId, storageKey }, 'Failed to delete file from local storage');
    }
  }

  getFilePath(organisationId: string, storageKey: string): string {
    return this.getSafeFilePath(organisationId, storageKey);
  }
}

export const localStorageAdapter = new LocalStorageAdapter();


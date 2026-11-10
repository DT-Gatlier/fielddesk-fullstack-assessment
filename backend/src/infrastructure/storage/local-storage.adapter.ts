import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { StorageAdapter } from './storage.interface.js';
import { logger } from '../logger.js';
import { NotFoundError } from '../../domain/errors/index.js';

const BASE_DIR = path.resolve(process.cwd(), 'uploads');

function getOrgDir(organisationId: string): string {
  // Sanitize organisationId to prevent directory traversal
  const safeOrgId = path.basename(organisationId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(BASE_DIR, safeOrgId);
}

function getSafeFilePath(organisationId: string, storageKey: string): string {
  const orgDir = getOrgDir(organisationId);
  const safeKey = path.basename(storageKey).replace(/[^a-zA-Z0-9._-]/g, '');
  const resolvedPath = path.resolve(orgDir, safeKey);

  // Verify resolved path is strictly within the org directory
  if (!resolvedPath.startsWith(path.resolve(orgDir))) {
    throw new Error('Potential directory traversal detected');
  }

  return resolvedPath;
}

export async function saveFile(
  organisationId: string,
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  const orgDir = getOrgDir(organisationId);
  await fs.promises.mkdir(orgDir, { recursive: true });

  const filePath = getSafeFilePath(organisationId, storageKey);
  await fs.promises.writeFile(filePath, buffer);
  logger.debug({ organisationId, storageKey, bytes: buffer.length }, 'File saved to local storage');
}

export async function getFileStream(
  organisationId: string,
  storageKey: string
): Promise<Readable> {
  const filePath = getSafeFilePath(organisationId, storageKey);
  const exists = await fileExists(organisationId, storageKey);
  if (!exists) {
    throw new NotFoundError('Attachment file not found on disk');
  }
  return fs.createReadStream(filePath);
}

export async function fileExists(
  organisationId: string,
  storageKey: string
): Promise<boolean> {
  try {
    const filePath = getSafeFilePath(organisationId, storageKey);
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(
  organisationId: string,
  storageKey: string
): Promise<void> {
  try {
    const filePath = getSafeFilePath(organisationId, storageKey);
    if (await fileExists(organisationId, storageKey)) {
      await fs.promises.unlink(filePath);
      logger.debug({ organisationId, storageKey }, 'File deleted from local storage');
    }
  } catch (err: any) {
    logger.warn(
      { err: err.message, organisationId, storageKey },
      'Failed to delete file from local storage'
    );
  }
}

export function getFilePath(organisationId: string, storageKey: string): string {
  return getSafeFilePath(organisationId, storageKey);
}

// Grouped object export typed against the StorageAdapter interface
export const localStorageAdapter: StorageAdapter = {
  saveFile,
  getFileStream,
  exists: fileExists,
  deleteFile,
  getFilePath,
};

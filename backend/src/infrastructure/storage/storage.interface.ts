import { Readable } from 'stream';

/**
 * StorageAdapter defines the contract for storing, retrieving, and deleting
 * attachment files across multi-tenant boundaries.
 *
 * In local/development environments, LocalStorageAdapter stores files in
 * `uploads/${organisationId}/${storageKey}`.
 *
 * In production cloud deployments (AWS S3, Google Cloud Storage, Cloudflare R2),
 * this can be swapped with S3StorageAdapter / GCSStorageAdapter using direct
 * pre-signed upload & download URLs:
 * 1. Upload: Client requests pre-signed PUT URL with HMAC signature, content-length,
 *    and content-type constraints, uploading directly to the bucket.
 * 2. Download: Server generates short-lived (e.g. 15-minute) pre-signed GET URL with
 *    `response-content-disposition` and redirects the client, offloading server bandwidth.
 */
export interface StorageAdapter {
  saveFile(organisationId: string, storageKey: string, buffer: Buffer): Promise<void>;
  getFileStream(organisationId: string, storageKey: string): Promise<Readable>;
  deleteFile(organisationId: string, storageKey: string): Promise<void>;
  exists(organisationId: string, storageKey: string): Promise<boolean>;
  getFilePath?(organisationId: string, storageKey: string): string;
}


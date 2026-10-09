import type { Readable } from 'node:stream';

export interface SaveFileResult {
  storageKey: string;
}

export interface StorageDriverPort {
  save(buffer: Buffer, originalFileName: string): Promise<SaveFileResult>;
  getStream(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
export const STORAGE_ROOT = Symbol('STORAGE_ROOT');

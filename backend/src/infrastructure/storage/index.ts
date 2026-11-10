import { StorageAdapter } from './storage.interface.js';
import { localStorageAdapter } from './local-storage.adapter.js';

export * from './storage.interface.js';
export * from './local-storage.adapter.js';

// The application services program against StorageAdapter interface
export const storageAdapter: StorageAdapter = localStorageAdapter;


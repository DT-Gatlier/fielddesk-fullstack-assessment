export interface Attachment {
  id: string;
  organisationId: string;
  workOrderId: string;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  downloadUrl: string;
  createdAt: Date;
}

export interface StorageQuotaInfo {
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
}


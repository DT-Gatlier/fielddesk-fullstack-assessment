export interface CreateAttachmentInput {
  workOrderId: string;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}
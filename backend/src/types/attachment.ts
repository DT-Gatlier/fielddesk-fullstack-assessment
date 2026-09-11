export type AllowedMimeType = "image/jpeg" | "image/png" | "application/pdf";

export type WorkOrderAttachment = {
  id: string;
  organisationId: string;
  workOrderId: string;
  uploadedByUserId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  createdAt: string;
};

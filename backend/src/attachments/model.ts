export interface AttachmentRow {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: Date;
}

/** API shape. The storage key and any filesystem location are deliberately not exposed. */
export const toAttachment = (row: AttachmentRow) => ({
  id: row.id,
  filename: row.original_filename,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  uploadedBy: { id: row.uploaded_by, name: row.uploaded_by_name },
  createdAt: row.created_at.toISOString(),
  downloadUrl: `/api/attachments/${row.id}/download`,
});

'use client';

import * as React from 'react';
import {
  AlertCircle,
  Calendar,
  Download,
  Eye,
  FileIcon,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  UploadCloud,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrl } from '@/lib/env';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteAttachment,
  useStorageUsage,
  useUploadAttachment,
  useWorkOrderAttachments,
} from '../_hooks/use-work-orders';
import type { AttachmentResDto } from '../_api/api.types';

interface AttachmentsPanelProps {
  workOrderId: string;
  isTechnician: boolean;
  isAssignedToMe: boolean;
  currentUserId?: string;
  isOwner?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
        <ImageIcon className="size-5" />
      </div>
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
        <FileText className="size-5" />
      </div>
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <FileIcon className="size-5" />
    </div>
  );
}

export function AttachmentsPanel({
  workOrderId,
  isTechnician,
  isAssignedToMe,
  currentUserId,
  isOwner,
}: AttachmentsPanelProps) {
  const { data: attachments, isLoading } = useWorkOrderAttachments(workOrderId);
  const { data: storageUsage } = useStorageUsage();
  const uploadMutation = useUploadAttachment();
  const deleteMutation = useDeleteAttachment();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = React.useState<AttachmentResDto | null>(null);
  const [attachmentToPreview, setAttachmentToPreview] = React.useState<AttachmentResDto | null>(null);

  const canUpload = !isTechnician || isAssignedToMe;

  const handleFileUpload = async (file: File) => {
    // Client-side quick check (check MIME type and filename extension fallback)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isAllowedExt = ext && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);

    if (file.type ? !allowedTypes.includes(file.type) : !isAllowedExt) {
      toast.error('Only JPEG, PNG, WebP, and PDF files are permitted.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size cannot exceed 10 MB.');
      return;
    }

    if (storageUsage && storageUsage.remainingBytes < file.size) {
      toast.error('Storage quota exceeded. Please upgrade or delete old files.');
      return;
    }

    const uploadPromise = uploadMutation.mutateAsync({
      workOrderId,
      file,
    });

    toast.promise(uploadPromise, {
      loading: `Uploading ${file.name}...`,
      success: `Uploaded ${file.name}`,
      error: (err: unknown) => {
        return err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Failed to upload attachment';
      },
    });

    try {
      await uploadPromise;
    } catch {
      // Handled by toast.promise error callback
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
    // Reset file input so identical file can be selected again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canUpload) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  const confirmDelete = async () => {
    if (!attachmentToDelete) return;
    try {
      await deleteMutation.mutateAsync({
        workOrderId,
        attachmentId: attachmentToDelete.id,
      });
      toast.success('Attachment deleted');
      setAttachmentToDelete(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Failed to delete attachment';
      toast.error(msg);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Attachments & Photos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Documents, equipment manuals, and completion photos (PDF, JPEG, PNG, WebP up to 10 MB).
        </p>
      </div>

      {storageUsage && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              Storage: {storageUsage.percentageUsed}%
            </span>
            <span className="text-muted-foreground">
              {formatBytes(storageUsage.usedBytes)} of {formatBytes(storageUsage.quotaBytes)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                storageUsage.percentageUsed >= 95
                  ? 'bg-destructive'
                  : storageUsage.percentageUsed >= 85
                    ? 'bg-amber-500'
                    : 'bg-primary'
              }`}
              style={{
                width: `${Math.min(100, Math.max(storageUsage.usedBytes > 0 ? 1 : 0, storageUsage.percentageUsed))}%`,
              }}
            />
          </div>
        </div>
      )}

      {storageUsage && storageUsage.percentageUsed >= 85 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Storage quota warning: Organisation has consumed {storageUsage.percentageUsed}% of its storage quota.
          </span>
        </div>
      )}

      {/* Upload Dropzone */}
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border/80 hover:border-primary/50 hover:bg-muted/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={onFileChange}
            className="hidden"
          />
          {uploadMutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Verifying and uploading file...</span>
            </div>
          ) : (
            <>
              <UploadCloud className="size-6 text-muted-foreground" />
              <div className="text-xs">
                <span className="font-semibold text-foreground">Click to upload</span> or drag and drop
              </div>
              <p className="text-[11px] text-muted-foreground">
                Max 10 MB per file. Magic-byte verified.
              </p>
            </>
          )}
        </div>
      )}

      {/* Attachments List */}
      <div className="space-y-2 pt-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : !attachments || attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No attachments or photos uploaded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {attachments.map((att) => {
              const canDelete = isOwner || att.uploaderId === currentUserId;
              const downloadUrl = `${getApiUrl()}/api/v1/work-orders/${workOrderId}/attachments/${att.id}`;

              return (
                <div
                  key={att.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm"
                >
                  {/* Top: Icon, File Details & Delete Button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {getFileIcon(att.mimeType)}
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold text-foreground text-sm leading-snug break-words"
                          title={att.originalFileName}
                        >
                          {att.originalFileName}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <FileIcon className="size-3.5 shrink-0" />
                            {formatBytes(att.byteSize)}
                          </span>
                          <span className="text-border">|</span>
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3.5 shrink-0" />
                            Uploaded by {att.uploaderName}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3.5 shrink-0" />
                          <span>{new Date(att.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 hover:text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 dark:hover:bg-rose-500/25"
                        onClick={() => setAttachmentToDelete(att)}
                        disabled={deleteMutation.isPending}
                        title="Delete attachment"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    )}
                  </div>

                  {/* Bottom: Separator & Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-border/70 grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary font-medium text-xs flex items-center justify-center gap-2"
                      onClick={() => setAttachmentToPreview(att)}
                      title="Preview file"
                    >
                      <Eye className="size-4" />
                      <span>Preview</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-lg border-border hover:bg-muted/50 font-medium text-xs flex items-center justify-center gap-2"
                      asChild
                      title="Download file"
                    >
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
                        <Download className="size-4" />
                        <span>Download</span>
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog
        open={Boolean(attachmentToPreview)}
        onOpenChange={(open) => {
          if (!open) setAttachmentToPreview(null);
        }}
        contentClassName="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-5"
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {attachmentToPreview?.originalFileName}
          </DialogTitle>
          <DialogDescription>
            {attachmentToPreview ? formatBytes(attachmentToPreview.byteSize) : ''} •{' '}
            {attachmentToPreview?.mimeType}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[300px] max-h-[68vh] overflow-auto rounded-lg border border-border bg-muted/20 flex items-center justify-center p-2">
          {attachmentToPreview && (
            (() => {
              const previewUrl = `${getApiUrl()}/api/v1/work-orders/${workOrderId}/attachments/${attachmentToPreview.id}`;
              if (attachmentToPreview.mimeType.startsWith('image/')) {
                return (
                  /* eslint-disable-next-line @next/next/no-img-element -- Dynamic binary stream authenticated via backend session cookie */
                  <img
                    src={previewUrl}
                    alt={attachmentToPreview.originalFileName}
                    className="max-h-[64vh] max-w-full object-contain rounded"
                  />
                );
              }
              if (attachmentToPreview.mimeType === 'application/pdf') {
                return (
                  <iframe
                    src={previewUrl}
                    title={attachmentToPreview.originalFileName}
                    className="w-full h-[64vh] rounded border-0"
                  />
                );
              }
              return (
                <div className="text-center p-6 text-sm text-muted-foreground">
                  Preview is not available for this file format.{' '}
                  <a
                    href={previewUrl}
                    download
                    className="text-primary underline font-medium"
                  >
                    Download to view
                  </a>
                </div>
              );
            })()
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttachmentToPreview(null)}
          >
            Close
          </Button>
          {attachmentToPreview && (
            <Button
              type="button"
              variant="default"
              asChild
            >
              <a
                href={`${getApiUrl()}/api/v1/work-orders/${workOrderId}/attachments/${attachmentToPreview.id}`}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                <Download className="size-4 mr-1.5" />
                Download
              </a>
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Confirmation Dialog for Deletion */}
      <Dialog
        open={Boolean(attachmentToDelete)}
        onOpenChange={(open) => {
          if (!open) setAttachmentToDelete(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete Attachment</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete &quot;{attachmentToDelete?.originalFileName}&quot;?
            This will remove the file from storage and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttachmentToDelete(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}

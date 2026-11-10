import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../domain/errors/index.js';

// Multer memory storage with 10MB limit
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file limit
  },
});

export const uploadSingleFile = upload.single('file');

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

/**
 * Inspect the first bytes of a file buffer to detect the true format,
 * completely independent of client MIME headers or filename extensions.
 */
export function detectMimeTypeFromMagicBytes(buffer: Buffer): SupportedMimeType | null {
  if (!buffer || buffer.length < 3) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  return null;
}

/**
 * Sanitizes original filenames to prevent path traversal and shell injection.
 */
export function sanitizeFilename(originalFilename: string): string {
  const base = path.basename(originalFilename).replace(/\0/g, '');
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.replace(/^\.+/, '') || 'attachment';
}

/**
 * Maps MIME type to safe file extension.
 */
export function getExtensionForMime(mime: SupportedMimeType): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'application/pdf':
      return '.pdf';
  }
}

/**
 * Express middleware that inspects the uploaded file's magic bytes.
 * Rejects executables, scripts, or spoofed extensions with 400 Bad Request.
 */
export function validateMagicBytes(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    return next(
      new BadRequestError(
        'No file was uploaded. Please provide a file in the "file" form field.',
        'MISSING_FILE'
      )
    );
  }

  const detectedMime = detectMimeTypeFromMagicBytes(req.file.buffer);
  if (!detectedMime) {
    return next(
      new BadRequestError(
        'Unsupported file type. Only JPEG, PNG, and PDF are allowed.',
        'INVALID_FILE_TYPE'
      )
    );
  }

  (req as any).validatedMimeType = detectedMime;
  (req as any).sanitizedFilename = sanitizeFilename(req.file.originalname);

  next();
}


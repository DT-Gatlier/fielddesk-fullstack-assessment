import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import 'multer';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

/**
 * Sniffs the magic bytes of a file buffer to verify true MIME type
 * and protect against extension/MIME spoofing.
 */
export function detectMimeTypeFromBuffer(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length < 4) {
    return null;
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // PNG: \x89PNG\r\n\x1a\n (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP (0x52 0x49 0x46 0x46 .... 0x57 0x45 0x42 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateUploadedFile(file: Express.Multer.File): {
  validatedMimeType: AllowedMimeType;
  byteSize: number;
  originalFileName: string;
  contentHash: string;
} {
  if (!file || !file.buffer) {
    throw new BadRequestException('No file uploaded or file buffer is empty');
  }

  if (file.buffer.length === 0) {
    throw new BadRequestException('Empty file cannot be uploaded');
  }

  if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new BadRequestException(
      `File size exceeds maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
    );
  }

  const detectedMime = detectMimeTypeFromBuffer(file.buffer);
  if (!detectedMime) {
    throw new BadRequestException(
      'Invalid file format. Only JPEG, PNG, WebP, and PDF files are allowed.',
    );
  }

  // Sanitize filename to prevent header injection or control characters (including null bytes)
  const rawName = file.originalname || 'attachment';
  const noControlChars = Array.from(rawName)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');

  const sanitizedFileName = noControlChars
    .replace(/[^\w\s.-]/gi, '_')
    .trim()
    .slice(0, 255);

  const contentHash = createHash('sha256').update(file.buffer).digest('hex');

  return {
    validatedMimeType: detectedMime,
    byteSize: file.buffer.length,
    originalFileName: sanitizedFileName || 'attachment',
    contentHash,
  };
}

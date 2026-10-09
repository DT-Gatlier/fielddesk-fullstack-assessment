import { BadRequestException } from '@nestjs/common';
import 'multer';
import {
  detectMimeTypeFromBuffer,
  validateUploadedFile,
} from './file-validator';

describe('file-validator', () => {
  const dummyBuffer = (bytes: number[]): Buffer => Buffer.from(bytes);

  describe('detectMimeTypeFromBuffer', () => {
    it('detects PDF format (%PDF-)', () => {
      const buf = dummyBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(detectMimeTypeFromBuffer(buf)).toBe('application/pdf');
    });

    it('detects PNG format (\\x89PNG\\r\\n\\x1a\\n)', () => {
      const buf = dummyBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      expect(detectMimeTypeFromBuffer(buf)).toBe('image/png');
    });

    it('detects JPEG format (\\xFF\\xD8\\xFF)', () => {
      const buf = dummyBuffer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectMimeTypeFromBuffer(buf)).toBe('image/jpeg');
    });

    it('detects WEBP format (RIFF....WEBP)', () => {
      const buf = dummyBuffer([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectMimeTypeFromBuffer(buf)).toBe('image/webp');
    });

    it('rejects executable / script / random bytes', () => {
      const exeBuf = dummyBuffer([0x4d, 0x5a, 0x90, 0x00]); // MZ executable
      expect(detectMimeTypeFromBuffer(exeBuf)).toBeNull();

      const textBuf = Buffer.from('<script>alert(1)</script>');
      expect(detectMimeTypeFromBuffer(textBuf)).toBeNull();
    });
  });

  describe('validateUploadedFile', () => {
    it('throws BadRequestException when file buffer is missing or empty', () => {
      expect(() =>
        validateUploadedFile({ buffer: Buffer.alloc(0) } as Express.Multer.File),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when file size exceeds 10 MiB', () => {
      const largeBuf = Buffer.alloc(10 * 1024 * 1024 + 1);
      expect(() =>
        validateUploadedFile({
          buffer: largeBuf,
          originalname: 'large.pdf',
        } as Express.Multer.File),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when file magic bytes are spoofed', () => {
      const spoofed = Buffer.from('malicious payload disguised as pdf');
      expect(() =>
        validateUploadedFile({
          buffer: spoofed,
          originalname: 'malware.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File),
      ).toThrow(BadRequestException);
    });

    it('sanitizes malicious filenames and returns validated metadata', () => {
      const validPdf = dummyBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const res = validateUploadedFile({
        buffer: validPdf,
        originalname: '../../../etc/passwd.pdf',
      } as Express.Multer.File);

      expect(res.validatedMimeType).toBe('application/pdf');
      expect(res.byteSize).toBe(validPdf.length);
      expect(res.originalFileName).not.toContain('/');
      expect(res.originalFileName).not.toContain('\\');
      expect(res.contentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

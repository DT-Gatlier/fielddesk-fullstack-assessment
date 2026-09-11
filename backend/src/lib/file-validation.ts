import type { AllowedMimeType } from "../types/attachment.js";

const ALLOWED: Record<AllowedMimeType, { ext: string; magic: (buf: Buffer) => boolean }> = {
  "image/jpeg": {
    ext: "jpg",
    magic: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    magic: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  "application/pdf": {
    ext: "pdf",
    magic: (buf) => buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF",
  },
};

export function detectAllowedMimeType(buffer: Buffer): AllowedMimeType | null {
  for (const [mime, rule] of Object.entries(ALLOWED) as [AllowedMimeType, (typeof ALLOWED)[AllowedMimeType]][]) {
    if (rule.magic(buffer)) {
      return mime;
    }
  }
  return null;
}

export function extensionForMimeType(mimeType: AllowedMimeType): string {
  return ALLOWED[mimeType].ext;
}

export function sanitiseOriginalFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() ?? "attachment";
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "attachment";
}

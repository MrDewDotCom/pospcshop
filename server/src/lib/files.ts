// Uploaded images are stored by content hash (sha256): uploads/ab/abcdef….jpg.
// The same image uploaded twice is stored once. Files are never modified after they're written,
// which keeps backups and browser caching simple.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { UploadedFile } from '@pcshop/shared';
import type { AppDatabase } from '../db/client';
import { files } from '../db/schema';
import { badRequest } from './errors';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b: Buffer) =>
      b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
] as const;

/** Identifies an image by its first bytes ("magic numbers"); the file name and browser type are ignored. */
export function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length < 12) return null;
  const type = IMAGE_TYPES.find((t) => t.matches(buffer));
  return type ? { mime: type.mime, ext: type.ext } : null;
}

export function fileUrls(row: { path: string; thumbPath: string | null }) {
  return {
    url: `/uploads/${row.path}`,
    thumbUrl: row.thumbPath ? `/uploads/${row.thumbPath}` : `/uploads/${row.path}`,
  };
}

export function toUploadedFile(row: typeof files.$inferSelect): UploadedFile {
  return {
    id: row.id,
    ...fileUrls(row),
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
  };
}

export interface StoreImageInput {
  image: Buffer;
  thumb?: Buffer;
  width?: number;
  height?: number;
  userId: number;
}

/** Validates and saves an image (+ optional thumbnail). Returns the existing row for duplicates. */
export function storeImage(
  db: AppDatabase,
  uploadsDir: string,
  input: StoreImageInput,
): UploadedFile {
  const type = detectImageType(input.image);
  if (!type) {
    throw badRequest('UNSUPPORTED_FILE', 'รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP เท่านั้น');
  }
  const thumbType = input.thumb ? detectImageType(input.thumb) : null;
  if (input.thumb && !thumbType) {
    throw badRequest('UNSUPPORTED_FILE', 'รูปย่อไม่ถูกต้อง');
  }

  const sha256 = createHash('sha256').update(input.image).digest('hex');
  const existing = db.select().from(files).where(eq(files.sha256, sha256)).get();
  if (existing) return toUploadedFile(existing);

  const dir = sha256.slice(0, 2);
  const relPath = `${dir}/${sha256}.${type.ext}`;
  const relThumb = thumbType ? `${dir}/${sha256}_t.${thumbType.ext}` : null;
  fs.mkdirSync(path.join(uploadsDir, dir), { recursive: true });
  // Write to a temporary name first, then rename, so a crash never leaves a half-written file.
  const write = (rel: string, data: Buffer) => {
    const target = path.join(uploadsDir, rel);
    fs.writeFileSync(`${target}.tmp`, data);
    fs.renameSync(`${target}.tmp`, target);
  };
  write(relPath, input.image);
  if (relThumb && input.thumb) write(relThumb, input.thumb);

  const row = db
    .insert(files)
    .values({
      sha256,
      path: relPath,
      thumbPath: relThumb,
      mime: type.mime,
      sizeBytes: input.image.length,
      width: input.width ?? null,
      height: input.height ?? null,
      createdBy: input.userId,
    })
    .returning()
    .get();
  return toUploadedFile(row);
}

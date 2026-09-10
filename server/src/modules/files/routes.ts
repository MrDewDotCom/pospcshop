import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { UploadedFile } from '@pcshop/shared';
import { AppError, badRequest } from '../../lib/errors';
import { MAX_IMAGE_BYTES, storeImage } from '../../lib/files';

const positiveInt = (value: string | undefined) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : undefined;
};

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  const uploadsDir = app.paths?.uploadsDir;
  if (!uploadsDir) return; // no data directory (some unit tests): uploads are disabled

  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 5, fieldSize: 100 },
  });

  /**
   * multipart/form-data with `image` (required, already resized by the browser), optional `thumb`,
   * and optional `width`/`height` fields.
   */
  app.post('/api/files', async (request, reply): Promise<UploadedFile> => {
    if (!request.isMultipart()) throw badRequest('NOT_MULTIPART', 'กรุณาเลือกไฟล์รูป');
    let image: Buffer | undefined;
    let thumb: Buffer | undefined;
    const fields: Record<string, string> = {};

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          if (part.fieldname === 'image') image = buffer;
          else if (part.fieldname === 'thumb') thumb = buffer;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError(413, 'FILE_TOO_LARGE', 'ไฟล์รูปใหญ่เกินไป (ไม่เกิน 5 MB)');
      }
      throw error;
    }

    if (!image) throw badRequest('NO_IMAGE', 'กรุณาเลือกไฟล์รูป');
    const stored = storeImage(app.database.db, uploadsDir, {
      image,
      thumb,
      width: positiveInt(fields.width),
      height: positiveInt(fields.height),
      userId: request.user!.id,
    });
    return reply.code(201).send(stored);
  });

  // Uploaded files: login required (enforced by the auth hook for /uploads/*). The names are content
  // hashes, so a file never changes and browsers may cache it forever.
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    dotfiles: 'deny',
    cacheControl: false,
    setHeaders: (reply) => reply.header('Cache-Control', 'private, max-age=31536000, immutable'),
  });
}

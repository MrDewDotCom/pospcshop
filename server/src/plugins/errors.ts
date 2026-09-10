import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@pcshop/shared';
import { AppError, RequestValidationError } from '../lib/errors';

/** Turns every error into the standard `{ error: { code, message, details? } }` shape. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const send = (status: number, body: ApiErrorBody['error']) =>
      reply.code(status).send({ error: body } satisfies ApiErrorBody);

    if (error instanceof AppError) {
      return send(error.statusCode, {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      });
    }

    if (error instanceof RequestValidationError) {
      return send(400, {
        code: 'VALIDATION_ERROR',
        message: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
        details: { part: error.part, issues: error.issues },
      });
    }

    const statusCode = 'statusCode' in error ? error.statusCode : undefined;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      // Fastify's own client errors, e.g. malformed JSON or a body that is too large.
      return send(statusCode, {
        code: 'code' in error && error.code ? error.code : 'BAD_REQUEST',
        message: 'คำขอไม่ถูกต้อง',
      });
    }

    request.log.error(error);
    return send(500, {
      code: 'INTERNAL_ERROR',
      message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
    });
  });
}

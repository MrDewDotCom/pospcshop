// Application errors. Messages are Thai because the web app shows them to users as-is.

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Thrown by the Zod validator compiler when a request body/query/params fails validation. */
export class RequestValidationError extends Error {
  constructor(
    readonly issues: ValidationIssue[],
    readonly part: string,
  ) {
    super('Request validation failed');
    this.name = 'RequestValidationError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (code = 'UNAUTHORIZED', message = 'กรุณาเข้าสู่ระบบก่อนใช้งาน') =>
  new AppError(401, code, message);

export const forbidden = (code = 'FORBIDDEN', message = 'คุณไม่มีสิทธิ์ทำรายการนี้') =>
  new AppError(403, code, message);

export const notFound = (message = 'ไม่พบข้อมูลที่ต้องการ', code = 'NOT_FOUND') =>
  new AppError(404, code, message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new AppError(429, 'TOO_MANY_ATTEMPTS', message, { retryAfterSeconds });

// Thin fetch wrapper for our API: JSON in/out, session cookie, CSRF header, and typed errors whose
// `message` is Thai text from the server that can be shown to the user directly.

import type { ApiErrorBody } from '@pcshop/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        // FormData sets its own multipart Content-Type (with the boundary).
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        // Required by the server on every state-changing request (CSRF guard).
        ...(method !== 'GET' && { 'X-PCShop': '1' }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่าเครื่องหลักของร้านเปิดอยู่',
    );
  }

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const error = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
};

/** `?a=1&b=x` from a query object, skipping undefined and empty values. */
export function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Field-level issues from a VALIDATION_ERROR response, keyed by dotted path ("owner.username"). */
export function validationIssues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const issues = (error.details as { issues?: { path: string; message: string }[] } | undefined)
    ?.issues;
  return Object.fromEntries((issues ?? []).map((issue) => [issue.path, issue.message]));
}

/** A Thai message for any error, for toasts and alerts. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

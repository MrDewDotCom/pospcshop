import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('health endpoint', async () => {
  const app = await createTestApp();
  afterAll(() => app.close());

  it('reports ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('returns a JSON 404 with a Thai message for unknown API routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลที่ต้องการ' } });
  });
});

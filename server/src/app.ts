import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { APP_NAME, APP_VERSION } from '@pcshop/shared';
import type { DataPaths } from './config';
import type { DatabaseManager } from './db/client';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseManager;
    /** Data directory layout. Undefined in tests that don't touch the file system. */
    paths: DataPaths | undefined;
  }
}

export interface AppOptions {
  database: DatabaseManager;
  paths?: DataPaths;
  /** Absolute path to the built web app (web/dist). When null, the frontend is served by Vite (dev). */
  webDistDir?: string | null;
  logger?: boolean;
}

export interface StartOptions extends AppOptions {
  host?: string;
  port?: number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.decorate('database', options.database);
  app.decorate('paths', options.paths);

  app.get('/api/health', async () => ({ ok: true, name: APP_NAME, version: APP_VERSION }));

  const webDistDir = options.webDistDir;
  if (webDistDir && fs.existsSync(path.join(webDistDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDistDir, wildcard: false });
  }

  // Unknown API routes get a JSON 404; any other path falls back to the SPA so client-side routing works.
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/') || request.url.startsWith('/uploads/');
    if (isApi || !webDistDir || request.method !== 'GET') {
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลที่ต้องการ' } });
    }
    return reply.sendFile('index.html');
  });

  return app;
}

/** Entry point shared by the CLI (main.ts) and, later, the Electron main process. */
export async function startServer(options: StartOptions): Promise<FastifyInstance> {
  const app = await buildApp(options);
  await app.listen({ host: options.host ?? '0.0.0.0', port: options.port ?? 3300 });
  return app;
}

import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { APP_NAME, APP_VERSION } from '@pcshop/shared';
import type { DataPaths } from './config';
import type { DatabaseManager } from './db/client';
import { plainJsonSerializerCompiler, zodValidatorCompiler } from './lib/zod';
import { auditRoutes } from './modules/audit/routes';
import { authRoutes } from './modules/auth/routes';
import { categoryRoutes } from './modules/categories/routes';
import { fileRoutes } from './modules/files/routes';
import { goodsReceiptRoutes } from './modules/goods-receipts/routes';
import { productRoutes } from './modules/products/routes';
import { serialRoutes } from './modules/serials/routes';
import { settingsRoutes } from './modules/settings/routes';
import { setupRoutes } from './modules/setup/routes';
import { stockRoutes } from './modules/stock/routes';
import { supplierRoutes } from './modules/suppliers/routes';
import { systemRoutes } from './modules/system/routes';
import { tagRoutes } from './modules/tags/routes';
import { userRoutes } from './modules/users/routes';
import { ensureDefaultSequences } from './services/numbering.service';
import { findStockMismatches } from './services/stock.service';
import { authPlugin } from './plugins/auth';
import { registerErrorHandler } from './plugins/errors';

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
  ensureDefaultSequences(options.database.db);

  app.setValidatorCompiler(zodValidatorCompiler);
  app.setSerializerCompiler(plainJsonSerializerCompiler);
  registerErrorHandler(app);
  // Called directly (not app.register) so its hooks apply to every route in the app.
  await authPlugin(app);

  app.get('/api/health', { config: { public: true } }, async () => ({
    ok: true,
    name: APP_NAME,
    version: APP_VERSION,
  }));
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(auditRoutes);
  await app.register(settingsRoutes);
  await app.register(systemRoutes);
  await app.register(fileRoutes);
  await app.register(categoryRoutes);
  await app.register(tagRoutes);
  await app.register(productRoutes);
  await app.register(supplierRoutes);
  await app.register(goodsReceiptRoutes);
  await app.register(stockRoutes);
  await app.register(serialRoutes);

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
  // The on_hand cache must agree with the ledger (PLAN.md §5 step 4). A mismatch means a bug or a
  // manual DB edit; the owner can see details at GET /api/stock/integrity.
  const mismatches = findStockMismatches(options.database.db);
  if (mismatches.length > 0) {
    app.log.warn(
      { mismatches },
      `Stock integrity: ${mismatches.length} product(s) disagree with the ledger`,
    );
  }
  await app.listen({ host: options.host ?? '0.0.0.0', port: options.port ?? 3300 });
  return app;
}

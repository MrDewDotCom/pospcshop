import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { APP_NAME, APP_VERSION, type Permission } from '@pcshop/shared';
import type { DataPaths } from './config';
import type { DatabaseManager } from './db/client';
import { plainJsonSerializerCompiler, zodValidatorCompiler } from './lib/zod';
import { auditRoutes } from './modules/audit/routes';
import { backupRoutes } from './modules/backups/routes';
import { authRoutes } from './modules/auth/routes';
import { categoryRoutes } from './modules/categories/routes';
import { customerRoutes } from './modules/customers/routes';
import { fileRoutes } from './modules/files/routes';
import { goodsReceiptRoutes } from './modules/goods-receipts/routes';
import { productRoutes } from './modules/products/routes';
import { saleRoutes } from './modules/sales/routes';
import { seedRoutes } from './modules/seed/routes';
import { serialRoutes } from './modules/serials/routes';
import { settingsRoutes } from './modules/settings/routes';
import { setupRoutes } from './modules/setup/routes';
import { stockRoutes } from './modules/stock/routes';
import { supplierRoutes } from './modules/suppliers/routes';
import { systemRoutes } from './modules/system/routes';
import { tagRoutes } from './modules/tags/routes';
import { userRoutes } from './modules/users/routes';
import { startBackupScheduler } from './services/backup.service';
import { ensureDefaultSequences } from './services/numbering.service';
import { findStockMismatches } from './services/stock.service';
import { authPlugin, permissionOf } from './plugins/auth';
import { registerErrorHandler } from './plugins/errors';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseManager;
    /** Data directory layout. Undefined in tests that don't touch the file system. */
    paths: DataPaths | undefined;
    /** Every registered route; the security tests walk it (no cost leak, no money write). */
    routeTable: RegisteredRoute[];
    /** Set while a restore swaps the database; API requests get 503 meanwhile. */
    maintenance: { reason: string | null };
  }
}

export interface RegisteredRoute {
  method: string;
  url: string;
  /** Permissions checked by route-level requirePermission() preHandlers. */
  permissions: Permission[];
  /** The Zod body schema, if the route validates one. */
  bodySchema: unknown;
  isPublic: boolean;
}

export interface AppOptions {
  database: DatabaseManager;
  paths?: DataPaths;
  /** Absolute path to the built web app (web/dist). When null, the frontend is served by Vite (dev). */
  webDistDir?: string | null;
  /** true = console (dev). `{ file }` writes to the data directory's log file (production). */
  logger?: boolean | { level?: string; file?: string };
}

export interface StartOptions extends AppOptions {
  host?: string;
  port?: number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.decorate('database', options.database);
  app.decorate('paths', options.paths);
  app.decorate('routeTable', [] as RegisteredRoute[]);
  app.addHook('onRoute', (route) => {
    const preHandlers = [route.preHandler ?? []].flat();
    for (const method of [route.method].flat()) {
      app.routeTable.push({
        method,
        url: route.url,
        permissions: preHandlers.map(permissionOf).filter((p): p is Permission => p !== null),
        bodySchema: route.schema?.body,
        isPublic: route.config?.public === true,
      });
    }
  });
  ensureDefaultSequences(options.database.db);

  app.setValidatorCompiler(zodValidatorCompiler);
  app.setSerializerCompiler(plainJsonSerializerCompiler);
  registerErrorHandler(app);

  // While a restore swaps the database file, every other API request waits outside.
  app.decorate('maintenance', { reason: null as string | null });
  app.addHook('onRequest', async (request, reply) => {
    if (
      app.maintenance.reason &&
      request.url.startsWith('/api/') &&
      request.url !== '/api/health'
    ) {
      return reply.code(503).send({
        error: { code: 'MAINTENANCE', message: 'ระบบกำลังกู้คืนข้อมูล กรุณารอสักครู่แล้วลองใหม่' },
      });
    }
  });
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
  await app.register(backupRoutes);
  await app.register(seedRoutes);
  await app.register(customerRoutes);
  await app.register(saleRoutes);

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
  if (options.paths) {
    const stopScheduler = startBackupScheduler(app, {
      database: options.database,
      paths: options.paths,
    });
    app.addHook('onClose', async () => stopScheduler());
  }
  await app.listen({ host: options.host ?? '0.0.0.0', port: options.port ?? 3300 });
  return app;
}

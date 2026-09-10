import path from 'node:path';
import { startServer } from './app';
import { dataPaths, ensureDataDirs, readFileConfig, resolveDataDir, resolvePort } from './config';
import { DatabaseManager } from './db/client';

// Replaced with true by the production build (scripts/build.mjs).
declare const __PRODUCTION__: boolean | undefined;
const isProduction = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;

// Dev runs from server/src (tsx); production runs from the bundle in server/dist.
// Both are one level below server/, so ../drizzle is the migrations folder in either case.
const migrationsFolder = path.resolve(import.meta.dirname, '../drizzle');
const webDistDir = isProduction ? path.resolve(import.meta.dirname, '../../web/dist') : null;
const devRoot = path.resolve(import.meta.dirname, '../..');

try {
  const paths = dataPaths(resolveDataDir({ isProduction, devRoot }));
  ensureDataDirs(paths);
  const database = new DatabaseManager(paths.dbFile, migrationsFolder);

  const app = await startServer({
    database,
    paths,
    port: resolvePort(readFileConfig(paths)),
    webDistDir,
    logger: true,
  });
  app.log.info(`Data directory: ${paths.root}`);

  // Close cleanly on Ctrl+C so SQLite checkpoints the WAL into shop.db.
  const shutdown = async () => {
    await app.close();
    database.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(error);
  process.exit(1);
}

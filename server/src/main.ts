import path from 'node:path';
import { startServer } from './app';
import { dataPaths, ensureDataDirs, readFileConfig, resolveDataDir, resolvePort } from './config';
import { DatabaseManager } from './db/client';
import { openDailyLogFile } from './lib/logFile';
import { backupBeforeMigrations } from './services/backup.service';

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
  // An app update may bring migrations: back up the existing data before they run (PLAN P9).
  const preMigrationBackup = await backupBeforeMigrations(paths, migrationsFolder);
  if (preMigrationBackup) {
    console.log(`Backed up before database migrations: ${preMigrationBackup}`);
  }
  const database = new DatabaseManager(paths.dbFile, migrationsFolder);

  // Production has no console to watch (and none at all once Electron wraps it in Phase 7).
  const logFile = isProduction ? openDailyLogFile(paths.logsDir) : null;
  const port = resolvePort(readFileConfig(paths));
  const app = await startServer({
    database,
    paths,
    port,
    webDistDir,
    logger: logFile ? { level: 'info', file: logFile } : true,
  });
  app.log.info(`Data directory: ${paths.root}`);
  // Printed, not logged: once the log goes to a file, this is all the console shows.
  console.log(`PC Shop Manager is running: http://localhost:${port}`);
  console.log(`Data directory: ${paths.root}`);
  if (logFile) console.log(`Log file: ${logFile}`);

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

// Runtime configuration. Shop data (DB, images, backups) always lives in a data directory that is
// separate from the application folder, so updating the app never touches it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_DATA_FOLDER_NAME = 'PCShopManager';
export const DEFAULT_PORT = 3300;

export interface DataPaths {
  root: string;
  dbFile: string;
  uploadsDir: string;
  backupsDir: string;
  logsDir: string;
  configFile: string;
  backupStateFile: string;
}

/**
 * Resolves the data directory:
 * 1. PCSHOP_DATA_DIR env var (used by tests and, later, Electron)
 * 2. production: %APPDATA%\PCShopManager (the same folder Electron's userData will use)
 * 3. development: <repo>/data
 */
export function resolveDataDir(options: { isProduction: boolean; devRoot: string }): string {
  const fromEnv = process.env.PCSHOP_DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  if (!options.isProduction) return path.resolve(options.devRoot, 'data');
  const appData =
    process.env.APPDATA ??
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(appData, APP_DATA_FOLDER_NAME);
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    dbFile: path.join(root, 'shop.db'),
    uploadsDir: path.join(root, 'uploads'),
    backupsDir: path.join(root, 'backups'),
    logsDir: path.join(root, 'logs'),
    configFile: path.join(root, 'config.json'),
    backupStateFile: path.join(root, 'backup-state.json'),
  };
}

/** Creates the data directory and its sub-folders if they don't exist yet. */
export function ensureDataDirs(paths: DataPaths): void {
  for (const dir of [paths.root, paths.uploadsDir, paths.backupsDir, paths.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface FileConfig {
  port?: number;
}

/** Reads the optional config.json in the data directory. A missing or broken file means defaults. */
export function readFileConfig(paths: DataPaths): FileConfig {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      const port = (parsed as Record<string, unknown>).port;
      return typeof port === 'number' && Number.isInteger(port) ? { port } : {};
    }
  } catch {
    // no config file (the normal case) or unreadable JSON: fall back to defaults
  }
  return {};
}

/** Port precedence: PORT env var → config.json → 3300. */
export function resolvePort(fileConfig: FileConfig): number {
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return fileConfig.port ?? DEFAULT_PORT;
}

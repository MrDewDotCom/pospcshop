import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PORT,
  dataPaths,
  ensureDataDirs,
  readFileConfig,
  resolveDataDir,
  resolvePort,
} from '../src/config';

describe('config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers PCSHOP_DATA_DIR', () => {
    vi.stubEnv('PCSHOP_DATA_DIR', path.join(os.tmpdir(), 'custom-data'));
    expect(resolveDataDir({ isProduction: true, devRoot: '/repo' })).toBe(
      path.join(os.tmpdir(), 'custom-data'),
    );
  });

  it('uses <repo>/data in development and %APPDATA%\\PCShopManager in production', () => {
    vi.stubEnv('PCSHOP_DATA_DIR', '');
    vi.stubEnv('APPDATA', path.join(os.tmpdir(), 'AppData'));
    expect(resolveDataDir({ isProduction: false, devRoot: '/repo' })).toBe(
      path.resolve('/repo', 'data'),
    );
    expect(resolveDataDir({ isProduction: true, devRoot: '/repo' })).toBe(
      path.join(os.tmpdir(), 'AppData', 'PCShopManager'),
    );
  });

  it('creates the data folders and reads an optional config.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-config-'));
    try {
      const paths = dataPaths(root);
      ensureDataDirs(paths);
      expect(fs.existsSync(paths.uploadsDir) && fs.existsSync(paths.backupsDir)).toBe(true);

      expect(readFileConfig(paths)).toEqual({});
      fs.writeFileSync(paths.configFile, JSON.stringify({ port: 4000 }));
      expect(readFileConfig(paths)).toEqual({ port: 4000 });
      fs.writeFileSync(paths.configFile, '{ broken');
      expect(readFileConfig(paths)).toEqual({});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the port: PORT env → config.json → default', () => {
    vi.stubEnv('PORT', '');
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ port: 4000 })).toBe(4000);
    vi.stubEnv('PORT', '5000');
    expect(resolvePort({ port: 4000 })).toBe(5000);
  });
});

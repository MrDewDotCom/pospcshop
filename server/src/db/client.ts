import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: AppDatabase;
}

/** Opens a SQLite database with the pragmas this app relies on. Use ':memory:' in tests. */
export function openDatabase(filename: string): DatabaseHandle {
  const sqlite = new Database(filename);
  if (filename !== ':memory:') {
    // WAL lets readers work while a write is in progress; NORMAL sync is safe with WAL.
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Applies any pending SQL migrations from the drizzle/ folder. */
export function runMigrations(handle: DatabaseHandle, migrationsFolder: string): void {
  migrate(handle.db, { migrationsFolder });
}

/**
 * Holds the current connection. Restore (sub-task 15) must close the database, replace the file, and
 * reopen it, so code always reads `manager.db` at call time instead of keeping its own reference.
 */
export class DatabaseManager {
  #handle: DatabaseHandle;

  constructor(
    private readonly filename: string,
    private readonly migrationsFolder: string,
  ) {
    this.#handle = DatabaseManager.#openAndMigrate(filename, migrationsFolder);
  }

  static #openAndMigrate(filename: string, migrationsFolder: string): DatabaseHandle {
    const handle = openDatabase(filename);
    try {
      runMigrations(handle, migrationsFolder);
    } catch (error) {
      handle.sqlite.close();
      throw error;
    }
    return handle;
  }

  get db(): AppDatabase {
    return this.#handle.db;
  }

  get sqlite(): Database.Database {
    return this.#handle.sqlite;
  }

  get file(): string {
    return this.filename;
  }

  get migrations(): string {
    return this.migrationsFolder;
  }

  /** Closes and reopens the database file (and applies migrations again). */
  reopen(): void {
    this.reopenAfter(() => {});
  }

  /**
   * Closes the database, runs `swap` (e.g. replace the file with a backup), then reopens it and applies
   * pending migrations. Used by restore; nothing may touch the database while `swap` runs.
   */
  reopenAfter(swap: () => void): void {
    this.close();
    try {
      swap();
    } finally {
      this.#handle = DatabaseManager.#openAndMigrate(this.filename, this.migrationsFolder);
    }
  }

  close(): void {
    if (this.#handle.sqlite.open) this.#handle.sqlite.close();
  }
}

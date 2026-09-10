import path from 'node:path';
import { buildApp } from '../src/app';
import { DatabaseManager } from '../src/db/client';

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../drizzle');

/** A fresh, fully migrated in-memory database. */
export function createTestDatabase(): DatabaseManager {
  return new DatabaseManager(':memory:', MIGRATIONS_FOLDER);
}

/** A Fastify app backed by a fresh in-memory database; closing the app closes the database. */
export async function createTestApp() {
  const database = createTestDatabase();
  const app = await buildApp({ database });
  app.addHook('onClose', async () => database.close());
  return app;
}

// Emergency password reset, run on the shop computer:
//   npm run reset-password -- <username>          (development data in ./data)
//   npm run reset-password -- <username> --prod   (installed app data in %APPDATA%\PCShopManager)
// Prints a temporary password, re-activates the account, and signs out all of its sessions.
// PCSHOP_DATA_DIR overrides the data directory, as for the server.

import path from 'node:path';
import { eq } from 'drizzle-orm';
import { dataPaths, resolveDataDir } from '../src/config';
import { DatabaseManager } from '../src/db/client';
import { users } from '../src/db/schema';
import { writeAudit } from '../src/lib/audit';
import { hashPassword } from '../src/lib/password';
import { generateTemporaryPassword } from '../src/lib/tokens';
import { endUserSessions } from '../src/plugins/auth';

const args = process.argv.slice(2);
const username = args
  .find((a) => !a.startsWith('--'))
  ?.trim()
  .toLowerCase();
const isProduction = args.includes('--prod');

if (!username) {
  console.error('Usage: npm run reset-password -- <username> [--prod]');
  process.exit(1);
}

const paths = dataPaths(
  resolveDataDir({ isProduction, devRoot: path.resolve(import.meta.dirname, '../..') }),
);
const database = new DatabaseManager(paths.dbFile, path.resolve(import.meta.dirname, '../drizzle'));

try {
  const user = database.db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    const known = database.db.select({ username: users.username }).from(users).all();
    console.error(`No user "${username}" in ${paths.dbFile}`);
    console.error(`Existing users: ${known.map((u) => u.username).join(', ') || '(none)'}`);
    process.exitCode = 1;
  } else {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    database.db.transaction((tx) => {
      tx.update(users).set({ passwordHash, isActive: true }).where(eq(users.id, user.id)).run();
      endUserSessions(tx, user.id);
      writeAudit(tx, {
        userId: null,
        action: 'auth.cli_reset',
        entityType: 'user',
        entityId: user.id,
      });
    });
    console.log(`Password for "${username}" has been reset.`);
    console.log(`Temporary password: ${temporaryPassword}`);
    console.log('Log in with it, then change it on the "บัญชีของฉัน" page.');
  }
} finally {
  database.close();
}

import { count } from 'drizzle-orm';
import type { SetupInput, SessionUser } from '@pcshop/shared';
import { setupInputSchema } from '@pcshop/shared';
import type { z } from 'zod';
import type { AppDatabase } from '../../db/client';
import { insertDefaultCategories } from '../../db/defaults';
import { shopSettings, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { conflict } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { generateRecoveryCode, normalizeRecoveryCode } from '../../lib/tokens';
import { insertSampleData } from '../seed/service';

export function needsSetup(db: AppDatabase): boolean {
  return db.select({ n: count() }).from(users).get()!.n === 0;
}

export interface SetupResult {
  user: SessionUser;
  recoveryCode: string;
}

type ParsedSetupInput = z.output<typeof setupInputSchema>;

/**
 * Creates the owner account, the shop settings row, the built-in categories and, when asked for, the
 * sample catalogue (PLAN.md Q10). Runs once.
 */
export async function performSetup(
  db: AppDatabase,
  input: ParsedSetupInput | SetupInput,
): Promise<SetupResult> {
  const parsed = setupInputSchema.parse(input);
  // Hash outside the transaction: better-sqlite3 transactions are synchronous (no await inside).
  const passwordHash = await hashPassword(parsed.owner.password);
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashPassword(normalizeRecoveryCode(recoveryCode));

  return db.transaction((tx) => {
    // Checked inside the transaction so two simultaneous setup requests can't both succeed.
    if (tx.select({ n: count() }).from(users).get()!.n > 0) {
      throw conflict('ALREADY_SET_UP', 'ระบบถูกตั้งค่าเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ');
    }

    const owner = tx
      .insert(users)
      .values({
        name: parsed.owner.name,
        username: parsed.owner.username,
        passwordHash,
        role: 'owner',
      })
      .returning({ id: users.id, name: users.name, username: users.username, role: users.role })
      .get();

    tx.insert(shopSettings)
      .values({ id: 1, ...parsed.shop, recoveryCodeHash })
      .run();
    insertDefaultCategories(tx);
    // Same transaction as the rest of the setup: a shop is never left half seeded.
    if (parsed.sampleData) insertSampleData(tx, owner.id);
    writeAudit(tx, {
      userId: owner.id,
      action: 'setup.complete',
      entityType: 'user',
      entityId: owner.id,
    });

    return { user: owner, recoveryCode };
  });
}

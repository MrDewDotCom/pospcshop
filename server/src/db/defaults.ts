// Built-in data created by the first-run setup.

import { CATEGORY_KINDS, CATEGORY_KIND_LABELS } from '@pcshop/shared';
import type { AppDatabase } from './client';
import { categories } from './schema';

type DbOrTx = Pick<AppDatabase, 'insert'>;

/** One system category per kind (CPU, Mainboard, …, Services, Other). Owners can add more later. */
export function insertDefaultCategories(db: DbOrTx): void {
  db.insert(categories)
    .values(
      CATEGORY_KINDS.map((kind, index) => ({
        name: CATEGORY_KIND_LABELS[kind],
        kind,
        sortOrder: (index + 1) * 10,
        isSystem: true,
      })),
    )
    .run();
}

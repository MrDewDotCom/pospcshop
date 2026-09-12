// Loads the sample catalogue into a shop that is already set up, for development and demos:
//   npm run seed                 (development data in ./data)
//   npm run seed -- --prod       (installed app data in %APPDATA%\PCShopManager)
// The first-run wizard can do this too (its "sample data" checkbox); this script is for a shop that
// was set up without it. Stop the server first. PCSHOP_DATA_DIR overrides the data directory.
// Remove the data again from the app: ตั้งค่า → ข้อมูลตัวอย่าง → ลบข้อมูลตัวอย่าง.

import path from 'node:path';
import { eq } from 'drizzle-orm';
import { dataPaths, resolveDataDir } from '../src/config';
import { DatabaseManager } from '../src/db/client';
import { users } from '../src/db/schema';
import { insertSampleData, sampleDataStatus } from '../src/modules/seed/service';

const isProduction = process.argv.slice(2).includes('--prod');
const paths = dataPaths(
  resolveDataDir({ isProduction, devRoot: path.resolve(import.meta.dirname, '../..') }),
);
const database = new DatabaseManager(paths.dbFile, path.resolve(import.meta.dirname, '../drizzle'));

try {
  const owner = database.db.select().from(users).where(eq(users.role, 'owner')).get();
  const status = sampleDataStatus(database.db);
  if (!owner) {
    console.error(`No owner account in ${paths.dbFile}. Run the first-run setup in the app first.`);
    process.exitCode = 1;
  } else if (status.hasSampleData) {
    console.error(
      `Sample data is already there (${status.products} products, ${status.goodsReceipts} goods receipts).`,
    );
    console.error('Clear it in the app first: ตั้งค่า → ข้อมูลตัวอย่าง.');
    process.exitCode = 1;
  } else {
    const counts = database.db.transaction((tx) => insertSampleData(tx, owner.id));
    console.log(`Sample data added to ${paths.dbFile}:`);
    console.log(
      `  ${counts.products} products, ${counts.suppliers} suppliers, ${counts.tags} tags, ${counts.goodsReceipts} goods receipts`,
    );
  }
} finally {
  database.close();
}

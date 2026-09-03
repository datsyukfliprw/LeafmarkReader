import 'dotenv/config';
import { makeDb, runMigration } from './db.js';

const db = makeDb(process.env.DATABASE_URL ?? '');
try {
  await runMigration(db);
  console.log('Database migrated.');
} finally {
  await db.close();
}

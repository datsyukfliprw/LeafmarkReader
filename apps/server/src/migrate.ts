import 'dotenv/config'; import { makeDb,runMigration } from './db.js';
const {sqlite}=makeDb(process.env.DATABASE_PATH ?? './data/leafmark.sqlite'); runMigration(sqlite); console.log('Database migrated.'); sqlite.close();

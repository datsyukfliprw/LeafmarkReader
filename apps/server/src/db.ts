import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

type Queryable = Pool | PoolClient;

export class SqlDatabase {
  constructor(private readonly queryable: Queryable, private readonly pool?: Pool) {}

  async one<T extends QueryResultRow = any>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const result = await this.queryable.query<T>(postgresSql(sql), params);
    return result.rows[0];
  }

  async all<T extends QueryResultRow = any>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.queryable.query<T>(postgresSql(sql), params);
    return result.rows;
  }

  async run(sql: string, ...params: unknown[]) {
    const result = await this.queryable.query(postgresSql(sql), params);
    return { changes: result.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: SqlDatabase) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Nested transactions are not supported.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(new SqlDatabase(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

export function makeDb(databaseUrl: string) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
  return new SqlDatabase(pool, pool);
}

export async function runMigration(db: SqlDatabase) {
  const candidates = [
    path.resolve(process.cwd(), 'database/migrations'),
    path.resolve(process.cwd(), '../../database/migrations'),
  ];
  const dir = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  if (!dir) throw new Error('Migration directory not found');

  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const appliedRows = await db.all<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.name));
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    await db.transaction(async (tx) => {
      await tx.run(sql);
      await tx.run('INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)', name, new Date().toISOString());
    });
  }
}

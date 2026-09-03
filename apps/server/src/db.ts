import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs'; import path from 'node:path'; import * as schema from './schema.js';
export function makeDb(databasePath:string){
  const absolute=path.resolve(databasePath); fs.mkdirSync(path.dirname(absolute),{recursive:true});
  const sqlite=new Database(absolute); sqlite.pragma('journal_mode = WAL'); sqlite.pragma('foreign_keys = ON'); sqlite.pragma('busy_timeout = 5000');
  return {sqlite,db:drizzle(sqlite,{schema})};
}
export function runMigration(sqlite:Database.Database){
  const candidates=[path.resolve(process.cwd(),'database/migrations'),path.resolve(process.cwd(),'../../database/migrations')];
  const dir=candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isDirectory()); if(!dir) throw new Error('Migration directory not found');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied=new Set((sqlite.prepare('SELECT name FROM schema_migrations').all() as {name:string}[]).map(r=>r.name));
  const files=fs.readdirSync(dir).filter(name=>name.endsWith('.sql')).sort();
  for(const name of files){if(applied.has(name))continue;const sql=fs.readFileSync(path.join(dir,name),'utf8');const tx=sqlite.transaction(()=>{sqlite.exec(sql);sqlite.prepare('INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)').run(name,new Date().toISOString())});tx();}
}

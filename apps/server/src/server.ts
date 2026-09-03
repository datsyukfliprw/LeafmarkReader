import 'dotenv/config';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import crypto from 'node:crypto';
import { z } from 'zod';
import { makeDb, runMigration, type SqlDatabase } from './db.js';
import { isValidIsbn, normalizeIsbn, wordCount } from '@leafmark/shared';
import {
  evidenceRegistry,
  selectReadingSkill,
  selectWritingSkill,
  deterministicQuestion,
  deterministicRevision,
} from '@leafmark/pedagogy';
import {
  InstrumentedLearningModel,
  OpenAICompatibleLearningModel,
  ResilientLearningModel,
} from '@leafmark/ai';
import { ReadingSkillSchema, WritingSkillSchema } from '@leafmark/schemas';
import { OpenLibraryProvider } from './metadata.js';

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? '',
  origin: process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4173',
  cookieSecret: process.env.COOKIE_SECRET ?? 'development-only-change-me-development-only',
  parentPin: process.env.PARENT_PIN ?? '2468',
  children: process.env.CHILDREN ?? 'Gavin:1357,Savannah:2468',
  aiBase: process.env.LOCAL_AI_BASE_URL ?? 'http://127.0.0.1:1234/v1',
  aiModel: process.env.LOCAL_AI_MODEL ?? 'Bonsai-27B',
  aiKey: process.env.LOCAL_AI_API_KEY ?? 'local',
  aiTimeout: Number(process.env.AI_TIMEOUT_MS ?? 5000),
  metadataTimeout: Number(process.env.BOOK_METADATA_TIMEOUT_MS ?? 4500),
};

if (process.env.NODE_ENV === 'production') {
  if (!config.databaseUrl) throw new Error('Production requires DATABASE_URL.');
  if (!process.env.COOKIE_SECRET || process.env.COOKIE_SECRET.length < 32 || process.env.COOKIE_SECRET.startsWith('replace-')) {
    throw new Error('Production requires a unique COOKIE_SECRET with at least 32 characters.');
  }
  if (!process.env.PARENT_PIN || process.env.PARENT_PIN.length < 4 || process.env.PARENT_PIN === '2468') {
    throw new Error('Production requires a non-default PARENT_PIN.');
  }
  if (!process.env.CHILDREN || process.env.CHILDREN === 'Gavin:1357,Savannah:2468') {
    throw new Error('Production requires explicit non-default CHILDREN profile/PIN configuration.');
  }
  if (!config.origin.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN or RENDER_EXTERNAL_URL.');
}

export const database = makeDb(config.databaseUrl);
await runMigration(database);
export const now = () => new Date().toISOString();
export const childConfig = new Map(
  config.children
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, ...pin] = entry.split(':');
      return [name!, pin.join(':') || ''] as const;
    }),
);

for (const name of childConfig.keys()) {
  await database.run(
    'INSERT INTO children(name,created_at) VALUES(?,?) ON CONFLICT(name) DO NOTHING',
    name,
    now(),
  );
}

export const metadataProvider = new OpenLibraryProvider(config.metadataTimeout);
const primaryModel = new OpenAICompatibleLearningModel({
  baseUrl: config.aiBase,
  model: config.aiModel,
  apiKey: config.aiKey,
  timeoutMs: config.aiTimeout,
});
const instrumentedModel = new InstrumentedLearningModel(primaryModel, (event) => {
  void database
    .run(
      'INSERT INTO ai_interactions(kind,model,ok,latency_ms,error_code,created_at) VALUES(?,?,?,?,?,?)',
      event.kind,
      config.aiModel,
      event.ok ? 1 : 0,
      event.latencyMs,
      event.error instanceof Error ? event.error.message.slice(0, 80) : null,
      now(),
    )
    .catch(() => undefined);
});
export const model = new ResilientLearningModel(instrumentedModel);

export const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'warn' } });
await app.register(cookie, { secret: config.cookieSecret, hook: 'onRequest' });
await app.register(cors, {
  origin: [config.origin, 'http://127.0.0.1:4173', 'http://localhost:4173'],
  credentials: true,
});

export function constantTimePin(a: string, b: string) {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

type Session = { role: 'child' | 'parent'; childId?: number };
export function session(req: FastifyRequest): Session | null {
  const raw = req.cookies.leafmark_session;
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid) return null;
  const [role, id] = unsigned.value.split(':');
  if (role === 'parent') return { role: 'parent' };
  if (role === 'child' && Number(id)) return { role: 'child', childId: Number(id) };
  return null;
}
export function childSession(req: FastifyRequest) {
  const s = session(req);
  if (!s || s.role !== 'child' || !s.childId) throw Object.assign(new Error('child_auth_required'), { statusCode: 401 });
  return s;
}
export function parentSession(req: FastifyRequest) {
  const s = session(req);
  if (!s || s.role !== 'parent') throw Object.assign(new Error('parent_auth_required'), { statusCode: 401 });
  return s;
}
export function safeError(reply: any, error: any, child = true) {
  const status = Number(error?.statusCode) || 400;
  return reply.code(status).send({
    error: child ? 'Something went sideways. Your work is safe. Please try again.' : 'Request could not be completed.',
    code: process.env.NODE_ENV === 'production' ? undefined : String(error?.message ?? 'unknown'),
  });
}

export async function ownChildBook(childId: number, id: number, db: SqlDatabase = database) {
  return db.one<any>(
    'SELECT cb.*,b.title,b.author,b.cover_url,b.page_count,b.isbn,b.description FROM child_books cb JOIN books b ON b.id=cb.book_id WHERE cb.id=? AND cb.child_id=?',
    id,
    childId,
  );
}
export async function recordMutation(db: SqlDatabase, childId: number, mutationId: string | undefined, kind: string) {
  if (!mutationId) return;
  await db.run(
    'INSERT INTO sync_mutations(child_id,mutation_id,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(child_id,mutation_id) DO NOTHING',
    childId,
    mutationId,
    kind,
    now(),
  );
}
export function safeQuestionOutput(question: string) {
  return question.trim().endsWith('?') && !/(the answer is|correct answer|you should say|remember that|obviously|clearly,? the)/i.test(question);
}
export function safeRevisionOutput(challenge: string) {
  return !/(you could say|try writing|write this|replace it with|here(?:'s| is) a sentence|example answer)/i.test(challenge);
}
export async function compactBookMemory(childBookId: number) {
  const position = await database.one<any>('SELECT current_page,current_chapter,status FROM child_books WHERE id=?', childBookId);
  const recent = await database.all<any>(
    `SELECT j.initial_recall,ca.response,ca.skill
     FROM journal_entries j
     LEFT JOIN comprehension_attempts ca ON ca.journal_id=j.id
     WHERE j.child_book_id=?
     ORDER BY j.created_at DESC LIMIT 3`,
    childBookId,
  );
  return {
    position,
    recentStudentMemory: recent.map((r) => ({
      recall: String(r.initial_recall || '').slice(0, 500),
      response: String(r.response || '').slice(0, 350),
      skill: r.skill || null,
    })),
  };
}
export async function childDashboard(childId: number) {
  const child = await database.one<any>('SELECT id,name FROM children WHERE id=?', childId);
  const current = await database.one<any>(
    `SELECT cb.*,b.title,b.author,b.cover_url,b.page_count,b.isbn,
      (SELECT MAX(end_page) FROM reading_sessions rs WHERE rs.child_book_id=cb.id AND rs.status='complete') AS last_end,
      (SELECT start_page FROM reading_sessions rs WHERE rs.child_book_id=cb.id ORDER BY rs.started_at DESC LIMIT 1) AS last_start
     FROM child_books cb JOIN books b ON b.id=cb.book_id
     WHERE cb.child_id=? AND cb.status='current'
     ORDER BY cb.started_at DESC LIMIT 1`,
    childId,
  );
  const statsRow = await database.one<any>(
    `SELECT
      (SELECT COUNT(*) FROM child_books WHERE child_id=? AND status='completed') AS "booksFinished",
      (SELECT COALESCE(SUM(elapsed_seconds),0) FROM reading_sessions WHERE child_id=? AND status='complete') AS "readingSeconds",
      (SELECT COUNT(*) FROM journal_entries WHERE child_id=?) AS "journalEntries"`,
    childId,
    childId,
    childId,
  );
  const writings = await database.all<any>('SELECT original_writing,revised_writing FROM journal_entries WHERE child_id=?', childId);
  const stats = {
    booksFinished: Number(statsRow?.booksFinished ?? 0),
    readingSeconds: Number(statsRow?.readingSeconds ?? 0),
    journalEntries: Number(statsRow?.journalEntries ?? 0),
    wordsWritten: writings.reduce((n, j) => n + wordCount(j.revised_writing || j.original_writing), 0),
  };
  return {
    child,
    current: current ? { ...current, pickupPage: current.current_page ?? (current.last_end ? Number(current.last_end) + 1 : 1) } : null,
    stats,
  };
}

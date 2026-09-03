import 'dotenv/config';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
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

const config = {
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

const database = makeDb(config.databaseUrl);
await runMigration(database);
const now = () => new Date().toISOString();
const childConfig = new Map(
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

const metadataProvider = new OpenLibraryProvider(config.metadataTimeout);
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
const model = new ResilientLearningModel(instrumentedModel);

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'warn' } });
await app.register(cookie, { secret: config.cookieSecret, hook: 'onRequest' });
await app.register(cors, {
  origin: [config.origin, 'http://127.0.0.1:4173', 'http://localhost:4173'],
  credentials: true,
});

function constantTimePin(a: string, b: string) {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

type Session = { role: 'child' | 'parent'; childId?: number };
function session(req: FastifyRequest): Session | null {
  const raw = req.cookies.leafmark_session;
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid) return null;
  const [role, id] = unsigned.value.split(':');
  if (role === 'parent') return { role: 'parent' };
  if (role === 'child' && Number(id)) return { role: 'child', childId: Number(id) };
  return null;
}
function childSession(req: FastifyRequest) {
  const s = session(req);
  if (!s || s.role !== 'child' || !s.childId) throw Object.assign(new Error('child_auth_required'), { statusCode: 401 });
  return s;
}
function parentSession(req: FastifyRequest) {
  const s = session(req);
  if (!s || s.role !== 'parent') throw Object.assign(new Error('parent_auth_required'), { statusCode: 401 });
  return s;
}
function safeError(reply: any, error: any, child = true) {
  const status = Number(error?.statusCode) || 400;
  return reply.code(status).send({
    error: child ? 'Something went sideways. Your work is safe. Please try again.' : 'Request could not be completed.',
    code: process.env.NODE_ENV === 'production' ? undefined : String(error?.message ?? 'unknown'),
  });
}

async function ownChildBook(childId: number, id: number, db: SqlDatabase = database) {
  return db.one<any>(
    'SELECT cb.*,b.title,b.author,b.cover_url,b.page_count,b.isbn,b.description FROM child_books cb JOIN books b ON b.id=cb.book_id WHERE cb.id=? AND cb.child_id=?',
    id,
    childId,
  );
}
async function recordMutation(db: SqlDatabase, childId: number, mutationId: string | undefined, kind: string) {
  if (!mutationId) return;
  await db.run(
    'INSERT INTO sync_mutations(child_id,mutation_id,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(child_id,mutation_id) DO NOTHING',
    childId,
    mutationId,
    kind,
    now(),
  );
}
function safeQuestionOutput(question: string) {
  return question.trim().endsWith('?') && !/(the answer is|correct answer|you should say|remember that|obviously|clearly,? the)/i.test(question);
}
function safeRevisionOutput(challenge: string) {
  return !/(you could say|try writing|write this|replace it with|here(?:'s| is) a sentence|example answer)/i.test(challenge);
}
async function compactBookMemory(childBookId: number) {
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
async function childDashboard(childId: number) {
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

app.get('/health', async () => {
  await database.one('SELECT 1 AS ok');
  return { ok: true, service: 'leafmark', model: config.aiModel, database: 'postgres' };
});
app.get('/api/children', async () => ({ children: await database.all('SELECT id,name FROM children ORDER BY id') }));
app.post('/api/auth/child', async (req, reply) => {
  try {
    const body = z.object({ childId: z.number().int().positive(), pin: z.string().max(16) }).parse(req.body);
    const child = await database.one<any>('SELECT id,name FROM children WHERE id=?', body.childId);
    if (!child) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    const expected = childConfig.get(child.name) ?? '';
    if (expected && !constantTimePin(body.pin, expected)) throw Object.assign(new Error('bad_pin'), { statusCode: 401 });
    reply.setCookie('leafmark_session', `child:${child.id}`, {
      path: '/', httpOnly: true, sameSite: 'strict', signed: true,
      secure: process.env.NODE_ENV === 'production' && config.origin.startsWith('https:'), maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, child: { id: child.id, name: child.name } };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/auth/parent', async (req, reply) => {
  try {
    const body = z.object({ pin: z.string().min(4).max(32) }).parse(req.body);
    if (!constantTimePin(body.pin, config.parentPin)) throw Object.assign(new Error('bad_pin'), { statusCode: 401 });
    reply.setCookie('leafmark_session', 'parent', {
      path: '/', httpOnly: true, sameSite: 'strict', signed: true,
      secure: process.env.NODE_ENV === 'production' && config.origin.startsWith('https:'), maxAge: 60 * 60 * 8,
    });
    return { ok: true };
  } catch (e) { return safeError(reply, e, false); }
});
app.post('/api/auth/logout', async (_req, reply) => { reply.clearCookie('leafmark_session', { path: '/' }); return { ok: true }; });
app.get('/api/auth/me', async (req) => ({ session: session(req) }));

app.get('/api/dashboard', async (req, reply) => {
  try { const s = childSession(req); return await childDashboard(s.childId!); }
  catch (e) { return safeError(reply, e); }
});
app.get('/api/books', async (req, reply) => {
  try {
    const s = childSession(req);
    const rows = await database.all(
      `SELECT cb.*,b.title,b.author,b.cover_url,b.page_count,b.isbn,b.description,b.publisher,b.publication_date
       FROM child_books cb JOIN books b ON b.id=cb.book_id
       WHERE cb.child_id=?
       ORDER BY CASE cb.status WHEN 'current' THEN 0 ELSE 1 END, COALESCE(cb.completed_at,cb.started_at) DESC`,
      s.childId,
    );
    return { books: rows };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/books/lookup', async (req, reply) => {
  try {
    childSession(req);
    const body = z.object({ isbn: z.string().min(9).max(32) }).parse(req.body);
    const isbn = normalizeIsbn(body.isbn);
    if (!isValidIsbn(isbn)) return reply.code(422).send({ error: 'That ISBN does not look quite right. Check the number on your book and try again.', invalidIsbn: true });
    const cached = await database.one<any>('SELECT payload_json FROM metadata_cache WHERE isrn=?', isbn);
    if (cached) return { book: JSON.parse(cached.payload_json), cached: true };
    let book;
    try { book = await metadataProvider.lookup(isbn); }
    catch { return { book: null, manualFallback: true, lookupUnavailable: true }; }
    if (!book) return { book: null, manualFallback: true };
    await database.run(
      `INSERT INTO metadata_cache(isbn,payload_json,source,cached_at) VALUES(?,?,?,?)
       ON CONFLICT(isbn) DO UPDATE SET payload_json=EXCLUDED.payload_json,source=EXCLUDED.source,cached_at=EXCLUDED.cached_at`,
      isbn, JSON.stringify(book), book.source, now(),
    );
    return { book, cached: false };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/books', async (req, reply) => {
  try {
    const s = childSession(req);
    const body = z.object({
      isbn: z.string(), title: z.string().min(1).max(240), author: z.string().max(240).optional().nullable(),
      edition: z.string().max(100).optional().nullable(), publisher: z.string().max(180).optional().nullable(),
      publicationDate: z.string().max(80).optional().nullable(), pageCount: z.number().int().positive().max(10000).optional().nullable(),
      description: z.string().max(3000).optional().nullable(), coverUrl: z.string().url().optional().nullable(),
      source: z.string().max(80).default('Manual'),
    }).parse(req.body);
    const isbn = normalizeIsbn(body.isbn);
    if (!isValidIsbn(isbn)) return reply.code(422).send({ error: 'Please check the ISBN and try again.' });
    const childBookId = await database.transaction(async (tx) => {
      const book = await tx.one<any>(
        `INSERT INTO books(isbn,title,author,edition,publisher,publication_date,page_count,description,cover_url,source,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(\Ø›Š
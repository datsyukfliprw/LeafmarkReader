import { z } from 'zod';
import { isValidIsbn, normalizeIsbn } from '@leafmark/shared';
import {
  app, database, config, childConfig, metadataProvider, now,
  constantTimePin, session, childSession, safeError, childDashboard,
  ownChildBook, recordMutation,
} from './server.js';

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
    const cached = await database.one<any>('SELECT payload_json FROM metadata_cache WHERE isbn=?', isbn);
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
         ON CONFLICT(isbn) DO UPDATE SET title=EXCLUDED.title,author=EXCLUDED.author,
           edition=COALESCE(EXCLUDED.edition,books.edition),publisher=COALESCE(EXCLUDED.publisher,books.publisher),
           publication_date=COALESCE(EXCLUDED.publication_date,books.publication_date),page_count=COALESCE(EXCLUDED.page_count,books.page_count),
           description=COALESCE(EXCLUDED.description,books.description),cover_url=COALESCE(EXCLUDED.cover_url,books.cover_url)
         RETURNING id`,
        isbn, body.title, body.author || 'Unknown author', body.edition ?? null, body.publisher ?? null,
        body.publicationDate ?? null, body.pageCount ?? null, body.description ?? null, body.coverUrl ?? null, body.source, now(),
      );
      const childBook = await tx.one<any>(
        `INSERT INTO child_books(child_id,book_id,status,current_page,started_at) VALUES(?,?,'current',1,?)
         ON CONFLICT(child_id,book_id) DO UPDATE SET status='current',completed_at=NULL
         RETURNING id`,
        s.childId, book!.id, now(),
      );
      return Number(childBook!.id);
    });
    return { ok: true, childBookId };
  } catch (e) { return safeError(reply, e); }
});
app.get('/api/books/:id', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const book = await ownChildBook(s.childId!, id);
    if (!book) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    const journals = await database.all(
      `SELECT j.id,j.created_at,j.initial_recall,j.original_writing,j.revised_writing,j.revision_prompt,j.writing_skill,
        rs.start_page,rs.end_page,rs.start_chapter,rs.end_chapter,rs.elapsed_seconds,
        ca.skill AS comprehension_skill,ca.question,ca.response AS comprehension_response
       FROM journal_entries j JOIN reading_sessions rs ON rs.id=j.session_id
       LEFT JOIN comprehension_attempts ca ON ca.journal_id=j.id
       WHERE j.child_book_id=? ORDER BY j.created_at DESC`, id,
    );
    return { book, journals };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/books/:id/complete', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    if (!await ownChildBook(s.childId!, id)) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    await database.run("UPDATE child_books SET status='completed',completed_at=? WHERE id=? AND child_id=?", now(), id, s.childId);
    return { ok: true };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/books/:id/location', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const owned = await ownChildBook(s.childId!, id);
    if (!owned) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    const body = z.object({ page: z.number().int().positive().max(10000).optional().nullable(), chapter: z.string().trim().max(80).optional().nullable() })
      .refine((v) => Boolean(v.page) !== Boolean(v.chapter), { message: 'choose_page_or_chapter' }).parse(req.body);
    if (body.page && owned.page_count && body.page > owned.page_count) return reply.code(422).send({ error: `That book has ${owned.page_count} pages. Check your saved page and try again.` });
    await database.run('UPDATE child_books SET current_page=?,current_chapter=? WHERE id=? AND child_id=?', body.page ?? null, body.chapter || null, id, s.childId);
    return { ok: true, book: await ownChildBook(s.childId!, id) };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/books/:id/reopen', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    if (!await ownChildBook(s.childId!, id)) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    await database.run("UPDATE child_books SET status='current',completed_at=NULL,current_page=1,current_chapter=NULL,started_at=? WHERE id=? AND child_id=?", now(), id, s.childId);
    return { ok: true };
  } catch (e) { return safeError(reply, e); }
});

app.post('/api/books/:id/sessions', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const book = await ownChildBook(s.childId!, id);
    if (!book) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    const body = z.object({ clientId: z.string().uuid(), startPage: z.number().int().positive().optional().nullable(), startChapter: z.string().max(80).optional().nullable() }).parse(req.body);
    await database.run(
      `INSERT INTO reading_sessions(client_id,child_id,child_book_id,started_at,start_page,start_chapter,status)
       VALUES(?,?,?,?,?,?,'reading') ON CONFLICT(child_id,client_id) DO NOTHING`,
      body.clientId, s.childId, id, now(), body.startPage ?? book.current_page ?? 1, body.startChapter ?? book.current_chapter ?? null,
    );
    return { session: await database.one('SELECT * FROM reading_sessions WHERE child_id=? AND client_id=?', s.childId, body.clientId) };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/sessions/:id/finish-reading', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const body = z.object({
      endPage: z.number().int().positive().optional().nullable(), endChapter: z.string().trim().max(80).optional().nullable(),
      elapsedSeconds: z.number().int().min(1).max(86400), mutationId: z.string().uuid().optional(),
    }).refine((v) => Boolean(v.endPage) !== Boolean(v.endChapter), { message: 'choose_page_or_chapter' }).parse(req.body);
    const rs = await database.one<any>('SELECT * FROM reading_sessions WHERE id=? AND child_id=?', id, s.childId);
    if (!rs) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    if (rs.status !== 'reading') return { session: rs, duplicate: true };
    await database.run(
      "UPDATE reading_sessions SET end_page=?,end_chapter=?,elapsed_seconds=?,ended_at=?,status='writing' WHERE id=?",
      body.endPage ?? null, body.endChapter ?? null, body.elapsedSeconds, now(), id,
    );
    await recordMutation(database, s.childId!, body.mutationId, 'finish-reading');
    return { session: await database.one('SELECT * FROM reading_sessions WHERE id=?', id) };
  } catch (e) { return safeError(reply, e); }
});

import { z } from 'zod';
import { ReadingSkillSchema, WritingSkillSchema } from '@leafmark/schemas';
import {
  evidenceRegistry, selectReadingSkill, selectWritingSkill,
  deterministicQuestion, deterministicRevision,
} from '@leafmark/pedagogy';
import {
  app, database, model, now, childSession, parentSession, safeError,
  recordMutation, safeQuestionOutput, safeRevisionOutput, compactBookMemory, childDashboard,
} from './server.js';

app.post('/api/sessions/:id/recall', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const body = z.object({ recall: z.string().trim().min(3).max(8000), mutationId: z.string().uuid().optional() }).parse(req.body);
    const rs = await database.one<any>("SELECT * FROM reading_sessions WHERE id=? AND child_id=? AND status IN ('writing','complete')", id, s.childId);
    if (!rs) throw Object.assign(new Error('finish_reading_first'), { statusCode: 409 });
    const created = now();
    await database.run(
      `INSERT INTO journal_entries(session_id,child_id,child_book_id,initial_recall,original_writing,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id) DO NOTHING`,
      id, s.childId, rs.child_book_id, body.recall, body.recall, created, created,
    );
    const j = await database.one<any>('SELECT * FROM journal_entries WHERE session_id=?', id);
    const existingQuestion = await database.one<any>(
      'SELECT skill,difficulty,question,requires_text_evidence AS "requiresTextEvidence" FROM comprehension_attempts WHERE journal_id=?', j!.id,
    );
    if (existingQuestion) return { journal: j, question: { ...existingQuestion, requiresTextEvidence: !!existingQuestion.requiresTextEvidence }, duplicate: true };
    const obs = await database.all<any>(
      "SELECT skill,level,observed_at AS \"observedAt\" FROM skill_observations WHERE child_id=? AND domain='reading' ORDER BY observed_at", s.childId,
    );
    const countRow = await database.one<any>('SELECT COUNT(*) AS c FROM journal_entries WHERE child_id=?', s.childId);
    const choice = selectReadingSkill(obs, Number(countRow?.c ?? 1) - 1);
    const memory = await compactBookMemory(rs.child_book_id);
    const priorContext = memory.recentStudentMemory.slice(1, 3).map((m: any) => `Previously practiced skill: ${m.skill || 'unclassified'}`);
    let q = await model.generateQuestion({ skill: choice.skill, difficulty: choice.difficulty, recall: body.recall, priorContext });
    if (q.skill !== choice.skill || !safeQuestionOutput(q.question)) q = { ...deterministicQuestion(choice.skill, choice.difficulty), difficulty: choice.difficulty } as any;
    await database.run(
      `INSERT INTO comprehension_attempts(journal_id,skill,difficulty,question,requires_text_evidence,created_at)
       VALUES(?,?,?,?,?,?) ON CONFLICT(journal_id) DO NOTHING`,
      j!.id, choice.skill, choice.difficulty, q.question, q.requiresTextEvidence ? 1 : 0, created,
    );
    await recordMutation(database, s.childId!, body.mutationId, 'recall');
    return { journal: j, question: { skill: choice.skill, difficulty: choice.difficulty, question: q.question, requiresTextEvidence: q.requiresTextEvidence }, evidenceId: choice.evidence.id };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/sessions/:id/comprehension', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const body = z.object({ response: z.string().trim().min(1).max(6000), mutationId: z.string().uuid().optional() }).parse(req.body);
    const j = await database.one<any>(
      'SELECT j.*,rs.child_id FROM journal_entries j JOIN reading_sessions rs ON rs.id=j.session_id WHERE j.session_id=? AND rs.child_id=?', id, s.childId,
    );
    if (!j) throw Object.assign(new Error('recall_required'), { statusCode: 409 });
    const ca = await database.one<any>('SELECT * FROM comprehension_attempts WHERE journal_id=?', j.id);
    if (!ca) throw Object.assign(new Error('question_required'), { statusCode: 409 });
    if (ca.response && j.revision_prompt && j.writing_skill) return { revisionPrompt: j.revision_prompt, writingSkill: j.writing_skill, duplicate: true };
    const skill = ReadingSkillSchema.parse(ca.skill);
    const evaluation = await model.evaluateResponse({ skill, question: ca.question, response: body.response, recall: j.initial_recall });
    await database.run(
      'UPDATE comprehension_attempts SET response=?,level=?,evidence_present=?,observations_json=? WHERE id=?',
      body.response, evaluation.demonstrated, evaluation.evidencePresent ? 1 : 0, JSON.stringify(evaluation.observations), ca.id,
    );
    await database.run(
      'INSERT INTO skill_observations(child_id,domain,skill,level,source_id,observed_at) VALUES(?,?,?,?,?,?)',
      s.childId, 'reading', skill, evaluation.demonstrated, ca.id, now(),
    );
    const writing = selectWritingSkill(j.original_writing);
    let revision = await model.generateRevisionPrompt({ skill: writing.skill, original: j.original_writing, comprehensionResponse: body.response });
    if (revision.skill !== writing.skill || !safeRevisionOutput(revision.challenge)) revision = deterministicRevision(writing.skill) as any;
    await database.run(
      'UPDATE journal_entries SET revision_prompt=?,writing_skill=?,support_level=?,updated_at=? WHERE id=?',
      revision.challenge, writing.skill, 'one_question_one_revision_prompt', now(), j.id,
    );
    await recordMutation(database, s.childId!, body.mutationId, 'comprehension');
    return { evaluation, revisionPrompt: revision.challenge, writingSkill: writing.skill };
  } catch (e) { return safeError(reply, e); }
});
app.post('/api/sessions/:id/revision', async (req, reply) => {
  try {
    const s = childSession(req); const id = Number((req.params as any).id);
    const body = z.object({ revised: z.string().trim().min(1).max(8000), mutationId: z.string().uuid().optional() }).parse(req.body);
    const j = await database.one<any>(
      `SELECT j.*,rs.end_page,rs.end_chapter,rs.child_book_id,rs.status AS session_status
       FROM journal_entries j JOIN reading_sessions rs ON rs.id=j.session_id
       WHERE j.session_id=? AND rs.child_id=?`, id, s.childId,
    );
    if (!j?.revision_prompt || !j?.writing_skill) throw Object.assign(new Error('revision_prompt_required'), { statusCode: 409 });
    if (j.revised_writing && j.session_status === 'complete') return { ok: true, journalId: j.id, duplicate: true };
    const created = now();
    await database.transaction(async (tx) => {
      await tx.run(
        'INSERT INTO journal_revisions(journal_id,original_text,revised_text,prompt,skill,created_at) VALUES(?,?,?,?,?,?)',
        j.id, j.original_writing, body.revised, j.revision_prompt, j.writing_skill, created,
      );
      await tx.run('UPDATE journal_entries SET revised_writing=?,updated_at=? WHERE id=?', body.revised, created, j.id);
      await tx.run("UPDATE reading_sessions SET status='complete' WHERE id=?", id);
      if (j.end_page) await tx.run('UPDATE child_books SET current_page=?,current_chapter=NULL WHERE id=? AND child_id=?', Number(j.end_page) + 1, j.child_book_id, s.childId);
      else if (j.end_chapter) await tx.run('UPDATE child_books SET current_chapter=?,current_page=NULL WHERE id=? AND child_id=?', j.end_chapter, j.child_book_id, s.childId);
      const changed = body.revised.trim() !== j.original_writing.trim();
      const level = changed ? 'practicing' : 'developing';
      await tx.run(
        'INSERT INTO skill_observations(child_id,domain,skill,level,source_id,observed_at) VALUES(?,?,?,?,?,?)',
        s.childId, 'writing', WritingSkillSchema.parse(j.writing_skill), level, j.id, created,
      );
      await recordMutation(tx, s.childId!, body.mutationId, 'revision');
    });
    return { ok: true, journalId: j.id, dashboard: await childDashboard(s.childId!) };
  } catch (e) { return safeError(reply, e); }
});

app.get('/api/journey', async (req, reply) => {
  try {
    const s = childSession(req); const d = await childDashboard(s.childId!);
    const longest = Number((await database.one<any>("SELECT MAX(COALESCE(b.page_count,0)) AS n FROM child_books cb JOIN books b ON b.id=cb.book_id WHERE cb.child_id=? AND cb.status='completed'", s.childId))?.n ?? 0);
    const revisionCount = Number((await database.one<any>('SELECT COUNT(*) AS c FROM journal_revisions jr JOIN journal_entries j ON j.id=jr.journal_id WHERE j.child_id=?', s.childId))?.c ?? 0);
    const evidenceCount = Number((await database.one<any>("SELECT COUNT(*) AS c FROM comprehension_attempts ca JOIN journal_entries j ON j.id=ca.journal_id WHERE j.child_id=? AND ca.evidence_present=1", s.childId))?.c ?? 0);
    const milestones = [
      ['First book finished', d.stats.booksFinished >= 1], ['10 journal entries', d.stats.journalEntries >= 10],
      ['10,000 words written', d.stats.wordsWritten >= 10000], ['25 hours reading', d.stats.readingSeconds >= 90000],
      ['First 200-page book', longest >= 200], ['10 purposeful revisions', revisionCount >= 10],
      ['10 answers supported with evidence', evidenceCount >= 10],
    ].map(([label, earned]) => ({ label, earned }));
    return { stats: d.stats, milestones };
  } catch (e) { return safeError(reply, e); }
});

app.get('/api/parent/overview', async (req, reply) => {
  try {
    parentSession(req);
    const fallback = await database.one<any>('SELECT id FROM children ORDER BY id LIMIT 1');
    const childId = Number((req.query as any)?.childId) || Number(fallback?.id);
    const d = await childDashboard(childId);
    const observations = await database.all('SELECT domain,skill,level,observed_at FROM skill_observations WHERE child_id=? ORDER BY observed_at DESC LIMIT 120', childId);
    const recentSessions = await database.all(
      `SELECT rs.started_at,rs.elapsed_seconds,rs.start_page,rs.end_page,b.title
       FROM reading_sessions rs JOIN child_books cb ON cb.id=rs.child_book_id JOIN books b ON b.id=cb.book_id
       WHERE rs.child_id=? AND rs.status='complete' ORDER BY rs.started_at DESC LIMIT 30`, childId,
    );
    return { ...d, observations, recentSessions };
  } catch (e) { return safeError(reply, e, false); }
});
app.get('/api/parent/evidence', async (req, reply) => {
  try { parentSession(req); return { evidence: evidenceRegistry }; }
  catch (e) { return safeError(reply, e, false); }
});
app.get('/api/parent/summary', async (req, reply) => {
  try {
    parentSession(req);
    const childId = Number((req.query as any)?.childId);
    if (!childId) throw new Error('childId_required');
    const d = await childDashboard(childId);
    const grouped = await database.all(
      'SELECT domain,skill,level,COUNT(*) AS count FROM skill_observations WHERE child_id=? GROUP BY domain,skill,level ORDER BY domain,skill', childId,
    );
    return await model.generateParentSummary({ structuredFacts: { childName: d.child?.name, stats: d.stats, skillObservations: grouped } });
  } catch (e) { return safeError(reply, e, false); }
});

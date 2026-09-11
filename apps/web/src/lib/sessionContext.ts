type SessionContext = { book: unknown; session: { id: string }; startedAtClientMs: number };

export async function persistSessionContext(
  context: SessionContext,
  storage: Pick<Storage, 'setItem'>,
  persistDraft: (key: string, value: unknown) => Promise<unknown>,
) {
  try { storage.setItem(`leafmark-session-${context.session.id}`, JSON.stringify(context)); } catch {}
  try { await persistDraft(`session-${context.session.id}`, { stage: 'reading', ...context }); } catch {}
}

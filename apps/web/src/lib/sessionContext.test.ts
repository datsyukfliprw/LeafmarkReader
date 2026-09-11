import { describe, expect, it, vi } from 'vitest';
import { persistSessionContext } from './sessionContext';

describe('persistSessionContext', () => {
  it('does not turn browser-storage failures into session-start failures', async () => {
    const context = { book: {}, session: { id: 'session-1' }, startedAtClientMs: 123 };
    const storage = { setItem: vi.fn(() => { throw new Error('storage disabled'); }) };
    const persistDraft = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    await expect(persistSessionContext(context, storage, persistDraft)).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(persistDraft).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('sendMessage conversation context', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends conversation messages separately from session recent queries', async () => {
    window.localStorage.setItem(
      'pivota_recent_queries_v1:user:user_123',
      JSON.stringify(['tom ford fragarance']),
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: [],
        metadata: {},
      }),
    );

    const { sendMessage } = await import('./api');
    await sendMessage('fragrance', undefined, {
      userId: 'user_123',
      conversationId: 'conv_1',
      conversationMessages: [
        { id: '1', role: 'user', content: 'tom ford fragarance', timestamp: '2026-05-10T00:00:00Z' },
        { id: '2', role: 'assistant', content: 'I found Tom Ford fragrance options.' },
        { id: '3', role: 'user', content: 'fragrance', timestamp: '2026-05-10T00:01:00Z' },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body || '{}'));
    expect(body.payload.user).toEqual(
      expect.objectContaining({
        id: 'user_123',
        conversation_id: 'conv_1',
        session_recent_queries: ['tom ford fragarance'],
      }),
    );
    expect(body.payload.user.recent_queries).toBeUndefined();
    expect(body.payload.messages).toEqual([
      { id: '1', role: 'user', content: 'tom ford fragarance', timestamp: '2026-05-10T00:00:00Z' },
      { id: '2', role: 'assistant', content: 'I found Tom Ford fragrance options.' },
      { id: '3', role: 'user', content: 'fragrance', timestamp: '2026-05-10T00:01:00Z' },
    ]);
  });
});

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

  it('preserves PDP-style Money prices through the chat search result path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: [
          {
            product_id: 'knight_unicorn_satin_blush',
            merchant_id: 'merchant_1',
            title: 'Knight Unicorn Satin Blush',
            image_url: 'https://example.com/knight-unicorn.png',
            price: { current: { amount: 24, currency: 'USD' } },
          },
        ],
        metadata: {},
      }),
    );

    const { sendMessage } = await import('./api');
    const result = await sendMessage('knight unicorn');

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      title: 'Knight Unicorn Satin Blush',
      price: 24,
      currency: 'USD',
    });
  });

  it('retains alternate compact-search price fields instead of returning $0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: [
          {
            product_id: 'price_amount_search_card',
            merchant_id: 'merchant_1',
            title: 'Price Amount Search Card',
            image_url: 'https://example.com/price-amount.png',
            price: 0,
            price_amount: '1,299.50',
            price_currency: 'EUR',
          },
        ],
        metadata: {},
      }),
    );

    const { sendMessage } = await import('./api');
    const result = await sendMessage('price amount search card');

    expect(result.products[0]).toMatchObject({ price: 1299.5, currency: 'EUR' });
  });

  it('does not hide useful cards while an older gateway rolls out the price contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: [
          {
            product_id: 'unpriced_search_card',
            merchant_id: 'merchant_1',
            title: 'Unpriced Search Card',
            image_url: 'https://example.com/unpriced.png',
            price: 0,
            currency: 'USD',
          },
        ],
        metadata: {},
      }),
    );

    const { sendMessage } = await import('./api');
    const result = await sendMessage('unpriced search card');

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ title: 'Unpriced Search Card', price: 0 });
  });

  it('honors the gateway price contract when it is declared', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        products: [
          {
            product_id: 'unpriced_search_card',
            merchant_id: 'merchant_1',
            title: 'Unpriced Search Card',
            image_url: 'https://example.com/unpriced.png',
            price: 0,
            currency: 'USD',
          },
        ],
        metadata: { price_contract: { canonical_price_or_offer_required: true } },
      }),
    );

    const { sendMessage } = await import('./api');
    const result = await sendMessage('unpriced search card');

    expect(result.products).toEqual([]);
  });
});

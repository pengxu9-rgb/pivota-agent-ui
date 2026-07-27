import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One path, one product, constant-time secret, fail-closed when unconfigured.
// The interesting assertions here are the NEGATIVE ones: this route's failure
// modes are "purges more than one page" (a self-inflicted crawl collapse across
// ~4,400 ISR URLs) and "opens when it should not".

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const post = async (
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> => {
  const { POST } = await import('@/app/api/revalidate/route');
  const res = await POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as any,
  );
  return { status: res.status, json: await res.json() };
};

describe('/api/revalidate', () => {
  beforeEach(() => {
    vi.resetModules();
    revalidatePath.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is INERT, not open, when the secret is unconfigured', async () => {
    // An unconfigured deploy must be a well-behaved 503 — never a fallback to
    // "allow". A door that cannot verify should not open at all.
    const res = await post({ product_id: 'sig_abc' });
    expect(res.status).toBe(503);
    expect(res.json.error).toBe('REVALIDATE_NOT_CONFIGURED');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret, and revalidates nothing', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'wrong-horse' });
    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a secret that is a PREFIX of the real one', async () => {
    // The reason for the constant-time compare: a prefix must not read as
    // "closer" than any other wrong answer, and must certainly not pass.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'correct' });
    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts the secret via header or bearer, and purges exactly one path', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');

    const viaHeader = await post(
      { product_id: 'sig_1b4d53ca07835e10cdaada553bc26ed6' },
      { 'x-revalidate-secret': 'correct-horse' },
    );
    expect(viaHeader.status).toBe(200);
    expect(viaHeader.json.revalidated).toBe(true);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/products/sig_1b4d53ca07835e10cdaada553bc26ed6');

    revalidatePath.mockClear();
    const viaBearer = await post(
      { product_id: 'ck_abc123' },
      { authorization: 'Bearer correct-horse' },
    );
    expect(viaBearer.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/products/ck_abc123');
  });

  it('CANNOT be talked into purging the whole route', async () => {
    // The blast radius has to be capped by construction. `revalidatePath('/products')`
    // would drop ~4,400 ISR entries and hand every crawler a cold 2-3s SSR — the
    // crawl collapse this codebase already fixed once.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');

    for (const productId of [
      '',
      '   ',
      '..',
      '../products',
      'sig_a/../..',
      'sig_a/sig_b',
      '/products',
      '*',
      'sig_a b',
      'sig_a\n/products',
      'sig_' + 'x'.repeat(200),
    ]) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${JSON.stringify(productId)} must be rejected`).toBe(400);
      expect(revalidatePath, `${JSON.stringify(productId)} must purge nothing`).not.toHaveBeenCalled();
    }
  });

  it('survives a malformed body without purging anything', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const { POST } = await import('@/app/api/revalidate/route');
    const res = await POST(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': 'correct-horse' },
        body: 'not json',
      }) as any,
    );
    expect(res.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts the real id shapes this catalog actually uses', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of [
      'sig_1b4d53ca07835e10cdaada553bc26ed6',
      'ck_b7723c989bd87616de0c310ee63efa48',
      'pg_abc123',
      'ext_krave_gbr_45',
      'mintree:bc2bb213984257bc',
      'rejuran:healer-turnover-ampoule',
    ]) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${productId} must be accepted`).toBe(200);
      expect(revalidatePath).toHaveBeenCalledWith(`/products/${productId}`);
    }
  });
});

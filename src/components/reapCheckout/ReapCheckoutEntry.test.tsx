import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ReapCheckoutEntryProps,
  useReapCheckoutEntry,
  __resetReapConfigCacheForTests,
  offerIsDeclinedByPurchasabilityGate,
  resolveMerchantDomain,
} from './ReapCheckoutEntry';

const STORE = 'https://judydoll.com/products/silky-matte-lip-ink?variant=49819267301653';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetReapConfigCacheForTests();
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ enabled: true, merchants: [{ domain: 'judydoll.com', market: 'US' }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The hook's CTA, rendered the way the PDP purchase bar renders it.
function Harness(props: ReapCheckoutEntryProps) {
  const { cta, sheet } = useReapCheckoutEntry(props);
  return (
    <>
      {cta ? (
        <button type="button" data-testid="reap-entry-button" onClick={cta.onOpen}>
          Buy with Reap
        </button>
      ) : null}
      {sheet}
    </>
  );
}

function renderEntry(props: Partial<ReapCheckoutEntryProps> = {}) {
  return render(
    <Harness
      productId="sig_6433c8107859a484fb72d14861e84690"
      productTitle="Silky Matte Lip Ink"
      storeUrl={STORE}
      storeLabel="Judydoll"
      isExternalPurchase
      {...props}
    />,
  );
}

describe('ReapCheckoutEntry', () => {
  it('flag OFF (default): renders nothing and makes no request', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '');
    const { container } = renderEntry();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag on, demo merchant: shows "Buy with Reap"', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    renderEntry();
    expect((await screen.findByTestId('reap-entry-button')).textContent).toMatch(/Buy with Reap/);
    expect(fetchMock).toHaveBeenCalledWith('/api/reap-checkout/config', expect.anything());
  });

  it('flag on, server switch off (config 404): renders nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    fetchMock.mockResolvedValue(new Response('{"error":"not_found"}', { status: 404 }));
    const { container } = renderEntry();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe('');
  });

  it('not for a merchant outside the demo, a native checkout, or a gate-declined offer', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAP_CHECKOUT_DEMO', '1');
    const a = renderEntry({ storeUrl: 'https://flowerbeauty.com/products/x' });
    const b = renderEntry({ isExternalPurchase: false });
    const c = renderEntry({ offer: { execution_spec: { rail: 'referral', tracking: { join_mode: 'referral_only' } } } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(a.container.innerHTML).toBe('');
    expect(b.container.innerHTML).toBe('');
    expect(c.container.innerHTML).toBe('');
  });

  it('merchant domain: explicit field first, else the store URL host, www. folded', () => {
    expect(resolveMerchantDomain({ offer: { merchant_domain: 'WWW.JSMBeauty.sg' } })).toBe('jsmbeauty.sg');
    expect(resolveMerchantDomain({ storeUrl: 'https://www.judydoll.com/p' })).toBe('judydoll.com');
    expect(resolveMerchantDomain({ storeUrl: 'https://api.pivota.cc/r?token=x' })).toBe('api.pivota.cc');
    expect(offerIsDeclinedByPurchasabilityGate({ execution_spec: { rail: 'cart' } })).toBe(false);
  });
});

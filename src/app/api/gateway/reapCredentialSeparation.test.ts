// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const CATALOG = 'synthetic-server-catalog-key';
const REAP = 'synthetic-reap-only-key';
beforeEach(() => {
  vi.resetModules();
  for (const key of ['NEXT_PUBLIC_AGENT_API_KEY', 'AGENT_API_KEY', 'SHOP_GATEWAY_AGENT_API_KEY', 'PIVOTA_API_KEY']) vi.stubEnv(key, '');
  vi.stubEnv('REAP_CHECKOUT_AGENT_API_KEY', REAP);
  vi.stubEnv('SHOP_UPSTREAM_API_URL', 'https://catalog.example.test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function invoke() {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const { POST } = await import('./route');
  await POST(new Request('http://localhost/api/gateway', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'get_pdp_v2', payload: { product_id: 'sig_6433c8107859a484fb72d14861e84690' } }) }) as any);
  return fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
}
it('uses the configured server-only catalog credential without borrowing the dedicated Reap credential', async () => {
  vi.stubEnv('SHOP_GATEWAY_AGENT_API_KEY', CATALOG);
  const headers = await invoke();
  expect(headers.some((h) => h['X-API-Key'] === CATALOG)).toBe(true);
  expect(JSON.stringify(headers)).not.toContain(REAP);
});
it('a Reap-only local configuration leaves ordinary catalog calls unauthenticated', async () => {
  const headers = await invoke();
  expect(headers.every((h) => !h['X-API-Key'] && !h.Authorization)).toBe(true);
  expect(JSON.stringify(headers)).not.toContain(REAP);
});

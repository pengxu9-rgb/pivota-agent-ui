// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as SESSION } from './route';
import { POST as CREATE } from '../route';
import { resolvingCheckout, rpcResult, storefrontEscalation } from '@/lib/reapCheckout/__fixtures__/checkouts';
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const origin = 'http://localhost:3000';
const payload = { expected_unit_price_minor:1399,expected_currency:"USD", product_id: 'sig_6433c8107859a484fb72d14861e84690', merchant_domain: 'judydoll.com', quantity: 1, idempotency_key: 'recovery-key-0001', consent: true,
  buyer: { email: 'recovery@example.test', first_name: 'Sandbox', last_name: 'Verifier', phone: '+14155550100', address_line1: '900 Brannan St', city: 'San Francisco', region: 'CA', postal_code: '94103', country: 'US' } };
function req(path: string, body: unknown = {}, cookie?: string, from = origin) {
  return new NextRequest(origin + '/api/reap-checkout' + path, { method: 'POST', headers: { host: 'localhost:3000', origin: from, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_REAP_CHECKOUT_DEMO: '1', REAP_CHECKOUT_DEMO_ENABLED: '1', REAP_CHECKOUT_GATEWAY_BASE_URL: 'http://localhost:8081', REAP_CHECKOUT_AGENT_API_KEY: `ak_live_${'a'.repeat(64)}`, REAP_CHECKOUT_DEMO_MERCHANTS: 'judydoll.com:US', REAP_DEMO_USER_JWT_PRIVATE_KEY: PEM, REAP_DEMO_USER_JWT_KID: 'test', REAP_DEMO_USER_JWT_ISSUER: 'urn:test:recovery', REAP_DEMO_USER_JWT_AUDIENCE: 'pivota-ucp' })) vi.stubEnv(key, value);
  fetchMock = vi.fn(async () => new Response(JSON.stringify(rpcResult(resolvingCheckout())), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function bootstrap() { const res = await SESSION(req('/session')); return { cookie: cookieOf(res), scope: (await res.json()).scope }; }

describe('buyer identity established before create', () => {
  it('sets an HttpOnly same-origin cookie and exposes only a non-authentication equality marker', async () => {
    const first = await bootstrap();
    expect(first.scope).toMatch(/^[0-9a-f]{64}$/); expect(first.scope).not.toContain(first.cookie.split('=')[1]);
    const again = await SESSION(req('/session', {}, first.cookie)); expect((await again.json()).scope).toBe(first.scope);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects cross-site bootstrap without establishing any identity', async () => {
    const res = await SESSION(req('/session', {}, undefined, 'https://evil.example'));
    expect(res.status).toBe(403); expect(res.headers.get('set-cookie')).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['flags-off', 'production-build', 'non-loopback-gateway'])('preserves arming guard: %s', async (mode) => {
    if (mode === 'flags-off') vi.stubEnv('REAP_CHECKOUT_DEMO_ENABLED', '0');
    if (mode === 'production-build') vi.stubEnv('NODE_ENV', 'production');
    if (mode === 'non-loopback-gateway') vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL', 'https://gateway.pivota.cc');
    expect((await SESSION(req('/session'))).status).toBe(404); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('blocks a lost or rotated buyer cookie rather than replaying under a new identity', async () => {
    const first = await bootstrap(); const second = await bootstrap();
    for (const cookie of [undefined, second.cookie]) expect((await CREATE(req('', { ...payload, buyer_scope: first.scope }, cookie))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('recovers a lost create response with the same cookie identity and idempotency key', async () => {
    const buyer = await bootstrap();
    fetchMock.mockRejectedValueOnce(new Error('response lost'));
    expect((await CREATE(req('', { ...payload, buyer_scope: buyer.scope }, buyer.cookie))).status).toBe(502);
    expect((await CREATE(req('', { ...payload, buyer_scope: buyer.scope }, buyer.cookie))).status).toBe(200);
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(sent[0].params.arguments.meta['idempotency-key']).toBe(sent[1].params.arguments.meta['idempotency-key']);
    const subjects = fetchMock.mock.calls.map(([, init]) => JSON.parse(Buffer.from(((init as RequestInit).headers as Record<string, string>)['X-Agent-User-JWT'].split('.')[1], 'base64url').toString()).sub);
    expect(subjects[0]).toBe(subjects[1]);
  });
  it('uses a distinct recover-only tool on retry; it never downgrades an old-gateway refusal into create', async () => {
    const buyer = await bootstrap();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Unknown tool' } }), { status: 200 }));
    const response = await CREATE(req('', { ...payload, buyer_scope: buyer.scope, recover_only: true }, buyer.cookie));
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(sent.params.name).toBe('recover_checkout');
    expect(JSON.stringify(sent)).not.toContain('create_checkout');
  });
  it.each([['phone', '123'], ['region', ''], ['region', '123'], ['postal_code', 'bad']])('rejects malformed %s before gateway create', async (field, value) => {
    const buyer = await bootstrap(); const response = await CREATE(req('', { ...payload, buyer_scope: buyer.scope, buyer: { ...payload.buyer, [field]: value } }, buyer.cookie));
    expect(response.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a legacy non-Reap gateway answer explicitly uncertain', async () => {
    const buyer = await bootstrap(); fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(storefrontEscalation())), { status: 200 }));
    const response = await CREATE(req('', { ...payload, buyer_scope: buyer.scope }, buyer.cookie));
    expect(await response.json()).toMatchObject({ error: 'checkout_outcome_unknown', attempt_outcome: 'unknown' });
  });
});
it.each(['create-success','recover-success','invalid-body','seller-scope-refusal','gateway-unknown'])('Absolute buyer lifetime: original four-hour buyer lifetime survives %s activity',async(mode)=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const t0=Date.UTC(2026,9,2,0,0,0);vi.setSystemTime(t0);const first=await bootstrap();
  vi.setSystemTime(t0+(4*3600-60)*1000);
  const body={...payload,buyer_scope:first.scope,...(mode==='recover-success'?{recover_only:true}:{})};
  if(mode==='invalid-body')body.buyer={...payload.buyer,phone:'123'};
  if(mode==='seller-scope-refusal')body.merchant_domain='not-in-demo.invalid';
  if(mode==='gateway-unknown')fetchMock.mockRejectedValueOnce(new Error('synthetic lost response'));
  const response=await CREATE(req('',body,first.cookie));
  expect(response.status).toBe(mode==='invalid-body'?400:mode==='seller-scope-refusal'?403:mode==='gateway-unknown'?502:200);
  expect(response.headers.get('set-cookie')).toBeNull();
  if(mode==='recover-success')expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).params.name).toBe('recover_checkout');
  const calls=fetchMock.mock.calls.length;
  vi.setSystemTime(t0+(4*3600+60)*1000);
  const {readBuyerTokenConfig}=await import('@/lib/reapCheckout/buyerToken.server');
  const {verifySignedBuyerId}=await import('@/lib/reapCheckout/routeSupport.server');
  expect(verifySignedBuyerId(readBuyerTokenConfig()!,first.cookie.split('=')[1])).toBeNull();
  const rotated=await SESSION(req('/session',{},first.cookie));expect((await rotated.json()).scope).not.toBe(first.scope);
  const expiredRetry=await CREATE(req('',{...payload,buyer_scope:first.scope,recover_only:true},first.cookie));
  expect(expiredRetry.status).toBe(409);expect(fetchMock).toHaveBeenCalledTimes(calls);
 }finally{vi.useRealTimers();}
});

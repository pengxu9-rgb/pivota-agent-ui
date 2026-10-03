// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolvingCheckout, rpcResult, storefrontEscalation } from '@/lib/reapCheckout/__fixtures__/checkouts';
const ORIGIN='https://reap-pilot.pivota.cc', GATEWAY='https://reap-gateway.pivota.cc';
const PRODUCT='sig_6433c8107859a484fb72d14861e84690';
const PEM=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
const body={product_id:PRODUCT,merchant_domain:'judydoll.com',item_source:'cart_link',quantity:1,idempotency_key:'pilot-source-key-0001',consent:true,buyer:{email:'synthetic@example.test',first_name:'Sandbox',last_name:'Verifier',phone:'+14155550100',address_line1:'900 Brannan St',city:'San Francisco',region:'CA',postal_code:'94103',country:'US'}};
const config={NODE_ENV:'production',NEXT_PUBLIC_REAP_CHECKOUT_DEMO:'1',REAP_CHECKOUT_PROFILE:'pilot',REAP_CHECKOUT_PILOT_ENABLED:'1',REAP_CHECKOUT_PILOT_ORIGIN:ORIGIN,REAP_CHECKOUT_PILOT_GATEWAY_ORIGIN:GATEWAY,REAP_CHECKOUT_GATEWAY_BASE_URL:GATEWAY,REAP_CHECKOUT_AGENT_API_KEY:`ak_live_${'a'.repeat(64)}`,REAP_CHECKOUT_PILOT_ROUTES:JSON.stringify([{domain:'judydoll.com',market:'US',item_source:'cart_link',product_ids:[PRODUCT]}]),REAP_DEMO_USER_JWT_PRIVATE_KEY:PEM,REAP_DEMO_USER_JWT_KID:'pilot-key-1',REAP_DEMO_USER_JWT_ISSUER:ORIGIN+'/reap-checkout',REAP_DEMO_USER_JWT_AUDIENCE:'pivota-ucp'};
let fetchMock:ReturnType<typeof vi.fn>;
const req=(path:string,payload:unknown={},cookie?:string,origin=ORIGIN)=>new NextRequest(origin+'/api/reap-checkout'+path,{method:'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(payload)});
beforeEach(()=>{vi.resetModules();for(const [key,value]of Object.entries(config))vi.stubEnv(key,value);fetchMock=vi.fn(async()=>new Response(JSON.stringify(rpcResult(resolvingCheckout())),{status:200}));vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function bootstrap(){const {POST}=await import('./session/route');const res=await POST(req('/session'));expect(res.status).toBe(200);return {cookie:res.headers.get('set-cookie')!.split(';')[0],scope:(await res.json()).scope};}
it('public sandbox pilot binds source before first checkout, never retries another rail, and does not renew buyer cookie',async()=>{
 const buyer=await bootstrap();expect(buyer.cookie.startsWith('__Host-')).toBe(true);
 const {POST}=await import('./route');const res=await POST(req('',{...body,buyer_scope:buyer.scope},buyer.cookie));expect(res.status).toBe(200);expect(res.headers.get('set-cookie')).toBeNull();
 expect(fetchMock).toHaveBeenCalledTimes(1);const [url,init]=fetchMock.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe(GATEWAY+'/ucp/mcp');expect(init.redirect).toBe('error');
 const sent=JSON.parse(String(init.body));expect(sent.params.arguments.checkout.reap).toEqual({expected_merchant_domain:'judydoll.com',item_source:'cart_link'});
});
it('recover-only preserves original selected source when new-create config changes',async()=>{
 const buyer=await bootstrap();vi.stubEnv('REAP_CHECKOUT_PILOT_ROUTES',JSON.stringify([{domain:'judydoll.com',market:'US',item_source:'reap_variant',product_ids:[PRODUCT]}]));
 const {POST}=await import('./route');const res=await POST(req('',{...body,buyer_scope:buyer.scope,recover_only:true},buyer.cookie));expect(res.status).toBe(200);
 const sent=JSON.parse(String(fetchMock.mock.calls[0][1].body));expect(sent.params.name).toBe('recover_checkout');expect(sent.params.arguments.checkout.reap.item_source).toBe('cart_link');
});
it.each([
 {routes:[{domain:'judydoll.com',market:'SG',item_source:'reap_variant',product_ids:[PRODUCT],merchant_ids:['new_merchant']}]},
 {routes:[{domain:'jsmbeauty.sg',market:'SG',item_source:'reap_variant',product_ids:['another-product']}]},
])('read-only recovery preserves the original request when current create scope changes %j',async({routes})=>{
 const buyer=await bootstrap();vi.stubEnv('REAP_CHECKOUT_PILOT_ROUTES',JSON.stringify(routes));
 const {POST}=await import('./route');const response=await POST(req('',{...body,buyer_scope:buyer.scope,recover_only:true},buyer.cookie));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toBeNull();
 expect(fetchMock).toHaveBeenCalledTimes(1);const sent=JSON.parse(String(fetchMock.mock.calls[0][1].body));expect(sent.params.name).toBe('recover_checkout');expect(sent.params.arguments.checkout.reap).toEqual({expected_merchant_domain:'judydoll.com',item_source:'cart_link'});expect(sent.params.arguments.meta['idempotency-key']).toBe(`pivota-ui-reap:${body.idempotency_key}`);
});
it.each([['product',{product_id:'unapproved-product'}],['source',{item_source:'reap_variant'}]])('new creates cannot widen pilot %s',async(_name,extra)=>{
 const buyer=await bootstrap();const {POST}=await import('./route');expect((await POST(req('',{...body,...extra,buyer_scope:buyer.scope},buyer.cookie))).status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();
});
it('legacy storefront answer cannot expose a fallback link or mark attempt safely resolved',async()=>{
 const buyer=await bootstrap();fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult(storefrontEscalation())),{status:200}));const {POST}=await import('./route');const response=await POST(req('',{...body,buyer_scope:buyer.scope},buyer.cookie));expect(response.status).toBe(502);expect(await response.json()).toMatchObject({error:'checkout_outcome_unknown',attempt_outcome:'unknown'});
});
it.each(['ucp_seller_mismatch','ucp_expected_merchant_domain_invalid','ucp_reap_create_refused','ucp_reap_create_not_available','reap_create_paused'])('recovery tool error %s cannot establish that the original create made nothing',async(reason)=>{
 const buyer=await bootstrap();fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rpcResult({error:{code:'OPERATION_NOT_ALLOWED',detail:{reason,cause:'different_seller'}}},true)),{status:200}));
 const {POST}=await import('./route');const response=await POST(req('',{...body,buyer_scope:buyer.scope,recover_only:true},buyer.cookie));expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'checkout_outcome_unknown',attempt_outcome:'unknown'});expect(response.headers.get('set-cookie')).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).params.name).toBe('recover_checkout');
});
it.each([['pilot-off',{REAP_CHECKOUT_PILOT_ENABLED:'0'}],['unknown-profile',{REAP_CHECKOUT_PROFILE:'typo'}],['public-http',{REAP_CHECKOUT_PILOT_ORIGIN:ORIGIN.replace('https:','http:')}],['gateway-http',{REAP_CHECKOUT_PILOT_GATEWAY_ORIGIN:GATEWAY.replace('https:','http:')}],['different-upstream',{REAP_CHECKOUT_GATEWAY_BASE_URL:'https://another.pivota.cc'}],['wildcard-route',{REAP_CHECKOUT_PILOT_ROUTES:JSON.stringify([{domain:'judydoll.com',market:'US',item_source:'cart_link',product_ids:['*']}])}],['implicit-source',{REAP_CHECKOUT_PILOT_ROUTES:JSON.stringify([{domain:'judydoll.com',market:'US',product_ids:[PRODUCT]}])}],['wrong-issuer',{REAP_DEMO_USER_JWT_ISSUER:'https://other.pivota.cc/issuer'}],['bad-kid',{REAP_DEMO_USER_JWT_KID:'bad kid'}]])('pilot refuses misconfiguration %s before identity or upstream',async(_name,change)=>{
 for(const [key,value]of Object.entries(change))vi.stubEnv(key,value as string);const {POST}=await import('./session/route');const res=await POST(req('/session'));expect([404,503]).toContain(res.status);expect(res.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
});
it.each(['https://different.pivota.cc','http://reap-pilot.pivota.cc','https://localhost'])('pilot rejects wrong incoming origin %s',async(origin)=>{
 const {POST}=await import('./session/route');const res=await POST(req('/session',{},undefined,origin));expect(res.status).toBe(404);expect(res.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
});

it.each([null,{},['cart_link'],'auto',true])('invalid selected source %j is refused before gateway dispatch',async(itemSource)=>{
 const buyer=await bootstrap();const {POST}=await import('./route');const response=await POST(req('',{...body,item_source:itemSource,buyer_scope:buyer.scope},buyer.cookie));expect(response.status).toBe(400);expect(fetchMock).not.toHaveBeenCalled();
});
it('weak RSA key cannot arm public buyer identity',async()=>{
 const weak=generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'}).toString();vi.stubEnv('REAP_DEMO_USER_JWT_PRIVATE_KEY',weak);const {POST}=await import('./session/route');const response=await POST(req('/session'));expect(response.status).toBe(503);expect(response.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
});
it.each(['https://different.pivota.cc','http://reap-pilot.pivota.cc','null'])('public pilot refuses Origin %s with a correctly pinned incoming host',async(origin)=>{
 const {POST}=await import('./session/route');const request=req('/session');request.headers.set('origin',origin);const response=await POST(request);expect(response.status).toBe(403);expect(response.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
});
it('same-origin loopback bootstrap survives NextURL normalization while cross-scheme remains refused',async()=>{
 vi.stubEnv('NODE_ENV','development');vi.stubEnv('REAP_CHECKOUT_PROFILE','demo');vi.stubEnv('REAP_CHECKOUT_DEMO_ENABLED','1');vi.stubEnv('REAP_CHECKOUT_GATEWAY_BASE_URL','http://127.0.0.1:8893');
 const {POST}=await import('./session/route');const local='http://127.0.0.1:3037';const make=(origin:string)=>new NextRequest(local+'/api/reap-checkout/session',{method:'POST',headers:{host:'127.0.0.1:3037',origin,'content-type':'application/json'},body:'{}'});
 const request=make(local);expect(request.nextUrl.hostname).toBe('localhost');expect((await POST(request)).status).toBe(200);expect((await POST(make('https://127.0.0.1:3037'))).status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();
});

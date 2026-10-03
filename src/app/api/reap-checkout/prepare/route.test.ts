// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readBuyerTokenConfig, newBuyerId } from '@/lib/reapCheckout/buyerToken.server';
import { signBuyerId, buyerScope } from '@/lib/reapCheckout/routeSupport.server';
import { readSelection } from '@/lib/reapCheckout/selection';
const PEM=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
const ORIGIN='http://127.0.0.1:3000';
const SELECTION={product_key:'prod::external_seed::external_seed::ext_fixture',variant_id:'49819267301653',variant_key:'prod::external_seed::external_seed::ext_fixture::sku_hash',merchant_domain:'judydoll.com',market:'US',currency:'USD',unit_price_minor:1399,quantity:1,item_source:'cart_link'};
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.resetModules();
 for(const[k,v]of Object.entries({NEXT_PUBLIC_REAP_CHECKOUT_DEMO:'1',REAP_CHECKOUT_DEMO_ENABLED:'true',REAP_CHECKOUT_GATEWAY_BASE_URL:'http://127.0.0.1:8081',REAP_CHECKOUT_AGENT_API_KEY:'ak_'+ 'b'.repeat(64),REAP_CHECKOUT_DEMO_MERCHANTS:'judydoll.com:US',REAP_DEMO_USER_JWT_PRIVATE_KEY:PEM,REAP_DEMO_USER_JWT_KID:'k1',REAP_DEMO_USER_JWT_ISSUER:'https://fixture.invalid/ui',REAP_DEMO_USER_JWT_AUDIENCE:'fixture'}))vi.stubEnv(k,v);
 fetchMock=vi.fn(async()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({selection:SELECTION})}]}}),{status:200}));vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
function request(extra:Record<string,unknown>={},age=0,origin=ORIGIN,cookie=true){
 const token=readBuyerTokenConfig()!;const id=newBuyerId();
 return new NextRequest(ORIGIN+'/api/reap-checkout/prepare',{method:'POST',headers:{host:'127.0.0.1:3000',origin,'content-type':'application/json',...(cookie?{cookie:'pv_reap_demo_buyer='+signBuyerId(token,id,Math.floor(Date.now()/1000)-age)}:{})},body:JSON.stringify({product_id:'sig_fixture',merchant_domain:'judydoll.com',variant_id:SELECTION.variant_id,item_source:'cart_link',quantity:1,idempotency_key:'selection-read-only',buyer_scope:buyerScope(token,id),consent:true,buyer:{email:'synthetic@example.test',first_name:'Synthetic',last_name:'Fixture',phone:'+14155550100',address_line1:'900 Brannan St',city:'San Francisco',region:'CA',postal_code:'94103',country:'US'},...extra})});
}
it('actual Next prepare handler sends only authenticated read-only tool and does not renew the original nearly-expired cookie',async()=>{
 const {POST}=await import('./route');const r=await POST(request({},14399));expect(r.status).toBe(200);expect(await r.json()).toEqual({selection:SELECTION});expect(r.headers.get('set-cookie')).toBeNull();
 expect(fetchMock).toHaveBeenCalledTimes(1);const call=JSON.parse(fetchMock.mock.calls[0][1].body);expect(call.params.name).toBe('prepare_checkout');expect(call.params.arguments.checkout.reap).toEqual({expected_merchant_domain:'judydoll.com',item_source:'cart_link',selected_variant_id:SELECTION.variant_id});
 expect(fetchMock.mock.calls[0][1].headers['X-Agent-User-JWT']).toBeTruthy();
});
it.each([14401,18000])('expired original cookie (%ss) prevents preparation before any gateway call and never renews it',async(age)=>{
 const {POST}=await import('./route');const r=await POST(request({},age));expect(r.status).toBe(409);expect(r.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
});
it('missing original cookie cannot mint a buyer through preparation',async()=>{const {POST}=await import('./route');const r=await POST(request({},0,ORIGIN,false));expect(r.status).toBe(409);expect(r.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();});
it('cross-origin prepare never reaches the gateway',async()=>{const {POST}=await import('./route');expect((await POST(request({},0,'https://foreign.invalid'))).status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();});
it.each([{selection:SELECTION},{recover_only:true},{item_source:'reap_variant'},{quantity:true},{variant_id:null}])('invalid preparation or recovery request %j never reaches any checkout transport',async(extra)=>{const {POST}=await import('./route');expect((await POST(request(extra))).status).toBeGreaterThanOrEqual(400);expect(fetchMock).not.toHaveBeenCalled();});
it.each([{unit_price_minor:'1399'},{unit_price_minor:false},{quantity:2},{market:'CA'},{variant_id:'49819267301654'},{merchant_domain:'foreign.invalid'},{proof:'trusted'}])('malformed or conflicting backend selection %j never authorizes a purchase',async(change)=>{
 fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({result:{content:[{type:'text',text:JSON.stringify({selection:{...SELECTION,...change}})}]}}),{status:200}));const {POST}=await import('./route');const r=await POST(request());expect(r.status).toBe(502);expect(r.headers.get('set-cookie')).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1);expect(JSON.parse(fetchMock.mock.calls[0][1].body).params.name).toBe('prepare_checkout');
});
it.each([{...SELECTION,unit_price_minor:true},{...SELECTION,unit_price_minor:1399.5},{...SELECTION,variant_key:''},{...SELECTION,proof:{}},[]])('strict witness validation rejects %j',v=>expect(readSelection(v)).toBeNull());

it.each(['Default','0','01','-1','1.5','gid://shopify/ProductVariant/49819267301653','123456789012345678901']) ('noncanonical numeric selector %s is refused locally before any gateway call',async(variant_id)=>{const {POST}=await import('./route');const r=await POST(request({variant_id}));expect(r.status).toBe(400);expect(await r.json()).toEqual({error:'invalid_request',field:'variant_id'});expect(r.headers.get('set-cookie')).toBeNull();expect(fetchMock).not.toHaveBeenCalled();});

import { describe, it, expect, vi } from 'vitest';
import { deriveBrief, newShoppingTask } from '@/features/shopping/model';
import { evaluateProduct, resolveComparison } from '@/features/shopping/decision';
import { runShoppingTurn } from '@/features/shopping/runShoppingTurn';
import { migrateChatState } from '@/store/chatStore';
const a:any={product_id:'a',merchant_id:'m',title:'Alpha Moisturizer 120g',price:11,currency:'USD',in_stock:true};
const b:any={...a,product_id:'b',title:'Beta Moisturizer 200g'};
const pdp=(p:any,data:any,extra:any={})=>({modules:[{type:'canonical',data:{pdp_payload:{product:p,modules:[{type:'ingredients_inci',data}],...extra}}}]}) as any;
const source={raw_text:'Water, Glycerin',source_url:'https://retailer.example/alpha',fragrance_free_claim:'Fragrance-free',is_complete:true,observed_at:'2026-10-04T00:00:00Z'};
const now=new Date('2026-10-04T05:00:00Z');
const brief=deriveBrief('Find a fragrance-free moisturizer under $30');
describe('Independent adversary contract probes',()=>{
 it('new category plus compare must search new category rather than compare old pair',async()=>{
  const old={...newShoppingTask(),brief,displayedProducts:[a,b]};
  const query='Find two sunscreens under $25. Compare their ingredients';
  const deps={search:vi.fn().mockResolvedValue({products:[{...a,product_id:'sun',title:'Zinc sunscreen'}]}),readPdp:vi.fn().mockResolvedValue({modules:[]})};
  const result=await runShoppingTurn(query,old,deriveBrief(query,brief),{},deps);
  expect({searchCalls:deps.search.mock.calls.length,ids:result.message.products?.map(p=>p.product_id)}).toEqual({searchCalls:1,ids:['sun']});
 });
 it('explicit negative fragrance-free source claim cannot verify a product',()=>{
  const result=evaluateProduct(a,pdp(a,{...source,fragrance_free_claim:'Not fragrance-free'}),brief,now);
  expect(result.fragrance).not.toBe('verified');
 });
 it('ingredient module flagged unavailable cannot certify a positive claim',()=>{
  const result=evaluateProduct(a,pdp(a,source,{x_content_module_states:{ingredients_inci:{state:'unavailable'}}}),brief,now);
  expect(result.fragrance).not.toBe('verified');
 });
 it('fragrance in ingredient items must not be concealed by conflicting raw text',()=>{
  const result=evaluateProduct(a,pdp(a,{...source,items:['Water','Glycerin','Parfum']}),brief,now);
  expect(result.fragrance).toBe('conflict');
 });
 it('unknown exact variant must not borrow product price',()=>{
  const p={...a,variant_id:'missing-variant'};
  const result=evaluateProduct(p,pdp({...a,variants:[{variant_id:'other-variant',title:'200g',price:{amount:28,currency:'USD'}}]},{}),deriveBrief('Find moisturizer under $30'),now);
  expect(result.price).not.toBe('USD 11.00');
  expect(result.eligibility).not.toBe('candidate');
 });
 it('new discovery comparison chooses eligible options before truncating first pair',async()=>{
  const products=[{...a,product_id:'bad1',price:100},{...b,product_id:'bad2',price:90},{...a,product_id:'good1',price:10},{...b,product_id:'good2',price:20}];
  const query='Find two moisturizers under $30. Compare them';
  const result=await runShoppingTurn(query,newShoppingTask(),deriveBrief(query),{}, {search:vi.fn().mockResolvedValue({products}),readPdp:vi.fn().mockResolvedValue({modules:[]})});
  expect(result.message.products?.map(p=>p.product_id)).toEqual(['good1','good2']);
 });
 it('partial named comparison cannot silently discard unknown second name using and syntax',()=>{
  const result=resolveComparison('Compare Alpha Moisturizer 120g and an absent product', [a,b]);
  expect(result.clarification).toBeTruthy();
 });
 it('rehydration after evidence expiry must downgrade verified claim or mark stale',()=>{
  const checked=evaluateProduct(a,pdp(a,source),brief,now);
  expect(checked.fragrance).toBe('verified');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-01'));
  try{
   const state=migrateChatState({currentConversationId:'c',conversations:[{id:'c',messages:[{id:'u',role:'user',content:'Find a fragrance-free moisturizer under $30'},{id:'r',role:'assistant',content:'Found candidate',decision:{summary:'1 product has sourced fragrance-free evidence.',items:[checked],compared:false,fragranceRequired:true}}]}]});
   const item=state.messages[1].decision!.items[0];
   expect(item.fragrance==='verified' && !item.sources.some(s=>s.stale)).toBe(false);
  }finally{vi.useRealTimers();}
 });
 it('out of stock product is not a candidate even with a leftover price',()=>{
  const result=evaluateProduct({...a,in_stock:false},undefined,deriveBrief('Find moisturizer under $30'),now);
  expect(result.eligibility).not.toBe('candidate');
 });
});

describe('Additional identity and availability boundaries',()=>{
 it('a product ID from a different merchant ref cannot attest this item identity',()=>{
  const response:any=pdp({...b,variants:[{variant_id:'b120',title:'200g',price:{current:{amount:29,currency:'USD'}}}],default_variant_id:'b120'}, {raw_text:'Water, Parfum'});
  response.modules[0].data.entry_product_ref={product_id:'a',merchant_id:'other-merchant'};
  const checked=evaluateProduct(a,response,brief,now);
  expect(checked.missing).toContain('Canonical details unavailable or identity could not be verified');
  expect(checked.fragrance).toBe('unverified');
 });
 it('fresh canonical exact variant stock false must override stale in-stock catalog row',()=>{
  const p={...a,variant_id:'v120'};
  const response=pdp({...a,variants:[{variant_id:'v120',title:'120g',price:{current:{amount:11,currency:'USD'}},availability:{in_stock:false}}]},{});
  const checked=evaluateProduct(p,response,deriveBrief('Find moisturizer under $30'),now);
  expect(checked.eligibility).not.toBe('candidate');
  expect(checked.missing.join(' ')+checked.tradeoffs.join(' ')).toMatch(/stock|available/i);
 });
});

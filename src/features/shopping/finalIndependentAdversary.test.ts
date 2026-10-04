import {it,expect,vi} from 'vitest';
import {deriveBrief,newShoppingTask} from '@/features/shopping/model';
import {runShoppingTurn} from '@/features/shopping/runShoppingTurn';
import {resolveComparison} from '@/features/shopping/decision';
import fullCream from '@/features/shopping/__fixtures__/audited-full-cream.json';
const previous=deriveBrief('Find a fragrance-free moisturizer under $30');
const a:any={product_id:'a',merchant_id:'m',title:'Alpha Moisturizer 120g',price:11,currency:'USD',in_stock:true};
const b:any={...a,product_id:'b',title:'Beta Moisturizer 200g'};
it('same-task request for more moisturizers keeps unremoved hard requirements',async()=>{
 const q='Show me more moisturizers';
 const next=deriveBrief(q,previous);
 expect(next.fragranceFree).toBe(true);
 expect(next.budget).toEqual(previous.budget);
 const deps={search:vi.fn().mockResolvedValue({products:[]}),readPdp:vi.fn()};
 await runShoppingTurn(q,{...newShoppingTask(),brief:previous,displayedProducts:[a,b]},next,{},deps);
 expect(deps.search.mock.calls[0][0]).toContain('fragrance-free');
});
it('colon can introduce comparison axes without unresolved product names',()=>{
 expect(resolveComparison('Compare the first two: ingredients, size, price and retailer',[a,b]).products).toEqual([a,b]);
});

it('more moisturizer refinement cannot newly recommend the known vanilla-fragrance conflict',async()=>{
 const q='Show me more moisturizers';
 const next=deriveBrief(q,previous);
 const product:any={...a,product_id:'sig_6bb6c7ae7b7e71e838aefb564c60371a',merchant_id:'merch_obs_0531e02c57f00f5b',title:'MooGoo Full Cream Moisturizer',source_url:'https://moogoousa.com/products/full-cream-moisturizer'};
 const result=await runShoppingTurn(q,{...newShoppingTask(),brief:previous,displayedProducts:[a,b]},next,{}, {search:vi.fn().mockResolvedValue({products:[product]}),readPdp:vi.fn().mockResolvedValue(fullCream)});
 expect(result.message.products).toEqual([]);
});

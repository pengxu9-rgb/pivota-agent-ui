import {describe,it,expect,vi} from 'vitest';
import {deriveBrief,newShoppingTask} from './model';
import {runShoppingTurn} from './runShoppingTurn';
import {resolveComparison} from './decision';
const a:any={product_id:'a',merchant_id:'m',title:'Alpha Moisturizer 120g',price:11,currency:'USD',in_stock:true};
const b:any={...a,product_id:'b',title:'Beta Moisturizer 200g'};
const previous=deriveBrief('Find a fragrance-free moisturizer under $30');
describe('arbitrary discovery goals and explicit names',()=>{
 it.each(['televisions','mechanical keyboards','coffee grinders','hiking poles','quokkas plush toys'])('new %s shopping goal never inherits the old product or constraints',async noun=>{
  const query=`Find two ${noun} under $500. Compare their sizes`;
  const brief=deriveBrief(query,previous); const deps={search:vi.fn().mockResolvedValue({products:[]}),readPdp:vi.fn()};
  const result=await runShoppingTurn(query,{...newShoppingTask(),brief:previous,displayedProducts:[a,b]},brief,{},deps);
  expect(deps.search.mock.calls[0][0]).toContain(noun);expect(deps.search.mock.calls[0][0]).not.toMatch(/moisturizer|fragrance/i);
  expect(result.taskPatch.displayedProducts).toEqual([]);
 });
 it('retains only expressly retained constraints on a new goal',()=>{
  expect(deriveBrief('Find televisions; keep the same budget',previous)).toMatchObject({budget:previous.budget});
  expect(deriveBrief('Find televisions; keep the same budget',previous).fragranceFree).toBeUndefined();
  expect(deriveBrief('Find televisions; keep the same constraints',previous).fragranceFree).toBe(true);
 });
 it.each(['How can I treat this rash?','Can I use these together?','Explain retinol side effects','Write me an email','Diagnose my skin condition','Find a diagnosis for my rash','Find a treatment plan for eczema'])('unsupported request %s does not search the old brief',async query=>{
  const deps={search:vi.fn(),readPdp:vi.fn()};const result=await runShoppingTurn(query,{...newShoppingTask(),brief:previous,displayedProducts:[a,b]},deriveBrief(query,previous),{},deps);
  expect(deps.search).not.toHaveBeenCalled();expect(result.message.content).toMatch(/shopping task/i);
 });
 it('keeps an existing-reference evidence query on its pair',async()=>{
  const query='Find ingredient evidence for the first two';const deps={search:vi.fn(),readPdp:vi.fn().mockResolvedValue({modules:[]})};
  await runShoppingTurn(query,{...newShoppingTask(),brief:previous,displayedProducts:[a,b]},deriveBrief(query,previous),{},deps);
  expect(deps.search).not.toHaveBeenCalled();expect(deps.readPdp).toHaveBeenCalledTimes(2);
 });
 it('does not silently replace a missing explicit name with ordinal product two',()=>{
  expect(resolveComparison('Compare the first two: Alpha Moisturizer 120g and Absent Product',[a,b]).clarification).toBeTruthy();
  expect(resolveComparison('Compare the first two: Missing One and Absent Product',[a,b]).clarification).toBeTruthy();
  expect(resolveComparison('Compare the first two: Absent Product',[a,b]).clarification).toBeTruthy();
  expect(resolveComparison('Compare the first two: Alpha Moisturizer 120g and Beta Moisturizer 200g',[a,b]).products).toEqual([a,b]);
 });
});

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';
import { useChatStore } from '@/store/chatStore';
import { useCartStore } from '@/store/cartStore';
import { getPdpV2, getShoppingDiscoveryFeed, sendMessage } from '@/lib/api';
import type { ProductResponse } from '@/lib/api';
import fixture from '@/features/shopping/__fixtures__/audited-full-cream.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} alt={props.alt || ''} /> }));
vi.mock('next/link', () => ({ default: ({ prefetch, children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: any) => <>{children}</>, motion: new Proxy({}, { get: (_, tag: string) => ({ initial, animate, exit, transition, children, ...props }: any) => React.createElement(tag, props, children) }) }));
vi.mock('@/components/theme-provider', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/lib/auroraEmbed', () => ({ isAuroraEmbedMode: () => false, getAllowedParentOrigin: () => null, postRequestCloseToParent: vi.fn() }));
vi.mock('@/lib/photoAnalysis', () => ({ isShoppingSkinPhotoUploadBetaEnabled: () => false, SKIN_PHOTO_ACCEPTED_TYPES: [], resolvePhotoAnalysisLanguage: () => 'EN', analyzeSkinPhotoFile: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...await original<any>(), sendMessage: vi.fn(), getPdpV2: vi.fn(), getShoppingDiscoveryFeed: vi.fn(), getBrowseHistory: vi.fn() }));

const magnesium: ProductResponse = { product_id: 'sig_cf68aabe65b181d292499bb0b944b331', merchant_id: 'merch_obs_0531e02c57f00f5b', title: 'MooGoo Magnesium Moisturizer 120g', brand: 'MooGoo', description: '', price: 11.5, currency: 'USD', in_stock: true };
const fullCream: ProductResponse = { ...magnesium, product_id: 'sig_6bb6c7ae7b7e71e838aefb564c60371a', title: 'MooGoo Full Cream Moisturizer', price: 11.9, source_url: 'https://moogoousa.com/products/full-cream-moisturizer' };
const prompt = 'Find a fragrance-free moisturizer under $30. Compare the two best options using ingredient evidence, size, price, and retailer. If fragrance-free status is unverified, say so.';
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const submit = (query: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: query } }); fireEvent.click(screen.getByRole('button', { name: 'Send' })); };
const historyButton = (title: string) => within(document.querySelector('aside')!).getAllByRole('button').find((button) => button.textContent?.includes(title))!;
const emptyResult = (reply = 'No reliable result') => ({ products: [], metadata: {}, strict_empty: true, reply, page_info: { page: 1, page_size: 12, has_more: false } });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear(); // test-only isolated jsdom storage, never browser/live storage
  useChatStore.getState().resetForGuest();
  useCartStore.setState({ items: [] });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(getShoppingDiscoveryFeed).mockResolvedValue({ products: [] } as any);
  vi.mocked(getPdpV2).mockImplementation(async ({ product_id }) => product_id === fullCream.product_id ? fixture as any : { modules: [] });
});
afterEach(cleanup);

// Independent added probes copied unchanged; reviewer original retained in revision receipts.
describe('Independent rendered adversarial flow',()=>{
  beforeEach(()=>{ vi.mocked(sendMessage).mockReset(); });
  it('new discovery category must not silently reuse a previous task pair',async()=>{
    vi.mocked(sendMessage).mockResolvedValueOnce({products:[magnesium, fullCream],page_info:{has_more:false}} as any).mockResolvedValueOnce({products:[{...magnesium,product_id:'sun-1',title:'Zinc Sunscreen 50ml'}],page_info:{has_more:false}} as any);
    render(<HomePage/>); submit('Find two moisturizers under $30');
    await screen.findByRole('region',{name:'Product evidence'});
    submit('Find two sunscreens under $25. Compare their ingredients');
    await screen.findByRole('region',{name:'Product comparison'});
    expect(vi.mocked(sendMessage).mock.calls.length).toBe(2);
    expect(within(screen.getByRole('region',{name:'Product comparison'})).getByText('1. Zinc Sunscreen 50ml')).toBeInTheDocument();
  });
  it('first find-and-compare surfaces eligible choices from the same catalog response',async()=>{
    vi.mocked(sendMessage).mockResolvedValue({products:[{...magnesium,product_id:'bad-1',title:'Over budget 100',price:100},{...magnesium,product_id:'bad-2',title:'Over budget 90',price:90},{...magnesium,product_id:'good-1',title:'Good under budget one',price:10},{...magnesium,product_id:'good-2',title:'Good under budget two',price:20}],page_info:{has_more:false}} as any);
    render(<HomePage/>); submit('Find two moisturizers under $30. Compare them');
    const comparison=await screen.findByRole('region',{name:'Product comparison'});
    expect(within(comparison).queryAllByText('Rejected for your brief')).toHaveLength(0);
    expect(within(comparison).getByText('1. Good under budget one')).toBeInTheDocument();
  });
});

describe('Independent delayed evidence and pagination ownership',()=>{
 beforeEach(()=>{vi.mocked(sendMessage).mockReset(); vi.mocked(getPdpV2).mockReset();});
 it('PDP evidence completing after New Chat cannot leak into a newer conversation',async()=>{
  const pending=deferred<any>();
  const other={...magnesium,product_id:'other',title:'Other lipstick'};
  vi.mocked(sendMessage).mockResolvedValueOnce({products:[magnesium],page_info:{has_more:false}} as any).mockResolvedValueOnce({products:[other],page_info:{has_more:false}} as any);
  vi.mocked(getPdpV2).mockImplementation(({product_id})=>product_id===magnesium.product_id?pending.promise:Promise.resolve({modules:[]}));
  render(<HomePage/>); submit('Find moisturizer under $30');
  await waitFor(()=>expect(getPdpV2).toHaveBeenCalledTimes(1));
  const first=useChatStore.getState().currentConversationId!;
  fireEvent.click(screen.getByRole('button',{name:'New Chat'}));
  submit('Find lipstick under $20');
  await screen.findByText('1. Other lipstick');
  const second=useChatStore.getState().currentConversationId!;
  await act(async()=>pending.resolve({modules:[]}));
  expect(useChatStore.getState().currentConversationId).toBe(second);
  expect(useChatStore.getState().messages.at(-1)?.products?.[0].product_id).toBe('other');
  expect(useChatStore.getState().conversations.find(c=>c.id===first)?.messages.at(-1)?.products?.[0].product_id).toBe(magnesium.product_id);
 });
 it('late pagination cannot overwrite a newer response in the same conversation',async()=>{
  const page2=deferred<any>(); const other={...magnesium,product_id:'other',title:'New discovery'};
  vi.mocked(sendMessage).mockResolvedValueOnce({products:[magnesium],page_info:{has_more:true}} as any).mockReturnValueOnce(page2.promise).mockResolvedValueOnce({products:[other],page_info:{has_more:false}} as any);
  vi.mocked(getPdpV2).mockResolvedValue({modules:[]});
  render(<HomePage/>); submit('Find moisturizer under $30');
  fireEvent.click(await screen.findByRole('button',{name:'Load more candidates'}));
  await waitFor(()=>expect(sendMessage).toHaveBeenCalledTimes(2));
  submit('Find other moisturizer under $30');
  await screen.findByText('1. New discovery');
  await act(async()=>page2.resolve({products:[fullCream],page_info:{has_more:false}}));
  const state=useChatStore.getState();
  expect(state.tasks[state.currentConversationId!].displayedProducts.map(p=>p.product_id)).toEqual(['other']);
  expect(state.messages.filter(m=>m.role==='assistant'&&m.products)[0].products).toEqual([magnesium]);
  expect(screen.queryByRole('button',{name:'Loading more…'})).not.toBeInTheDocument();
 });
});

// Additional mounted regressions for the review's unenumerated-goal boundary.
describe('Arbitrary product goal routing',()=>{
 it('new television intent and chips do not inherit moisturizer constraints',async()=>{
  vi.mocked(sendMessage).mockResolvedValueOnce({products:[magnesium,fullCream],page_info:{has_more:false}} as any).mockResolvedValueOnce(emptyResult('No television results'));
  render(<HomePage/>);submit('Find a fragrance-free moisturizer under $30');
  await waitFor(()=>expect(screen.queryByText('Pivota · thinking')).not.toBeInTheDocument());
  submit('Find two televisions under $500. Compare their screen sizes');
  await waitFor(()=>expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sendMessage).mock.calls[1][0]).toMatch(/televisions/);
  expect(vi.mocked(sendMessage).mock.calls[1][0]).not.toMatch(/moisturizer|fragrance/);
  expect(screen.queryByRole('button',{name:/Remove Fragrance-free/})).not.toBeInTheDocument();
 });
});

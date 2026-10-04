import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';
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
const emptyResult = (reply = 'No reliable result') => ({ products: [], strict_empty: true, reply, page_info: { page: 1, page_size: 12, has_more: false } });

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

describe('Home shopping task integration', () => {
  it('first-turn comparison excludes a known fragrance conflict before selecting two candidates and reuses the actual displayed pair', async () => {
    const alternative = { ...magnesium, product_id: 'alternative', title: 'Alternative Moisturizer 150g' };
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium, fullCream, alternative], page_info: { has_more: true } } as any);
    render(<HomePage />);
    submit(prompt);
    const comparison = await screen.findByRole('region', { name: 'Product comparison' });
    expect(within(comparison).getByText('1. MooGoo Magnesium Moisturizer 120g')).toBeInTheDocument();
    expect(within(comparison).getByText('2. Alternative Moisturizer 150g')).toBeInTheDocument();
    expect(within(comparison).queryByText(/MooGoo Full Cream Moisturizer/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 product was excluded for a known requirement conflict/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 30 and search again' })).toBeInTheDocument();
    expect(screen.queryByText('Pair with sandals')).not.toBeInTheDocument();
    submit('Compare only the first two: MooGoo Magnesium Moisturizer 120g versus Alternative Moisturizer 150g. Which has verified fragrance-free ingredient evidence? Do not show more products.');
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Product comparison' })).toHaveLength(2));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('compares the exact audited pair from legacy history with explicit conflict, sourced evidence and variant facts', async () => {
    useChatStore.getState().addMessage({ id: 'audited-query', role: 'user', content: prompt });
    useChatStore.getState().addMessage({ id: 'audited-answer', role: 'assistant', content: 'Historical catalog results', products: [magnesium, fullCream] });
    render(<HomePage />);
    submit('Compare only the first two: MooGoo Magnesium Moisturizer 120g versus MooGoo Full Cream Moisturizer. Which has verified fragrance-free ingredient evidence? Do not show more products.');
    const comparison = await screen.findByRole('region', { name: 'Product comparison' });
    expect(within(comparison).getByText(/Ingredient conflict/)).toBeInTheDocument();
    expect(within(comparison).getByText(/Natural Vanilla Fragrance/)).toBeInTheDocument();
    expect(within(comparison).getByText(/USD 11.90/)).toBeInTheDocument();
    expect(within(comparison).getByText(/45890202206515/)).toBeInTheDocument();
    expect(within(comparison).getByRole('link', { name: 'Reviewed retailer ingredient excerpt' })).toHaveAttribute('href', fullCream.source_url);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps delayed errors, loading and chips on originating history while selected task stays unchanged', async () => {
    const initialId = useChatStore.getState().beginRequest('Find a fragrance-free moisturizer under $30', { intent: 'moisturizer', category: 'moisturizer', fragranceFree: true, budget: { amount: 30, currency: 'USD', exclusive: true } });
    useChatStore.getState().completeRequest(initialId, { id: 'prior-answer', role: 'assistant', content: 'Earlier moisturizer answer', products: [magnesium] });
    useChatStore.getState().clearMessages();
    const pending = deferred<any>(); vi.mocked(sendMessage).mockReturnValue(pending.promise);
    render(<HomePage />);
    submit('Find mineral sunscreen SPF 50 under $25. Compare zinc oxide percentages for two options.');
    const sunscreenId = useChatStore.getState().currentConversationId!;
    expect(screen.getByText('Pivota · thinking')).toBeInTheDocument();
    fireEvent.click(historyButton('Find a fragrance-free moisturi'));
    expect(screen.queryByText('Pivota · thinking')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 30 and search again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Under USD 25/ })).not.toBeInTheDocument();
    await act(async () => pending.resolve(emptyResult('Sunscreen catalog unavailable')));
    expect(within(document.querySelector('main')!).queryByText('Sunscreen catalog unavailable')).not.toBeInTheDocument();
    expect(useChatStore.getState().conversations.find((c) => c.id === sunscreenId)?.lastMessage).toBe('Sunscreen catalog unavailable');
    fireEvent.click(historyButton('Find mineral sunscreen SPF 50'));
    expect(within(document.querySelector('main')!).getByText('Sunscreen catalog unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry last request' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 25 and search again' })).toBeInTheDocument();
    fireEvent.click(historyButton('Find a fragrance-free moisturi'));
    expect(within(document.querySelector('main')!).getByText('Earlier moisturizer answer')).toBeInTheDocument();
    expect(within(document.querySelector('main')!).queryByText('Sunscreen catalog unavailable')).not.toBeInTheDocument();
  });

  it('New Chat permits a second in-flight task and late rejection does not clear its loading state', async () => {
    const first = deferred<any>(); const second = deferred<any>();
    vi.mocked(sendMessage).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<HomePage />);
    submit('Find a moisturizer under $30');
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(screen.queryByText('Pivota · thinking')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Under USD 30/ })).not.toBeInTheDocument();
    submit('Find lipstick under $20');
    await act(async () => first.reject(new Error('offline')));
    expect(screen.getByText('Pivota · thinking')).toBeInTheDocument();
    expect(within(document.querySelector('main')!).queryByText(/error reaching the catalog/)).not.toBeInTheDocument();
    await act(async () => second.resolve(emptyResult('Lipstick result empty')));
    expect(within(document.querySelector('main')!).getByText('Lipstick result empty')).toBeInTheDocument();
    fireEvent.click(historyButton('Find a moisturizer under $30'));
    expect(within(document.querySelector('main')!).getByText(/error reaching the catalog/)).toBeInTheDocument();
    expect(within(document.querySelector('main')!).queryByText('Lipstick result empty')).not.toBeInTheDocument();
  });

  it('removing a semantic chip changes the actual request and save never mutates cart', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium], page_info: { has_more: false } } as any);
    render(<HomePage />);
    submit('Find a fragrance-free moisturizer under $30');
    await screen.findByRole('button', { name: 'Save to your list' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to your list' }));
    expect(useCartStore.getState().items).toEqual([]);
    expect(useChatStore.getState().tasks[useChatStore.getState().currentConversationId!].savedProducts).toEqual([magnesium]);
    expect(screen.getByText('Saved in this task (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Fragrance-free required and search again' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(sendMessage).mock.calls[1][0]).not.toMatch(/fragrance/i);
    expect(screen.queryByRole('button', { name: 'Remove Fragrance-free required and search again' })).not.toBeInTheDocument();
  });

  it('rehydrates exact messages, comparison pair, constraints and saved products after remount', async () => {
    const alternative = { ...magnesium, product_id: 'alternative', title: 'Alternative Moisturizer 150g' };
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium, alternative], page_info: { has_more: false } } as any);
    const view = render(<HomePage />); submit(prompt);
    await screen.findByRole('region', { name: 'Product comparison' });
    const id = useChatStore.getState().currentConversationId!;
    act(() => useChatStore.getState().toggleSaved(magnesium));
    view.unmount();
    await act(async () => useChatStore.persist.rehydrate());
    render(<HomePage />);
    expect(screen.getByRole('region', { name: 'Product comparison' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 30 and search again' })).toBeInTheDocument();
    expect(screen.getByText('Saved in this task (1)')).toBeInTheDocument();
    expect(useChatStore.getState().tasks[id].displayedProducts).toEqual([magnesium, alternative]);
    submit('Compare the first two');
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Product comparison' })).toHaveLength(2));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('Home hard-constraint and successful interruption regressions', () => {
  it('a delayed successful result remains only in its origin after New Chat and reopens with its own evidence', async () => {
    const pending = deferred<any>(); vi.mocked(sendMessage).mockReturnValue(pending.promise);
    render(<HomePage />); submit('Find moisturizer under $30');
    const originId = useChatStore.getState().currentConversationId!;
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    await act(async () => pending.resolve({ products: [magnesium], page_info: { has_more: false } }));
    expect(within(document.querySelector('main')!).queryByRole('region', { name: 'Product evidence' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
    expect(useChatStore.getState().tasks[originId].request?.status).toBe('complete');
    fireEvent.click(historyButton('Find moisturizer under $30'));
    expect(screen.getByRole('region', { name: 'Product evidence' })).toBeInTheDocument();
    expect(screen.getByText('1. MooGoo Magnesium Moisturizer 120g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 30 and search again' })).toBeInTheDocument();
  });

  it('request-to-reply excludes known budget and unavailable-variant violations while preserving currency uncertainty', async () => {
    const unavailable = JSON.parse(JSON.stringify(fixture));
    unavailable.modules[0].data.pdp_payload.product.variants[0].current_own_offer_status = 'unavailable';
    delete unavailable.modules[0].data.pdp_payload.product.variants[0].price;
    vi.mocked(getPdpV2).mockImplementation(async ({ product_id }) => product_id === fullCream.product_id ? unavailable : { modules: [] });
    vi.mocked(sendMessage).mockResolvedValue({ products: [
      { ...magnesium, product_id: 'over', title: 'Over budget', price: 35 },
      { ...magnesium, product_id: 'equal', title: 'Equal to exclusive limit', price: 30 },
      fullCream,
      { ...magnesium, product_id: 'eur', title: 'EUR priced candidate', price: 15, currency: 'EUR' },
      magnesium,
    ], page_info: { has_more: false } } as any);
    render(<HomePage />); submit('Find two moisturizers under $30');
    await screen.findByRole('region', { name: 'Product evidence' });
    expect(screen.queryByText('1. Over budget')).not.toBeInTheDocument();
    expect(screen.queryByText(/Equal to exclusive limit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MooGoo Full Cream Moisturizer/)).not.toBeInTheDocument();
    expect(screen.getByText('2. EUR priced candidate')).toBeInTheDocument();
    expect(screen.getByText('Budget is USD; no currency conversion applied.')).toBeInTheDocument();
    expect(screen.getByText('1. MooGoo Magnesium Moisturizer 120g')).toBeInTheDocument();
    expect(screen.getByText(/3 products were excluded for a known requirement conflict/)).toBeInTheDocument();
  });
});

describe('Home evidence certification boundaries', () => {
  it.each(['negative-claim', 'unavailable-module', 'conflicting-representations'])('never presents %s as a verified match after request and PDP reply', async (failure) => {
    const ingredient = { raw_text: 'Water, Glycerin', items: failure === 'conflicting-representations' ? ['Water', 'Glycerin', 'Parfum'] : ['Water', 'Glycerin'], fragrance_free_claim: failure === 'negative-claim' ? 'Not fragrance-free' : 'Fragrance-free', is_complete: true, source_url: 'https://retailer.example/magnesium', source_observed_at: new Date().toISOString() };
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium], page_info: { has_more: false } } as any);
    vi.mocked(getPdpV2).mockResolvedValue({ modules: [{ type: 'canonical', data: { pdp_payload: { product: magnesium, modules: [{ type: 'ingredients_inci', data: ingredient }], x_content_module_states: { ingredients_inci: failure === 'unavailable-module' ? 'unavailable' : 'ready' } } } }] });
    render(<HomePage />); submit('Find a fragrance-free moisturizer under $30');
    const evidence = await screen.findByRole('region', { name: 'Product evidence' });
    expect(within(evidence).queryByText('Fragrance-free: Sourced claim verified')).not.toBeInTheDocument();
    if (failure === 'conflicting-representations') {
      expect(within(evidence).queryByText('1. MooGoo Magnesium Moisturizer 120g')).not.toBeInTheDocument();
      expect(screen.getByText(/1 product was excluded for a known requirement conflict/)).toBeInTheDocument();
    } else expect(within(evidence).getByText('Fragrance-free: Unverified')).toBeInTheDocument();
  });
});

describe('Home continuation and comparison criteria regressions', () => {
  it('more candidates keeps hard constraints through actual request, reply, chips and displayed cards', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium, fullCream], page_info: { has_more: false } } as any);
    render(<HomePage />);
    submit('Find a fragrance-free moisturizer under $30');
    await screen.findByRole('region', { name: 'Product evidence' });
    submit('Show me more moisturizers');
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Product evidence' })).toHaveLength(2));
    expect(vi.mocked(sendMessage).mock.calls[1][0]).toContain('fragrance-free required');
    expect(vi.mocked(sendMessage).mock.calls[1][0]).toContain('under USD 30');
    expect(screen.getByRole('button', { name: 'Remove Fragrance-free required and search again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Under USD 30 and search again' })).toBeInTheDocument();
    const latest = screen.getAllByRole('region', { name: 'Product evidence' })[1];
    expect(within(latest).queryByText(/MooGoo Full Cream Moisturizer/)).not.toBeInTheDocument();
    expect(within(latest).getByText('1. MooGoo Magnesium Moisturizer 120g')).toBeInTheDocument();
  });

  it('ordinal comparison with a colon criteria list uses the shown pair without another search', async () => {
    const alternative = { ...magnesium, product_id: 'alternative', title: 'Alternative Moisturizer 150g' };
    vi.mocked(sendMessage).mockResolvedValue({ products: [magnesium, alternative], page_info: { has_more: false } } as any);
    render(<HomePage />);
    submit('Find two moisturizers under $30');
    await screen.findByRole('region', { name: 'Product evidence' });
    submit('Compare the first two: ingredients, size, price and retailer');
    const comparison = await screen.findByRole('region', { name: 'Product comparison' });
    expect(within(comparison).getByText('1. MooGoo Magnesium Moisturizer 120g')).toBeInTheDocument();
    expect(within(comparison).getByText('2. Alternative Moisturizer 150g')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

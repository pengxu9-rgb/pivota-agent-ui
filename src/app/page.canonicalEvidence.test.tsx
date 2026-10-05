import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import HomePage from './page';
import { useChatStore } from '@/store/chatStore';
import { useCartStore } from '@/store/cartStore';
import live from '@/features/shopping/__fixtures__/live-release-20261004.json';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} alt={props.alt || ''} /> }));
vi.mock('next/link', () => ({ default: ({ prefetch, children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: any) => <>{children}</>, motion: new Proxy({}, { get: (_, tag: string) => ({ initial, animate, exit, transition, children, ...props }: any) => React.createElement(tag, props, children) }) }));
vi.mock('@/components/theme-provider', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/lib/auroraEmbed', () => ({ isAuroraEmbedMode: () => false, getAllowedParentOrigin: () => null, postRequestCloseToParent: vi.fn() }));
vi.mock('@/lib/photoAnalysis', () => ({ isShoppingSkinPhotoUploadBetaEnabled: () => false, SKIN_PHOTO_ACCEPTED_TYPES: [], resolvePhotoAnalysisLanguage: () => 'EN', analyzeSkinPhotoFile: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...await original<any>(), getShoppingDiscoveryFeed: vi.fn().mockResolvedValue({ products: [] }), getBrowseHistory: vi.fn().mockResolvedValue({ items: [] }) }));

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const requests: any[] = [];
const submit = (query: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: query } }); fireEvent.click(screen.getByRole('button', { name: 'Send' })); };
beforeEach(() => {
  window.localStorage.clear(); // Isolated jsdom storage only.
  useChatStore.getState().resetForGuest();
  useCartStore.setState({ items: [] });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  requests.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body || '{}')); requests.push(request);
    if (request.operation === 'find_products_multi') return json(live.catalog.body);
    if (request.operation === 'get_pdp_v2') {
      if (request.payload.product_ref.merchant_id) return json({ error: 'PRODUCT_NOT_FOUND' }, 404);
      if (request.payload.options.allow_read_only !== true) return json({ error: 'CURRENT_OWN_OFFER_UNAVAILABLE' }, 409);
      const payload = (live.pdp as Record<string, unknown>)[request.payload.product_ref.product_id];
      return payload ? json(payload) : json({ error: 'CURRENT_OWN_OFFER_READ_FAILED' }, 503);
    }
    throw new Error(`Unexpected request ${request.operation}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('mounted Home uses real API normalization and canonical evidence reads while preserving displayed seller identities', async () => {
  // Only the wire is mocked. Search bytes are a fresh real public response;
  // PDP bytes were emitted by the actual gateway route with labelled DB seams.
  render(<HomePage />);
  submit('Find two moisturizers under $30');
  const evidence = await screen.findByRole('region', { name: 'Product evidence' });
  expect(within(evidence).getByText('1. Missha - Glow Skin Balm to Go Mist 80ml')).toBeInTheDocument();
  expect(within(evidence).getByText('2. [MISSHA] Bee Pollen Renew Intense Moisturizer')).toBeInTheDocument();
  expect(within(evidence).getByText(/Catalog listed USD 12.00; current seller price unverified/)).toBeInTheDocument();
  expect(within(evidence).queryByText('Canonical details unavailable or identity could not be verified')).not.toBeInTheDocument();
  expect(within(evidence).getAllByText('Verified current price and purchase availability for the displayed seller')).toHaveLength(2);
  const task = useChatStore.getState().tasks[useChatStore.getState().currentConversationId!];
  expect(task.displayedProducts.map((p) => [p.product_id, p.merchant_id])).toEqual(live.catalog.body.products.slice(0, 2).map((p) => [p.product_id, p.merchant_id]));
  for (const request of requests.filter((r) => r.operation === 'get_pdp_v2')) {
    expect(request.payload.product_ref.merchant_id).toBeUndefined();
    expect(request.payload.options.allow_read_only).toBe(true);
  }
  submit('Compare the first two by ingredients');
  const comparison = await screen.findByRole('region', { name: 'Product comparison' });
  expect(within(comparison).getByText('1. Missha - Glow Skin Balm to Go Mist 80ml')).toBeInTheDocument();
  expect(within(comparison).getByText('2. [MISSHA] Bee Pollen Renew Intense Moisturizer')).toBeInTheDocument();
  await waitFor(() => expect(requests.filter((r) => r.operation === 'find_products_multi')).toHaveLength(1));
  expect(useCartStore.getState().items).toEqual([]);
});

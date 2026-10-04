import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderPdpPage } from './pdpServerPage';

const rawPayload = vi.hoisted(() => ({
  schema_version: '1.0.0', page_type: 'product_detail', tracking: {}, actions: [],
  product: { product_id: 'sig_test', title: 'Silky Matte Lip Ink', variants: [], raw: { internal_notes: 'PRIVATE_RAW_SENTINEL' } },
  modules: [{
    module_id: 'product_intel', type: 'product_intel', priority: 65,
    review_note: 'PRIVATE_MODULE_SENTINEL',
    data: {
      public_display_eligible: true,
      provenance: { generator: 'PRIVATE_GENERATOR_SENTINEL', field_sources: { body: 'human_standard' } },
      quality_improvement: 'PRIVATE_EVALUATION_SENTINEL',
      freshness: { source_version: 'official_pdp_manual_review_v1' },
      product_intel_core: {
        what_it_is: { body: 'A matte lip tint in Burgundy Ink.' },
        why_it_stands_out: [{ headline: 'Lip finish cues are specific', body: 'Reviewed lip cues show matte finish before the shopper leaves Pivota.' }],
        watchouts: [{ label: 'Avoid contact with eyes.' }],
      },
    },
  }],
}));
const client = vi.hoisted(() => vi.fn(() => null));

vi.mock('./ProductDetailClient', () => ({ default: client }));
vi.mock('@/features/pdp/adapter/mapPdpV2ToPdpPayload', () => ({ mapPdpV2ToPdpPayload: () => rawPayload }));
vi.mock('@/lib/api', () => ({
  getPdpV2: async () => ({ modules: [{ type: 'canonical', data: { pdp_payload: rawPayload } }] }),
  getPdpV2Cached: async () => ({ modules: [{ type: 'canonical', data: { pdp_payload: rawPayload } }] }),
  getPdpRouteIdExistenceCached: async () => ({ exists: true }),
  getServicesBrowse: async () => ({ listings: [] }),
}));
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found'); }, unstable_rethrow: vi.fn() }));

describe('PDP server serialization boundary', () => {
  it.each([false, true])('sanitizes client props even when an old adapter returns raw data (personalized=%s)', async (personalized) => {
    client.mockClear();
    const before = JSON.stringify(rawPayload);
    const page = await renderPdpPage({ params: Promise.resolve({ id: 'sig_test' }) }, { personalized });
    renderToStaticMarkup(page);
    const props = (client.mock.calls as unknown as Array<[{ initialPayload: any }]>)[0][0];
    const intel = props.initialPayload.modules[0].data;
    expect(intel.public_display_eligible).toBe(true);
    expect(intel.product_intel_core.watchouts[0].label).toBe('Avoid contact with eyes.');
    expect(JSON.stringify(props)).not.toMatch(/PRIVATE_|provenance|human_standard|source_version|Reviewed lip cues/);
    expect(JSON.stringify(rawPayload)).toBe(before);
  });
});

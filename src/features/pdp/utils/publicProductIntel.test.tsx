import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PivotaInsightsSection } from '@/features/pdp/sections/PivotaInsightsSection';
import type { PDPPayload, ProductIntelData } from '@/features/pdp/types';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { GetPdpV2Response } from '@/lib/api';
import { isDisplayableProductIntelData, projectPublicInsightsPayload, projectPublicProductIntel } from './publicProductIntel';
// Captured from the gateway's new public projection of the actual legacy row.
import judydollPublic from './fixtures/judydoll.public.json';
import { buildProductJsonLd } from '@/app/products/[id]/productJsonLd';

const leakedRows = [
  { headline: 'Lip finish cues are specific', body: 'Reviewed lip cues such as matte finish, shade range, shade clarity identify finish, shade, or formula context before the shopper leaves Pivota.' },
  { headline: 'Shade and size are explicit', body: 'Variant labels such as 07 BURGUNDY INK, Shade: 07 BURGUNDY INK are visible, reducing ambiguity around the product format before a shopper clicks through.' },
  { headline: 'Usage instructions available', body: 'Reviewed usage context is present, including: Apply to lips.' },
];

function reviewed(): ProductIntelData {
  return {
    display_name: 'Pivota Insights',
    provenance: { generator: 'strict_human_manual_rewrite', reviewer_kind: 'human', field_sources: { what_it_is: 'human_standard' } },
    evidence_profile: 'seller_only',
    freshness: { source_version: 'official_pdp_manual_review_v1' },
    product_intel_core: {
      what_it_is: { headline: 'Silky Matte Lip Ink', body: 'A lip tint with a matte finish in 07 Burgundy Ink.' },
      why_it_stands_out: [...leakedRows, { headline: 'Matte finish', body: 'A matte lip finish in a deep burgundy shade.' }],
      routine_fit: { step: 'lip color', pairing_notes: ['Apply to clean lips.'] },
      watchouts: [{ label: 'Avoid contact with eyes.', severity: 'caution' }],
      freshness: { source_version: 'pilot_selected:strict_human_reviewed' },
    },
  };
}

function payload(data: ProductIntelData): PDPPayload {
  return {
    schema_version: '1.0.0', page_type: 'product_detail', tracking: {},
    product: { product_id: 'sig_test', title: 'Silky Matte Lip Ink' },
    modules: [{ module_id: 'product_intel', type: 'product_intel', priority: 65, title: 'Pivota Insights', data }], actions: [],
  } as unknown as PDPPayload;
}

describe('public Pivota Insights boundary', () => {
  it('renders the agreed gateway Judydoll projection without internal provenance', () => {
    const projected = projectPublicProductIntel(judydollPublic);
    expect(projected.public_display_eligible).toBe(true);
    expect(projectPublicProductIntel(projected)).toEqual(projected);
    const html = renderToStaticMarkup(<PivotaInsightsSection data={projected} />);
    expect(html).toContain('Silky Matte Lip Ink');
    expect(html).toContain('Start from the center of your lips');
    expect(html).toContain('Color appearance can shift with lip tone');
    expect(html).not.toMatch(/Reviewed lip cues|reducing ambiguity|Lip finish cues|Why it stands out|Community signals/);
  });

  it('removes the exact Judydoll evaluation rows and keeps source-backed product facts and watchouts', () => {
    const result = projectPublicProductIntel(reviewed());
    expect(result.public_display_eligible).toBe(true);
    expect(result.product_intel_core?.why_it_stands_out).toEqual([{ headline: 'Matte finish', body: 'A matte lip finish in a deep burgundy shade.' }]);
    expect(result.product_intel_core?.routine_fit?.pairing_notes).toEqual(['Apply to clean lips.']);
    expect(result.product_intel_core?.watchouts?.[0]?.label).toBe('Avoid contact with eyes.');
  });

  it('filters established lip-combo role templates while preserving actual component and finish facts', () => {
    const data = reviewed();
    data.product_intel_core!.why_it_stands_out = [
      { headline: 'Component pairing is clear', body: 'The PDP identifies the paired components, so a shopper can tell how they fit before leaving the page.' },
      { headline: 'Finish role is easy to compare', body: 'The stored product facts call out matte finish, which helps shoppers decide how the product fits.' },
      { headline: 'Lip color and liner', body: 'The kit pairs matte lip ink with a matching liner.' },
      { headline: 'Matte finish', body: 'Pair matching liner with lip ink for a matte finish.' },
    ];
    expect(projectPublicProductIntel(data).product_intel_core?.why_it_stands_out).toEqual(data.product_intel_core!.why_it_stands_out.slice(2));
  });

  it('checks evaluation copy after removing HTML and normalizing whitespace', () => {
    const data = reviewed();
    data.product_intel_core!.routine_fit!.pairing_notes = ['Reviewed <b>directions</b> are present.', 'Apply from the center of your lips.'];
    expect(projectPublicProductIntel(data).product_intel_core?.routine_fit?.pairing_notes).toEqual(['Apply from the center of your lips.']);
  });

  it.each([
    'A fragrance from Example, with source-backed scent cues including rose and vanilla.',
    'A serum from Example, with source-backed ingredient cues around vitamin C.',
    'Available variants clarify shade and size.',
    'An ingredient list is available for formula review.',
  ])('filters the legacy what_it_is evaluation template: %s', (body) => {
    const data = reviewed();
    data.product_intel_core!.what_it_is = { headline: 'Lip color', body };
    expect(projectPublicProductIntel(data).product_intel_core?.what_it_is?.body).toBe('');
  });

  it('removes internal fields recursively and does not mutate the input', () => {
    const raw = reviewed() as ProductIntelData & Record<string, unknown>;
    raw.quality_improvement = { review_note: 'PRIVATE_EVALUATION_SENTINEL' };
    raw.agent_context = { rules: 'PRIVATE_EVALUATION_SENTINEL' };
    raw.product_intel_core = { ...raw.product_intel_core, quality_improvement: 'PRIVATE_EVALUATION_SENTINEL' } as any;
    raw.product_intel_core!.why_it_stands_out!.push({ body: 'Formula contains pigment.', review_note: 'PRIVATE_EVALUATION_SENTINEL' } as any);
    raw.normalized_pdp = { truth_layers: { internal: 'PRIVATE_EVALUATION_SENTINEL' } };
    const before = JSON.stringify(raw);
    const serialized = JSON.stringify(projectPublicProductIntel(raw));
    for (const internal of ['PRIVATE_EVALUATION_SENTINEL', 'provenance', 'field_sources', 'quality_improvement', 'source_version', 'agent_context', 'truth_layers']) expect(serialized).not.toContain(internal);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('retains approved gateway eligibility after metadata removal and repeated projection', () => {
    const gateway = { ...reviewed(), provenance: undefined, freshness: undefined, public_display_eligible: true };
    const once = projectPublicProductIntel(gateway);
    expect(isDisplayableProductIntelData(once)).toBe(true);
    expect(projectPublicProductIntel(once)).toEqual(once);
  });

  it('does not use legacy reviewed provenance to override a public false', () => {
    const data = { ...reviewed(), public_display_eligible: false };
    expect(isDisplayableProductIntelData(data)).toBe(false);
    expect(projectPublicProductIntel(data).public_display_eligible).toBe(false);
    expect(renderToStaticMarkup(<PivotaInsightsSection data={data} />)).toBe('');
  });

  it.each(['top', 'core', 'normalized'])('blocked %s quality takes precedence over public eligibility', (level) => {
    const data = { ...reviewed(), public_display_eligible: true };
    if (level === 'top') data.quality_state = 'blocked';
    if (level === 'core') data.product_intel_core!.quality_state = 'blocked';
    if (level === 'normalized') data.normalized_pdp = { quality_state: 'blocked' };
    expect(projectPublicProductIntel(data).public_display_eligible).toBe(false);
  });

  it('withholds unreviewed legacy data even if it mentions specific product features', () => {
    const data = reviewed();
    delete data.provenance;
    delete data.product_intel_core!.freshness;
    expect(projectPublicProductIntel(data).public_display_eligible).toBe(false);
  });

  it('requires nonempty safe content after filtering', () => {
    const data: ProductIntelData = { public_display_eligible: true, product_intel_core: { why_it_stands_out: leakedRows } };
    expect(isDisplayableProductIntelData(data)).toBe(false);
    expect(renderToStaticMarkup(<PivotaInsightsSection data={data} />)).toBe('');
  });

  it('filters internal text in condensed overflow and other displayed narrative fields', () => {
    const data = reviewed();
    data.product_intel_core!.why_it_stands_out = [{ headline: 'Burgundy shade', body: 'A deep burgundy lip tint. '.repeat(15) + 'Reviewed lip cues show shade clarity.' }];
    data.product_intel_core!.routine_fit!.pairing_notes!.push('Reviewed usage context is present, including: blend.');
    data.texture_finish = { finish: 'internal standard', texture: 'Lightweight' };
    const html = renderToStaticMarkup(<PivotaInsightsSection data={data} />);
    expect(html).toContain('Silky Matte Lip Ink');
    expect(html).toContain('Avoid contact with eyes.');
    expect(html).not.toMatch(/Reviewed|Burgundy shade|internal standard|More context/);
  });

  it('preserves legitimate community review text only with independent community eligibility', () => {
    const data = reviewed();
    data.evidence_profile = 'community_supported';
    data.community_signals = { status: 'available', top_loves: ['Review aggregates often mention a matte finish.'], top_complaints: ['Some reviewers find the formula drying.'] };
    expect(renderToStaticMarkup(<PivotaInsightsSection data={data} />)).toContain('Some reviewers find the formula drying.');
    data.evidence_profile = 'seller_only';
    expect(projectPublicProductIntel(data).community_signals).toBeNull();
  });

  it('retains only stamped public claims; raw agent claims do not become public', () => {
    const data = reviewed();
    data.product_intel_core!.public_claims = [{ claim_text: 'Contains pigment.', source_ref: 'Brand ingredient list', source_refs: ['https://brand.example/product'], review_note: 'PRIVATE' } as any];
    expect(projectPublicProductIntel(data).product_intel_core?.public_claims).toBeUndefined();
    data.public_ready = true;
    const projected = projectPublicProductIntel(data);
    expect(projected.public_ready).toBe(true);
    expect(projected.product_intel_core?.public_claims?.[0]?.claim_text).toBe('Contains pigment.');
    expect(JSON.stringify(projected)).not.toContain('PRIVATE');
    expect(buildProductJsonLd({ product: { title: 'Lip ink' }, productId: 'sig_test' }, { productIntelModule: projected })).toContain('Contains pigment.');
  });

  it.each(['false', 'blocked', 'unreviewed'])('withheld %s cached bundles cannot publish JSON-LD claims', (kind) => {
    const data = reviewed();
    data.public_ready = true;
    data.product_intel_core!.public_claims = [{ claim_text: 'WITHHELD_PUBLIC_CLAIM_SENTINEL' }];
    if (kind === 'false') data.public_display_eligible = false;
    if (kind === 'blocked') data.product_intel_core!.quality_state = 'blocked';
    if (kind === 'unreviewed') { delete data.provenance; delete data.product_intel_core!.freshness; }
    const projected = projectPublicProductIntel(data);
    expect(projected.public_ready).toBe(false);
    expect(projected.product_intel_core?.public_claims).toBeUndefined();
    expect(buildProductJsonLd({ product: { title: 'Lip ink' }, productId: 'sig_test' }, { productIntelModule: projected })).not.toContain('WITHHELD_PUBLIC_CLAIM_SENTINEL');
  });

  it.each(['false', 'blocked'])('JSON-LD independently honors %s even for an unprojected cached module', (kind) => {
    const data = reviewed();
    data.public_ready = true;
    data.product_intel_core!.public_claims = [{ claim_text: 'WITHHELD_PUBLIC_CLAIM_SENTINEL' }];
    if (kind === 'false') data.public_display_eligible = false;
    else data.normalized_pdp = { quality_state: 'blocked' };
    expect(buildProductJsonLd({ product: { title: 'Lip ink' }, productId: 'sig_test' }, { productIntelModule: data })).not.toContain('WITHHELD_PUBLIC_CLAIM_SENTINEL');
  });

  it('removes module-level metadata before SSR props serialize', () => {
    const raw = payload(reviewed());
    (raw.modules[0] as any).quality_improvement = 'PRIVATE';
    const other = { module_id: 'overview', type: 'product_overview', data: { description: 'A lip tint.' } };
    raw.modules.push(other as any);
    const projected = projectPublicInsightsPayload(raw);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE|provenance|source_version|Reviewed lip cues/);
    expect(projected.modules[1]).toBe(other);
  });

  it('strips alternate raw product aliases even without an Insights module, preserving typed checkout facts', () => {
    const raw = payload(reviewed());
    raw.modules = [];
    raw.product.default_variant_id = 'burgundy';
    raw.product.variants = [{ variant_id: 'burgundy', option_values: { Shade: 'Burgundy Ink' } }] as any;
    raw.offers = [{ offer_id: 'offer_1', merchant_id: 'seller_1', product_id: 'lip_ink', price: { amount: 12, currency: 'USD' } }] as any;
    for (const alias of ['raw', 'raw_detail', 'raw_payload', '_raw', 'product_intel', 'productIntel', 'product_intel_bundle', 'provenance', 'agent_context']) {
      (raw.product as any)[alias] = { evaluation: 'PRIVATE_RAW_SENTINEL' };
      (raw as any)[alias] = { evaluation: 'PRIVATE_RAW_SENTINEL' };
    }
    const result = projectPublicInsightsPayload(raw);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_RAW_SENTINEL');
    expect(result.product.default_variant_id).toBe('burgundy');
    expect(result.product.variants).toBe(raw.product.variants);
    expect(result.offers).toBe(raw.offers);
  });

  it('strips nested variant dossiers while preserving typed selection fields and content states', () => {
    const raw = payload(reviewed());
    const variant = {
      variant_id: 'burgundy', title: 'Burgundy Ink', option_values: { Shade: 'Burgundy Ink' },
      price: { current: { amount: 12, currency: 'USD' } }, availability: { in_stock: true },
      raw_detail: { agent_context: { review_note: 'PRIVATE_VARIANT_DOSSIER' } },
      media: [{ url: 'https://brand.example/burgundy.jpg', raw_payload: { provenance: 'PRIVATE_VARIANT_DOSSIER' } }],
    };
    raw.product.variants = [variant] as any;
    raw.product.default_variant_id = variant.variant_id;
    raw.modules.push({ module_id: 'variants', type: 'variant_selector', data: { variants: [variant] } } as any);
    (raw as any).x_content_module_states = { product_intel: 'ready' };
    const before = JSON.stringify(raw);
    const result = projectPublicInsightsPayload(raw);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_VARIANT_DOSSIER');
    expect(result.product.variants?.[0]).toMatchObject({ variant_id: 'burgundy', option_values: variant.option_values, price: variant.price, availability: variant.availability });
    expect(result.product.default_variant_id).toBe('burgundy');
    expect((result as any).x_content_module_states).toEqual({ product_intel: 'ready' });
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('sanitizes state dictionary values recursively without dropping module-name keys or typed commerce', () => {
    const raw = payload(reviewed());
    (raw as any).x_content_module_states = {
      product_intel: { state: 'ready', provenance: { reviewer: 'PRIVATE_STATE_DOSSIER' }, nested: { raw: { criteria: 'PRIVATE_STATE_DOSSIER' } } },
      product_overview: 'ready',
      nested: { product_intel: { provenance: { reviewer: 'PRIVATE_STATE_DOSSIER' }, agent_context: { rules: 'PRIVATE_STATE_DOSSIER' }, raw_payload: { rules: 'PRIVATE_STATE_DOSSIER' } }, product_overview: 'ready' },
    };
    (raw as any).x_module_states = { reviews_preview: 'READY', product_intel: { raw_detail: { criteria: 'PRIVATE_STATE_DOSSIER' } } };
    (raw as any).x_source_locks = { reviews: true, product_intel: { agent_context: { criteria: 'PRIVATE_STATE_DOSSIER' } } };
    (raw as any).x_height_spec = { offers: 220, product_intel: { raw_payload: { criteria: 'PRIVATE_STATE_DOSSIER' } } };
    (raw as any).context = { nested: { raw: { criteria: 'PRIVATE_STATE_DOSSIER' }, agent_context: { rules: 'PRIVATE_STATE_DOSSIER' }, market: 'US' } };
    raw.product.default_variant_id = 'burgundy';
    raw.offers = [{ offer_id: 'offer_1', price: { amount: 12, currency: 'USD' } }] as any;
    const before = JSON.stringify(raw);
    const result = projectPublicInsightsPayload(raw);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_STATE_DOSSIER');
    expect((result as any).x_content_module_states).toEqual({ product_intel: { state: 'ready' }, product_overview: 'ready' });
    expect((result as any).x_module_states).toEqual({ reviews_preview: 'READY' });
    expect((result as any).x_source_locks).toEqual({ reviews: true });
    expect((result as any).x_height_spec).toEqual({ offers: 220 });
    expect((result as any).context).toEqual({ nested: { market: 'US' } });
    expect(result.product.default_variant_id).toBe('burgundy');
    expect(result.offers).toBe(raw.offers);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('allowlists state values rather than serializing direct evaluation fields', () => {
    const raw = payload(reviewed());
    (raw as any).x_content_module_states = {
      product_intel: {
        state: 'ready', status: 'ready', reason: 'PRIVATE_DIRECT_REVIEW_SENTINEL',
        field_sources: { body: 'human_standard' }, freshness: { source_version: 'official_pdp_manual_review_v1' },
        source_coverage: { seller: true }, confidence: { rationale: 'PRIVATE_DIRECT_REVIEW_SENTINEL' },
      },
      product_overview: 'ready', malformed: { state: { raw: 'PRIVATE_DIRECT_REVIEW_SENTINEL' } },
    };
    raw.x_module_states = { offers: 'READY', similar: 'LOADING' };
    raw.x_source_locks = { reviews: true, similar: false };
    raw.x_height_spec = { offers: 220, similar: 380 };
    const result = projectPublicInsightsPayload(raw);
    expect((result as any).x_content_module_states).toEqual({ product_intel: { state: 'ready', status: 'ready' }, product_overview: 'ready' });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_DIRECT_REVIEW_SENTINEL|field_sources|source_version|source_coverage|confidence|human_standard/);
    expect(result.x_module_states).toEqual(raw.x_module_states);
    expect(result.x_source_locks).toEqual(raw.x_source_locks);
    expect(result.x_height_spec).toEqual(raw.x_height_spec);
    expect(projectPublicInsightsPayload(result)).toEqual(result);
  });

  it('projects hydrated top-level product_intel through the PDP adapter', () => {
    const data = reviewed();
    const response = { modules: [
      { type: 'canonical', data: { pdp_payload: payload(data) } },
      { type: 'product_intel', data },
    ] } as unknown as GetPdpV2Response;
    const mapped = mapPdpV2ToPdpPayload(response)!;
    const intel = mapped.modules.find((module) => module.type === 'product_intel')!.data as ProductIntelData;
    expect(intel.public_display_eligible).toBe(true);
    expect(JSON.stringify(intel)).not.toMatch(/provenance|source_version|Reviewed lip cues/);
  });
});

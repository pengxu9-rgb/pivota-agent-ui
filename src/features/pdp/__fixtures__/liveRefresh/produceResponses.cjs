// Regenerates this directory's fixtures with the REAL gateway (PIVOTA-Agent, src/services/pdpLiveRefresh.js:
// the descriptor builder, the page binding check, the overlay and the patch builder), over the UI's OWN
// rebuilt slices. No merchant is contacted: the live cache is seeded with the merchant's answers.
//
// Usage, from this repo's root, with a PIVOTA-Agent checkout at $GW:
//   1. node src/features/pdp/__fixtures__/liveRefresh/produceResponses.cjs bodies "$GW"
//      writes both get_pdp_v2 bodies (with real descriptors) into this directory;
//   2. write the UI's slices into this directory: for each body,
//      buildLiveRefreshPage(mapPdpV2ToPdpPayload(body)) as <name>-live-slice.json (e.g. from a throwaway vitest);
//   3. node src/features/pdp/__fixtures__/liveRefresh/produceResponses.cjs responses "$GW"
//      writes native226-live-responses.json and builder-live-responses.json into this directory.
const path = require('path');
const fs = require('fs');

const [stage, GW] = process.argv.slice(2);
const HERE = __dirname;
const { createPdpLiveRefresh } = require(path.join(GW, 'src/services/pdpLiveRefresh.js'));
const { createPdpLiveCache, canonicalCard } = require(path.join(GW, 'src/services/pdpLiveOverlay.js'));
const { buildPdpPayload } = require(path.join(GW, 'src/pdpBuilder.js'));

// A TEST secret (never a deployed one): the browser never verifies the token.
const SECRET = 'pivota-agent-ui-fixture-secret-not-deployed-0000';
const SAVINGS = ['payment_offer_evidence', 'payment_offer_summary', 'payment_offer_badges', 'payment_pricing',
  'store_discount_evidence', 'store_discount_summary', 'store_discount_badges', 'discount_evidence', 'promotion_lines'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`);

function service(mode, cache) {
  return createPdpLiveRefresh({
    mode: () => mode,
    secrets: () => ({ current: SECRET, previous: '' }),
    getReader: () => ({ readLive: async () => ({ status: 'timeout' }) }), // never called: the cache answers
    cache: () => cache,
    isCardOfferFor: (lid) => (card, offer) => offer.merchant_id === card.merchant_id && offer.product_id === lid,
    presentationFields: SAVINGS,
  });
}

function seeded(host, handle, answers) {
  const cache = createPdpLiveCache();
  const live = new Map(Object.entries(answers).map(([id, a]) => [id, { ...a, currency: 'USD', handle }]));
  cache.record({ status: 'verified', host, country: 'US', currency: 'USD', askedIds: Object.keys(answers), live, notFound: new Set() });
  return cache;
}

// The gateway's own test page shape (tests/pdp_live_refresh.node.test.cjs): the producer's payload.
function builderBody() {
  const LEMON = '48087970185268';
  const BERRY = '31760703160372';
  const v = (id, title) => ({ variant_id: id, title, options: [{ name: 'Flavor', value: title }],
    price: { amount: 26, currency: 'USD', compare_at: 30 }, in_stock: false, inventory_quantity: 0 });
  const product = {
    product_id: 'ext_lsm', merchant_id: 'merch_obs_laneige', source: 'external_seed', title: 'Lip Sleeping Mask',
    image_url: 'https://cdn.example/lsm.jpg', price: { amount: 26, currency: 'USD' }, currency: 'USD',
    destination_url: 'https://us.laneige.com/products/lip-sleeping-mask', default_variant_id: LEMON,
    variants: [v(LEMON, 'Lemon Sorbet'), v(BERRY, 'Berry')],
  };
  const pdp = buildPdpPayload({ product, relatedProducts: [], entryPoint: 'agent' });
  const selector = (pdp.modules || []).find((m) => m.type === 'variant_selector');
  const modules = [{ type: 'canonical', required: true, data: { pdp_payload: pdp } }];
  if (selector) modules.push({ type: 'variant_selector', required: false, data: selector.data });
  modules.push({ type: 'offers', required: false, data: {
    default_offer_id: 'of_card', best_price_offer_id: 'of_card',
    offers: [{ offer_id: 'of_card', merchant_id: 'merch_obs_laneige', product_id: 'ext_lsm', selected_variant_id: LEMON,
      price: { amount: 26, currency: 'USD' }, inventory: { in_stock: false } }],
  } });
  return { status: 'success', pdp_version: '2.0', subject: { type: 'product', id: 'ext_lsm' }, modules, metadata: {} };
}

const BODIES = {
  native226: { file: 'native226-live-body.json', listing: (card) => card.source_product_id },
  multisize: { file: 'multisize-live-body.json', listing: (card) => card.source_product_id },
  singlerow: { file: 'singlerow-live-body.json', listing: (card) => card.source_product_id },
  builder: { file: 'builder-live-body.json', listing: (card) => card.product_id },
};

if (stage === 'bodies') {
  const stored = (name) => {
    const body = readJson(path.join(HERE, BODIES[name].file));
    delete body.live_refresh;
    return body;
  };
  const bodies = { native226: stored('native226'), multisize: stored('multisize'), singlerow: stored('singlerow'), builder: builderBody() };
  for (const [name, body] of Object.entries(bodies)) {
    const card = canonicalCard(body).card;
    const descriptor = service('on', createPdpLiveCache()).descriptor(body, {
      optedIn: true, market: 'US', cardListingId: BODIES[name].listing(card),
    });
    if (!descriptor) throw new Error(`no descriptor for ${name}`);
    writeJson(path.join(HERE, BODIES[name].file), { ...body, live_refresh: descriptor });
  }
} else if (stage === 'responses') {
  const scenarios = {
    native226: {
      host: 'jurlique.com', handle: 'synthetic-final-shared-listing',
      cases: {
        // The 50 mL drops to 45; the merchant also answers for the WITHHELD 100 mL, which the overlay leaves alone.
        price_drop: ['on', { '47170040267002': { amount: 45, available: true }, '47170040267003': { amount: 60, available: true } }],
        out_of_stock: ['on', { '47170040267002': { amount: 49, available: false } }],
        confirmed: ['on', { '47170040267002': { amount: 49, available: true } }],
        shadow_price_drop: ['shadow', { '47170040267002': { amount: 45, available: true } }],
      },
    },
    // The own row names NO selected variant and carries both (buyable) sizes: a product-level row.
    multisize: {
      host: 'jurlique.com', handle: 'synthetic-final-shared-listing',
      cases: {
        default_out_other_in: ['on', { '47170040267002': { amount: 49, available: false }, '47170040267003': { amount: 60, available: true } }],
        all_out: ['on', { '47170040267002': { amount: 49, available: false }, '47170040267003': { amount: 60, available: false } }],
      },
    },
    // The own row names NO selected variant and carries exactly one: it follows that variant.
    singlerow: {
      host: 'jurlique.com', handle: 'synthetic-final-shared-listing',
      cases: {
        price_drop: ['on', { '47170040267002': { amount: 45, available: true } }],
        out_of_stock: ['on', { '47170040267002': { amount: 49, available: false } }],
      },
    },
    builder: {
      host: 'us.laneige.com', handle: 'lip-sleeping-mask',
      cases: {
        back_in_stock: ['on', { '48087970185268': { amount: 24, available: true }, '31760703160372': { amount: 26, available: true } }],
      },
    },
  };
  for (const [name, { host, handle, cases }] of Object.entries(scenarios)) {
    const body = readJson(path.join(HERE, BODIES[name].file));
    const page = readJson(path.join(HERE, `${name}-live-slice.json`));
    const out = {};
    for (const [label, [mode, answers]] of Object.entries(cases)) {
      const svc = service(mode, seeded(host, handle, answers));
      out[label] = svc.read({ token: body.live_refresh.token, page, market: 'US' });
    }
    Promise.all(Object.entries(out).map(async ([label, p]) => {
      const res = await p;
      if (res.httpStatus !== 200) throw new Error(`${name}/${label}: HTTP ${res.httpStatus}`);
      return [label, res.body];
    })).then((entries) => {
      writeJson(path.join(HERE, `${name}-live-responses.json`), Object.fromEntries(entries));
      for (const [label, b] of entries) console.log(name, label, b.live_refresh.outcome, b.live_refresh.reason, Object.keys(b.patch || {}));
    });
  }
} else {
  throw new Error('stage must be bodies or responses');
}

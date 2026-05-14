'use client';

/*
 * TEMPORARY dev-only preview harness for the Beauty mobile PDP rebuild.
 * Renders the assembled BeautyPDPMobile with mock data matching
 * redesign/pivota-pdp.jsx for screenshot verification against the design
 * reference. DELETE before the PR is marked ready.
 */
import { useState } from 'react';
import { BeautyPDPMobile } from '@/features/pdp/containers/BeautyPDPMobile';

const PHOTOS = [
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=70&auto=format&fit=crop',
];
const UGC = [
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=300&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1607602132700-068258431c6c?w=300&q=70&auto=format&fit=crop',
];
const SHADES = [
  { id: '110', name: '110', hex: '#F0D5B9' },
  { id: '160', name: '160', hex: '#E5C3A0' },
  { id: '210', name: '210', hex: '#D8AC85' },
  { id: '260', name: '260', hex: '#C5946B' },
  { id: '310', name: '310', hex: '#B17E55' },
  { id: '360', name: '360', hex: '#94653F' },
  { id: '410', name: '410', hex: '#774E2D' },
  { id: '440', name: '440', hex: '#5D3A20' },
  { id: '480', name: '480', hex: '#432A17' },
];
const SIZES = [
  { id: 'refill', label: 'Refill', sub: '1.0 fl oz', priceLabel: '$32' },
  { id: 'full', label: 'Full size', sub: '1.0 fl oz', priceLabel: '$38' },
];
const CLAIMS = [
  'Broad Spectrum mineral SPF 30 (non-nano zinc oxide)',
  'Sheer-to-medium buildable tint, dewy finish',
  'Hyaluronic acid + niacinamide for plumped, even skin',
  'No white cast — works on every undertone',
];
/* eslint-disable @typescript-eslint/no-explicit-any */
const OFFERS: any[] = [
  { offer_id: 'sephora', merchant_id: 'm_sephora', merchant_name: 'Sephora', price: { amount: 32, currency: 'USD' }, inventory: { in_stock: true }, shipping: { method_label: 'Free 2-day' } },
  { offer_id: 'ulta', merchant_id: 'm_ulta', merchant_name: 'Ulta', price: { amount: 32, currency: 'USD' }, inventory: { in_stock: true }, shipping: { method_label: 'Free $35+' } },
  { offer_id: 'fenty', merchant_id: 'm_fenty', merchant_name: 'Fenty', price: { amount: 32, currency: 'USD' }, inventory: { in_stock: true }, shipping: { method_label: 'Free $40+' } },
  { offer_id: 'amazon', merchant_id: 'm_amazon', merchant_name: 'Amazon', price: { amount: 34, currency: 'USD' }, inventory: { in_stock: false }, shipping: { method_label: 'Prime' } },
];
const RECENT = [
  { user: 'Maya R.', variant: 'Shade 410 · Refill', time: '2h' },
  { user: 'Jordan P.', variant: 'Shade 260 · Refill', time: '5h' },
  { user: 'Riya S.', variant: 'Shade 310 · Refill', time: '8h' },
  { user: 'Camila T.', variant: 'Shade 160 · Full', time: '1d' },
  { user: 'Aisha K.', variant: 'Shade 440 · Refill', time: '1d' },
];
const SIMILAR = [
  { id: 's1', title: 'Unseen Sunscreen SPF 40 Mineral', image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&q=70', priceLabel: '$38', rating: 4.6, reviews: 932, highlight: 'Same dewy finish, slightly more matte build' },
  { id: 's2', title: 'Mineral Mattescreen SPF 30', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=70', priceLabel: '$30', badge: 'Cheapest', highlight: 'If you want less shine — same shade family' },
  { id: 's3', title: 'Daily Defense Mineral SPF 30', image: 'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=400&q=70', priceLabel: '$42', rating: 4.5, reviews: 681, highlight: 'Richer feel for dry winter skin' },
  { id: 's4', title: 'Pure Mineral Sunscreen SPF 50', image: 'https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=400&q=70', priceLabel: '$28', badge: 'Best price', highlight: 'Higher SPF, lighter tint' },
];
const INSIGHTS = {
  displayName: 'Pivota Insights',
  evidenceLabel: 'Includes product, review, and market signals',
  whatItIs: {
    headline: 'A lightweight mineral SPF with the polish of a tinted moisturizer',
    body: 'This sits in the rare overlap between sun-care and complexion makeup — sheer, hydrating, and pigmented enough to even out the look of skin without the matte cast typical of zinc-only SPFs.',
  },
  bestFor: ['Dry / dehydrated skin', 'Mineral SPF preference', 'Sheer everyday coverage'],
  highlights: [
    { headline: 'No white cast on deep skin', body: 'Tested by reviewers from shade 110 through 480 — the non-nano zinc is dispersed in a tinted base that flexes with undertone.' },
    { headline: 'Hydrating, not slippery', body: 'Glycerin + hyaluronic acid sit under the SPF layer; wears 6–8 hours without separating around the nose.' },
    { headline: 'Refill cuts packaging ~60%', body: 'The refill pod fits the original Hydra Vizor compact. Same formula, ~$6 less, less plastic per ml.' },
  ],
  routine: {
    step: 'Sunscreen / day complexion',
    amPm: ['AM'],
    texture: 'Fluid cream',
    finish: 'Dewy',
    pairingNotes: [
      'Layer over a hyaluronic serum if your skin reads dry by mid-day.',
      'Avoid stacking with chemical SPFs underneath — pilling reported.',
    ],
  },
  watchouts: [
    { label: 'Tends to oxidize a half-step warmer through the day.', severity: 'Minor' },
    { label: 'Reapplication blurs initial coverage — use a stick SPF on top instead.', severity: 'Note' },
  ],
  community: {
    loves: ['No white cast even at maximum coverage build-up.', 'The refill design is well-engineered — clicks in flush.'],
    complaints: ['Pump can be finicky in cold rooms; warm it in your hand first.', 'Shade jumps between mid-tones (210→260) feel large.'],
  },
};
const REVIEWS = [
  { name: 'Maya R.', rating: 5, title: 'Best mineral SPF I have tried', body: 'No white cast on my deep skin. Sets dewy without being greasy. The refill packaging is a huge plus.' },
  { name: 'Jordan P.', rating: 4, title: 'Great for daily wear', body: 'Buildable coverage that does not look cakey. Wish it came in matte too.' },
];

export default function BeautyPreviewPage() {
  const [shade, setShade] = useState('210');
  const [size, setSize] = useState('refill');
  const [offerId, setOfferId] = useState('ulta');
  const [qty, setQty] = useState(1);

  return (
    <div style={{ width: 393, height: 852, position: 'relative', overflow: 'hidden', margin: '0 auto' }}>
      <BeautyPDPMobile
        brand="Fenty Beauty"
        title="Hydra Vizor Huez Tinted Moisturizer"
        subtitle="Broad Spectrum Mineral SPF 30 Sunscreen — Refill"
        rating={4.7}
        reviewCount={1284}
        price={32}
        compareAt={38}
        discountPct={16}
        currency="USD"
        galleryImages={PHOTOS}
        shades={SHADES}
        selectedShadeId={shade}
        onSelectShade={setShade}
        sizes={SIZES}
        selectedSizeId={size}
        onSelectSize={setSize}
        benefits={['Hydrating', 'SPF 30', 'Mineral', 'Vegan']}
        claims={CLAIMS}
        offers={OFFERS}
        selectedVariant={null}
        selectedOfferId={offerId}
        bestPriceOfferId="ulta"
        primaryMerchantId="m_fenty"
        onSelectOffer={setOfferId}
        etaRange={[2, 2]}
        freeShipping
        returnWindowDays={60}
        freeReturns
        shippingSellerLabel="Ulta"
        recentPurchases={RECENT}
        recentPurchasesTotal={420}
        customerPhotos={UGC}
        customerPhotosTotal={72}
        onUgcViewAll={() => {}}
        onUgcShare={() => {}}
        insights={INSIGHTS}
        reviews={REVIEWS}
        onSeeAllReviews={() => {}}
        ingredients={
          <div className="text-[13px] leading-[1.55] text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Active</div>
            Zinc Oxide 12.0% (Sunscreen)
            <div className="mb-1 mt-2.5 font-semibold text-foreground">Inactive</div>
            Water/Aqua, Caprylic/Capric Triglyceride, Glycerin, Niacinamide, Hyaluronic Acid…
          </div>
        }
        howToUse={
          <div className="text-[13px] leading-[1.55] text-muted-foreground">
            After moisturizer, dispense 1–2 pumps and blend evenly over face and neck. Reapply
            every 2 hours when outdoors.
          </div>
        }
        shippingReturnsText={
          <div className="text-[13px] leading-[1.55] text-muted-foreground">
            Each seller above ships and accepts returns under their own policy.
          </div>
        }
        similar={SIMILAR}
        inStock
        quantity={qty}
        onQtyChange={setQty}
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        onBack={() => {}}
        onShare={() => {}}
      />
    </div>
  );
}

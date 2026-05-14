'use client';

/*
 * TEMPORARY dev-only preview harness for the Beauty mobile PDP rebuild.
 * Renders the redesigned sections with mock data matching
 * redesign/pivota-pdp.jsx so they can be screenshot-verified against the
 * design reference in isolation. DELETE before the PR is marked ready.
 */
import { useState } from 'react';
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';
import { BeautyShadeSelector } from '@/features/pdp/components/BeautyShadeSelector';
import { BeautySizeSelector } from '@/features/pdp/components/BeautySizeSelector';
import { BeautyBenefitsStrip } from '@/features/pdp/components/BeautyBenefitsStrip';
import { BeautyMobileSellerPicker } from '@/features/pdp/components/BeautyMobileSellerPicker';
import { BeautyShippingStrip } from '@/features/pdp/components/BeautyShippingStrip';
import { BeautyKeyClaims } from '@/features/pdp/components/BeautyKeyClaims';
import { BeautyRecentPurchasesRows } from '@/features/pdp/components/BeautyRecentPurchasesRows';
import { BeautyCustomerPhotos } from '@/features/pdp/components/BeautyCustomerPhotos';
import { BeautyYouMayAlsoLike } from '@/features/pdp/components/BeautyYouMayAlsoLike';

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

export default function BeautyPreviewPage() {
  const [shade, setShade] = useState('210');
  const [size, setSize] = useState('refill');
  const [offerId, setOfferId] = useState('ulta');

  return (
    <div
      className="lovable-pdp overflow-hidden bg-background pb-12 text-foreground"
      style={{ width: 393 }}
    >
      <BeautyMobileGallery images={PHOTOS} alt="Hydra Vizor Huez Tinted Moisturizer" />
      <BeautyProductHeader
        brand="Fenty Beauty"
        title="Hydra Vizor Huez Tinted Moisturizer"
        subtitle="Broad Spectrum Mineral SPF 30 Sunscreen — Refill"
        rating={4.7}
        reviewCount={1284}
        onSeeReviews={() => {}}
      />
      <BeautyPriceRow price={32} compareAt={38} discountPct={16} currency="USD" />
      <BeautyShadeSelector shades={SHADES} selectedId={shade} onSelect={setShade} onFindShade={() => {}} />
      <BeautySizeSelector sizes={SIZES} selectedId={size} onSelect={setSize} />
      <BeautyBenefitsStrip benefits={['Hydrating', 'SPF 30', 'Mineral', 'Vegan']} />
      <BeautyMobileSellerPicker
        offers={OFFERS}
        selectedVariant={null}
        selectedOfferId={offerId}
        bestPriceOfferId="ulta"
        primaryMerchantId="m_fenty"
        onSelect={setOfferId}
      />
      <BeautyShippingStrip
        etaRange={[2, 2]}
        methodLabel={null}
        freeShipping
        returnWindowDays={60}
        freeReturns
        sellerLabel="Ulta"
      />
      <BeautyKeyClaims claims={CLAIMS} />
      <BeautyRecentPurchasesRows items={RECENT} totalLabel={420} />
      <BeautyCustomerPhotos photos={UGC} totalLabel={72} onViewAll={() => {}} onShare={() => {}} />
      <BeautyYouMayAlsoLike items={SIMILAR} />
    </div>
  );
}

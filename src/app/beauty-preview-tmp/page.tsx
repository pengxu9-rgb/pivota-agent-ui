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
import { BeautyKeyClaims } from '@/features/pdp/components/BeautyKeyClaims';

const PHOTOS = [
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=70&auto=format&fit=crop',
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

export default function BeautyPreviewPage() {
  const [shade, setShade] = useState('210');
  const [size, setSize] = useState('refill');

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
      <BeautyKeyClaims claims={CLAIMS} />
    </div>
  );
}

'use client';

/*
 * TEMPORARY dev-only preview harness for the Beauty mobile PDP rebuild.
 * Renders the redesigned sections with mock data matching
 * redesign/pivota-pdp.jsx so they can be screenshot-verified against the
 * design reference in isolation. DELETE before the PR is marked ready.
 */
import { BeautyMobileGallery } from '@/features/pdp/components/BeautyMobileGallery';
import { BeautyProductHeader } from '@/features/pdp/components/BeautyProductHeader';
import { BeautyPriceRow } from '@/features/pdp/components/BeautyPriceRow';

const PHOTOS = [
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=70&auto=format&fit=crop',
];

export default function BeautyPreviewPage() {
  return (
    <div className="lovable-pdp mx-auto w-[393px] bg-background pb-12 text-foreground">
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
    </div>
  );
}

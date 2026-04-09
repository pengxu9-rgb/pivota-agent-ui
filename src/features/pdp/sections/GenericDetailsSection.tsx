'use client';

import Image from 'next/image';
import type {
  ActiveIngredientsData,
  HowToUseData,
  IngredientsInciData,
  MediaGalleryData,
  Product,
  ProductDetailsData,
} from '@/features/pdp/types';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { OverviewSection } from '@/features/pdp/sections/OverviewSection';
import { StructuredDetailsBlocks } from '@/features/pdp/sections/StructuredDetailsBlocks';
import { partitionDetailSections } from '@/features/pdp/utils/detailSections';
import { buildOverviewContent } from '@/features/pdp/utils/overviewContent';

export function GenericDetailsSection({
  data,
  product,
  media,
  activeIngredients,
  ingredientsInci,
  howToUse,
  hideLowConfidenceActiveIngredients = false,
}: {
  data?: ProductDetailsData | null;
  product: Product;
  media?: MediaGalleryData | null;
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
  hideLowConfidenceActiveIngredients?: boolean;
}) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const {
    overviewSection: primarySection,
    supplementalSections: secondarySections,
  } = partitionDetailSections(sections);
  const detailImages = (media?.items || []).slice(1, 3);
  const overviewContent = buildOverviewContent({
    description: product.description,
    section: primarySection,
    hideStructuredDuplicates: true,
  });
  const hasOverview = Boolean(
    overviewContent?.summary ||
      overviewContent?.highlights.length ||
      overviewContent?.facts.length ||
      overviewContent?.body.length,
  );

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Product Details</h2>
      <OverviewSection content={overviewContent} />

      {detailImages.length ? (
        <div className="mt-3 space-y-2">
          {detailImages.map((item, idx) => (
            <Image
              key={`${item.url}-${idx}`}
              src={item.url}
              alt=""
              width={800}
              height={600}
              sizes="(max-width: 768px) 100vw, 720px"
              loading="lazy"
              className="w-full h-auto rounded-lg"
            />
          ))}
        </div>
      ) : null}

      <StructuredDetailsBlocks
        activeIngredients={activeIngredients}
        ingredientsInci={ingredientsInci}
        howToUse={howToUse}
        hideLowConfidenceActiveIngredients={hideLowConfidenceActiveIngredients}
      />

      {secondarySections.length ? (
        <div className="mt-3">
          <DetailsAccordion data={{ sections: secondarySections }} />
        </div>
      ) : !hasOverview ? (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">Details not available.</p>
      ) : null}
    </div>
  );
}

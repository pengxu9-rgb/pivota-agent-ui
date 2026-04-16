'use client';

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
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';
import { partitionDetailSections } from '@/features/pdp/utils/detailSections';
import { buildOverviewContent } from '@/features/pdp/utils/overviewContent';

export function BeautyDetailsSection({
  data,
  product,
  media,
  activeIngredients,
  ingredientsInci,
  howToUse,
  hideLowConfidenceActiveIngredients = false,
  suppressOverview = false,
}: {
  data?: ProductDetailsData | null;
  product: Product;
  media?: MediaGalleryData | null;
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
  hideLowConfidenceActiveIngredients?: boolean;
  suppressOverview?: boolean;
}) {
  const overviewImageUrl = media?.items?.[1]?.url || media?.items?.[0]?.url || product.image_url;
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const {
    overviewSection: overviewSourceSection,
    supplementalSections: factsSections,
    brandStorySection: storySection,
  } = partitionDetailSections(sections);
  const overviewContent = buildOverviewContent({
    description: product.description,
    section: overviewSourceSection,
    hideStructuredDuplicates: true,
  });
  const formattedBrandStory = formatDescriptionText(product.brand_story || storySection?.content);
  const brandStoryParagraphs = splitParagraphs(formattedBrandStory);

  return (
    <div className="py-4">
      <div className="mx-2.5 space-y-3 sm:mx-3">
        {!suppressOverview ? (
          <OverviewSection
            content={overviewContent}
            image={overviewImageUrl ? { url: overviewImageUrl, alt: product.title } : null}
          />
        ) : null}
        <StructuredDetailsBlocks
          activeIngredients={activeIngredients}
          ingredientsInci={ingredientsInci}
          howToUse={howToUse}
          hideLowConfidenceActiveIngredients={hideLowConfidenceActiveIngredients}
        />
      </div>

      {formattedBrandStory ? (
        <div className="border-t border-muted/60 px-2.5 py-6 sm:px-3">
          <h3 className="text-sm font-semibold mb-2">Brand Story</h3>
          {brandStoryParagraphs.length ? (
            <div className="space-y-2">
              {brandStoryParagraphs.map((paragraph, idx) =>
                isLikelyHeadingParagraph(paragraph) ? (
                  <div key={`${paragraph}-${idx}`} className="text-xs font-semibold tracking-wide text-foreground">
                    {paragraph}
                  </div>
                ) : (
                  <p
                    key={`${paragraph}-${idx}`}
                    className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line"
                  >
                    {paragraph}
                  </p>
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">{formattedBrandStory}</p>
          )}
        </div>
      ) : null}

      {factsSections.length ? (
        <div className="mx-2.5 border-t border-muted/60 pt-5 sm:mx-3">
          <h3 className="text-sm font-semibold mb-3">More Details</h3>
          <DetailsAccordion data={{ sections: factsSections }} />
        </div>
      ) : null}
    </div>
  );
}

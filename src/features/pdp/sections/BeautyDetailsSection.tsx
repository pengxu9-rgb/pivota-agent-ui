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
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';
import { partitionDetailSections } from '@/features/pdp/utils/detailSections';
import { getDistinctProductDetailMediaItems } from '@/features/pdp/utils/detailMedia';
import { buildOverviewContent } from '@/features/pdp/utils/overviewContent';
import { shouldBypassNextImageOptimizer } from '@/features/pdp/utils/pdpImageUrls';

export function BeautyDetailsSection({
  data,
  product,
  media,
  activeIngredients,
  ingredientsInci,
  howToUse,
  displayedMediaItems,
  hideLowConfidenceActiveIngredients = false,
  suppressOverview = false,
  showDetailMedia = true,
  showProductInformation = true,
}: {
  data?: ProductDetailsData | null;
  product: Product;
  media?: MediaGalleryData | null;
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
  displayedMediaItems?: MediaGalleryData['items'] | null;
  hideLowConfidenceActiveIngredients?: boolean;
  suppressOverview?: boolean;
  showDetailMedia?: boolean;
  showProductInformation?: boolean;
}) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const detailImages = getDistinctProductDetailMediaItems({
    sections,
    howToUse,
    displayedMediaItems: displayedMediaItems ?? media?.items ?? [],
    productImageUrl: product.image_url,
    maxItems: 3,
  });
  const heroImage = showDetailMedia ? detailImages[0] || null : null;
  const accentImages = showDetailMedia ? detailImages.slice(1, 3) : [];
  const overviewImage = !showDetailMedia ? detailImages[0] || null : null;
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
      {showDetailMedia && heroImage?.url ? (
        <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-b from-muted to-background">
          <Image
            src={heroImage.url}
            alt={heroImage.alt_text || product.title}
            fill
            className="object-contain pointer-events-none"
            sizes="(max-width: 768px) 100vw, 640px"
            loading="lazy"
            unoptimized={shouldBypassNextImageOptimizer(heroImage.url)}
          />
        </div>
      ) : null}

      <div className="px-2.5 py-6 text-center sm:px-3">
        <h2 className="text-xl font-serif tracking-wide">{product.title}</h2>
        {product.subtitle ? <p className="mt-2 text-sm text-muted-foreground">{product.subtitle}</p> : null}
      </div>

      {accentImages.length ? (
        <div className="space-y-6 px-2.5 sm:px-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {accentImages.map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative aspect-[3/4] bg-muted">
                <Image
                  src={item.url}
                  alt={item.alt_text || ''}
                  fill
                  className="object-cover pointer-events-none"
                  sizes="(max-width: 768px) 50vw, 320px"
                  loading="lazy"
                  unoptimized={shouldBypassNextImageOptimizer(item.url)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-2.5 space-y-3 sm:mx-3">
        {!suppressOverview ? (
          <OverviewSection
            content={overviewContent}
            image={
              overviewImage?.url
                ? { url: overviewImage.url, alt: overviewImage.alt_text || `${product.title} overview` }
                : null
            }
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

      {showProductInformation && factsSections.length ? (
        <div className="mx-2.5 border-t border-muted/60 pt-5 sm:mx-3">
          <h3 className="text-sm font-semibold mb-3">Product Information</h3>
          <DetailsAccordion data={{ sections: factsSections }} />
        </div>
      ) : null}
    </div>
  );
}

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
import { StructuredDetailsBlocks } from '@/features/pdp/sections/StructuredDetailsBlocks';
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';

export function BeautyDetailsSection({
  data,
  product,
  media,
  activeIngredients,
  ingredientsInci,
  howToUse,
}: {
  data?: ProductDetailsData | null;
  product: Product;
  media?: MediaGalleryData | null;
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
}) {
  const heroUrl = media?.items?.[0]?.url || product.image_url;
  const accentImages = media?.items?.slice(1, 3) || [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const storySectionIndex = sections.findIndex((section) =>
    /brand|story/i.test(section.heading),
  );
  const storySection =
    storySectionIndex >= 0 ? sections[storySectionIndex] : undefined;
  const remainingSections =
    storySectionIndex >= 0
      ? sections.filter((_, idx) => idx !== storySectionIndex)
      : sections;
  const formattedDescription =
    formatDescriptionText(product.description) || formatDescriptionText(remainingSections?.[0]?.content);
  const descriptionParagraphs = splitParagraphs(formattedDescription);
  const introText =
    descriptionParagraphs.find((paragraph) => !isLikelyHeadingParagraph(paragraph)) ||
    descriptionParagraphs[0] ||
    '';
  const formattedBrandStory = formatDescriptionText(product.brand_story || storySection?.content);
  const brandStoryParagraphs = splitParagraphs(formattedBrandStory);
  const factsSections = storySectionIndex >= 0 ? remainingSections : sections;

  return (
    <div className="py-4">
      {heroUrl ? (
        <div className="aspect-[4/5] bg-gradient-to-b from-muted to-background">
          <Image
            src={heroUrl}
            alt={product.title}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 640px"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="px-3 py-6 text-center">
        <h2 className="text-xl font-serif tracking-wide">{product.title}</h2>
        {product.subtitle ? <p className="mt-2 text-sm text-muted-foreground">{product.subtitle}</p> : null}
        {introText ? (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto whitespace-pre-line">
            {introText}
          </p>
        ) : null}
      </div>

      {accentImages.length ? (
        <div className="px-3 space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {accentImages.map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative aspect-[3/4] bg-muted">
                <Image
                  src={item.url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 320px"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-3 space-y-3">
        <StructuredDetailsBlocks
          activeIngredients={activeIngredients}
          ingredientsInci={ingredientsInci}
          howToUse={howToUse}
        />
      </div>

      {formattedBrandStory ? (
        <div className="px-3 py-6 border-t border-muted/60">
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
        <div className="mx-3 border-t border-muted/60 pt-5">
          <h3 className="text-sm font-semibold mb-3">Product Information</h3>
          <DetailsAccordion data={{ sections: factsSections }} />
        </div>
      ) : null}
    </div>
  );
}

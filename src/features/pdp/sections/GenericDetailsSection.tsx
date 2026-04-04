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

export function GenericDetailsSection({
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
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const primarySection = sections[0];
  const secondarySections = sections.slice(1);
  const description = formatDescriptionText(primarySection?.content || product.description);
  const descriptionParagraphs = splitParagraphs(description);
  const detailImages = (media?.items || []).slice(1, 3);

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Product Details</h2>
      <StructuredDetailsBlocks
        activeIngredients={activeIngredients}
        ingredientsInci={ingredientsInci}
        howToUse={howToUse}
      />

      {descriptionParagraphs.length ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold mb-1.5">{primarySection?.heading || 'Details'}</h3>
          <div className="space-y-2">
            {descriptionParagraphs.map((paragraph, idx) =>
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
        </div>
      ) : null}

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

      {secondarySections.length ? (
        <div className="mt-3">
          <DetailsAccordion data={{ sections: secondarySections }} />
        </div>
      ) : !descriptionParagraphs.length ? (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">Details not available.</p>
      ) : null}
    </div>
  );
}

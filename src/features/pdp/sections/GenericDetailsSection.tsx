'use client';

import Image from 'next/image';
import type { MediaGalleryData, Product, ProductDetailsData } from '@/features/pdp/types';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';

export function GenericDetailsSection({
  data,
  product,
  media,
}: {
  data: ProductDetailsData;
  product: Product;
  media?: MediaGalleryData | null;
}) {
  const primarySection = data.sections[0];
  const secondarySections = data.sections.slice(1);
  const description = formatDescriptionText(primarySection?.content || product.description);
  const descriptionParagraphs = splitParagraphs(description);
  const detailImages = (media?.items || []).slice(1, 3);

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Product Details</h2>
      <div className="mb-3">
        <h3 className="text-sm font-semibold mb-1.5">{primarySection?.heading || 'Fabric & Care'}</h3>
        {descriptionParagraphs.length ? (
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
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">Details not available.</p>
        )}
      </div>

      {detailImages.length ? (
        <div className="space-y-2">
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
      ) : null}
    </div>
  );
}

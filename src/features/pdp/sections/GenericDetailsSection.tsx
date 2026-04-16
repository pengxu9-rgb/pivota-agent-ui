'use client';

import Image from 'next/image';
import type {
  HowToUseData,
  MediaGalleryData,
  Product,
  ProductDetailsData,
} from '@/features/pdp/types';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { OverviewSection } from '@/features/pdp/sections/OverviewSection';
import { partitionDetailSections } from '@/features/pdp/utils/detailSections';
import { buildOverviewContent } from '@/features/pdp/utils/overviewContent';

function hasSections(data?: ProductDetailsData | null): data is ProductDetailsData {
  return Array.isArray(data?.sections) && data.sections.length > 0;
}

export function GenericDetailsSection({
  data,
  product,
  media,
  materials,
  productSpecs,
  sizeFit,
  careInstructions,
  usageSafety,
  howToUse,
  suppressOverview = false,
}: {
  data?: ProductDetailsData | null;
  product: Product;
  media?: MediaGalleryData | null;
  materials?: ProductDetailsData | null;
  productSpecs?: ProductDetailsData | null;
  sizeFit?: ProductDetailsData | null;
  careInstructions?: ProductDetailsData | null;
  usageSafety?: ProductDetailsData | null;
  howToUse?: HowToUseData | null;
  suppressOverview?: boolean;
}) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const {
    overviewSection: primarySection,
    supplementalSections: secondarySections,
  } = partitionDetailSections(sections);
  const overviewImage = media?.items?.[1] || media?.items?.[0] || null;
  const detailImages = (media?.items || [])
    .filter((item) => item?.url && item.url !== overviewImage?.url)
    .slice(0, 2);
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
  const genericBlocks = [
    { title: 'Materials', data: materials },
    { title: 'Specifications', data: productSpecs },
    { title: 'Size & Fit', data: sizeFit },
    { title: 'Care', data: careInstructions },
    { title: 'Usage & Safety', data: usageSafety },
  ].filter((block) => hasSections(block.data));
  const howToUseSteps = Array.isArray(howToUse?.steps) ? howToUse.steps.filter(Boolean) : [];
  const hasGenericContent = Boolean(genericBlocks.length || howToUseSteps.length);

  return (
    <div className="px-2.5 py-3 sm:p-3">
      <h2 className="text-sm font-semibold mb-2">Product Details</h2>
      {!suppressOverview ? (
        <OverviewSection
          content={overviewContent}
          image={overviewImage?.url ? { url: overviewImage.url, alt: product.title } : null}
        />
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

      {genericBlocks.length ? (
        <div className="mt-3 space-y-3">
          {genericBlocks.map((block) => (
            <section key={block.title} className="rounded-xl border border-border/70 bg-card/70 px-3 py-3">
              <h3 className="text-sm font-semibold">{block.title}</h3>
              <div className="mt-2">
                <DetailsAccordion data={block.data || { sections: [] }} />
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {howToUseSteps.length ? (
        <section className="mt-3 rounded-xl border border-border/70 bg-card/70 px-3 py-3">
          <h3 className="text-sm font-semibold">{String(howToUse?.title || 'How to Use').trim()}</h3>
          <ol className="mt-3 space-y-2">
            {howToUseSteps.map((step, idx) => (
              <li key={`${step}-${idx}`} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-foreground">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {secondarySections.length ? (
        <div className="mt-3">
          <DetailsAccordion data={{ sections: secondarySections }} />
        </div>
      ) : !hasOverview && !suppressOverview && !hasGenericContent ? (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">Details not available.</p>
      ) : null}
    </div>
  );
}

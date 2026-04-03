'use client';

import type { ReactNode } from 'react';
import type {
  ActiveIngredientsData,
  HowToUseData,
  IngredientsInciData,
} from '@/features/pdp/types';
import { PdpSourceBadge } from '@/features/pdp/sections/PdpSourceBadge';
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';

function getStructuredItemLabel(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  const typed = item as Record<string, unknown>;
  const primary =
    String(
      typed.name ||
        typed.title ||
        typed.inci_name ||
        typed.value ||
        '',
    ).trim();
  const suffixParts = [
    typed.concentration,
    typed.description,
    typed.detail,
    typed.benefit,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!primary) return suffixParts.join(' - ');
  if (!suffixParts.length) return primary;
  return `${primary} - ${suffixParts.join(' - ')}`;
}

function getStructuredItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => getStructuredItemLabel(item))
    .filter(Boolean);
}

function StructuredText({
  text,
  className = 'text-sm text-muted-foreground leading-relaxed whitespace-pre-line',
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = splitParagraphs(formatDescriptionText(text));
  if (!paragraphs.length) return null;
  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph, idx) =>
        isLikelyHeadingParagraph(paragraph) ? (
          <div key={`${paragraph}-${idx}`} className="text-xs font-semibold tracking-wide text-foreground">
            {paragraph}
          </div>
        ) : (
          <p key={`${paragraph}-${idx}`} className={className}>
            {paragraph}
          </p>
        ),
      )}
    </div>
  );
}

function StructuredBlock({
  title,
  subtitle,
  sourceOrigin,
  sourceQualityStatus,
  children,
}: {
  title: string;
  subtitle?: string;
  sourceOrigin?: string;
  sourceQualityStatus?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <PdpSourceBadge sourceOrigin={sourceOrigin} sourceQualityStatus={sourceQualityStatus} />
      </div>
      {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function StructuredDetailsBlocks({
  activeIngredients,
  ingredientsInci,
  howToUse,
}: {
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
}) {
  const activeIngredientItems = getStructuredItems(activeIngredients?.items);
  const ingredientsInciItems = getStructuredItems(ingredientsInci?.items);
  const howToUseItems = Array.isArray(howToUse?.steps)
    ? howToUse.steps.map((step) => String(step || '').trim()).filter(Boolean)
    : [];

  const hasContent = Boolean(
    activeIngredientItems.length ||
      ingredientsInciItems.length ||
      howToUseItems.length ||
      activeIngredients?.raw_text ||
      ingredientsInci?.raw_text ||
      howToUse?.raw_text,
  );

  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      {activeIngredientItems.length || activeIngredients?.raw_text ? (
        <StructuredBlock
          title={String(activeIngredients?.title || 'Active ingredients').trim() || 'Active ingredients'}
          subtitle="Highlighted actives or hero ingredients, not the full formula."
          sourceOrigin={activeIngredients?.source_origin}
          sourceQualityStatus={activeIngredients?.source_quality_status}
        >
          {activeIngredientItems.length ? (
            <div className="flex flex-wrap gap-2">
              {activeIngredientItems.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          {activeIngredients?.raw_text ? (
            <div className={activeIngredientItems.length ? 'mt-3' : ''}>
              <StructuredText text={String(activeIngredients.raw_text)} />
            </div>
          ) : null}
        </StructuredBlock>
      ) : null}
      {ingredientsInciItems.length || ingredientsInci?.raw_text ? (
        <StructuredBlock
          title={String(ingredientsInci?.title || 'Ingredients').trim() || 'Ingredients'}
          subtitle="Full ingredient list (INCI) when available."
          sourceOrigin={ingredientsInci?.source_origin}
          sourceQualityStatus={ingredientsInci?.source_quality_status}
        >
          {ingredientsInci?.raw_text ? (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {String(ingredientsInci.raw_text).trim()}
            </p>
          ) : ingredientsInciItems.length ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {ingredientsInciItems.join(', ')}
            </p>
          ) : null}
        </StructuredBlock>
      ) : null}
      {howToUseItems.length || howToUse?.raw_text ? (
        <StructuredBlock
          title={String(howToUse?.title || 'How to use').trim() || 'How to use'}
          sourceOrigin={howToUse?.source_origin}
        >
          {howToUseItems.length ? (
            <ol className="space-y-2">
              {howToUseItems.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {!howToUseItems.length && howToUse?.raw_text ? (
            <StructuredText text={String(howToUse.raw_text)} />
          ) : null}
        </StructuredBlock>
      ) : null}
    </div>
  );
}

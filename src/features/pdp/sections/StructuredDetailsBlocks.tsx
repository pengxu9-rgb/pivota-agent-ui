'use client';

import type {
  ActiveIngredientsData,
  HowToUseData,
  IngredientsInciData,
} from '@/features/pdp/types';
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

function StructuredList({
  title,
  items,
  fallbackText,
  ordered = false,
}: {
  title: string;
  items: string[];
  fallbackText?: string;
  ordered?: boolean;
}) {
  if (!items.length && !fallbackText) return null;

  const ListTag = ordered ? 'ol' : 'ul';

  return (
    <div className="rounded-xl border border-border/70 bg-card/70 px-3 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ListTag className={ordered ? 'mt-2 space-y-2 pl-4 text-sm text-muted-foreground list-decimal' : 'mt-2 space-y-2 pl-4 text-sm text-muted-foreground list-disc'}>
          {items.map((item, idx) => (
            <li key={`${title}-${idx}`}>{item}</li>
          ))}
        </ListTag>
      ) : fallbackText ? (
        <div className="mt-2">
          <StructuredText text={fallbackText} />
        </div>
      ) : null}
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
      <StructuredList
        title={String(activeIngredients?.title || 'Active Ingredients').trim() || 'Active Ingredients'}
        items={activeIngredientItems}
        fallbackText={String(activeIngredients?.raw_text || '').trim() || undefined}
      />
      <StructuredList
        title={String(ingredientsInci?.title || 'Ingredients (INCI)').trim() || 'Ingredients (INCI)'}
        items={ingredientsInciItems}
        fallbackText={String(ingredientsInci?.raw_text || '').trim() || undefined}
      />
      <StructuredList
        title={String(howToUse?.title || 'How to Use').trim() || 'How to Use'}
        items={howToUseItems}
        fallbackText={String(howToUse?.raw_text || '').trim() || undefined}
        ordered
      />
    </div>
  );
}

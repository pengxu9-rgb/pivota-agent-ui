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

function formatSourceLabel(sourceOrigin: unknown): string | null {
  const raw = String(sourceOrigin || '').trim();
  if (!raw) return null;
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((token) => {
      const normalized = token.toLowerCase();
      if (normalized === 'pdp') return 'PDP';
      if (normalized === 'inci') return 'INCI';
      if (normalized === 'sku') return 'SKU';
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

function normalizeIngredientsRawText(text: string, hasActiveIngredients: boolean): string {
  let normalized = String(text || '').trim();
  if (!normalized) return '';
  normalized = normalized.replace(/\s+/g, ' ');

  if (hasActiveIngredients) {
    const fullIngredientsMatch = normalized.match(/full ingredients[:\s-]*/i);
    if (fullIngredientsMatch?.index != null) {
      normalized = normalized.slice(fullIngredientsMatch.index + fullIngredientsMatch[0].length).trim();
    }
  }

  normalized = normalized.replace(/^ingredients(?:\s*\(inci\))?[:\s-]*/i, '').trim();
  return normalized;
}

function SectionHeader({
  title,
  sourceOrigin,
}: {
  title: string;
  sourceOrigin?: string;
}) {
  const sourceLabel = formatSourceLabel(sourceOrigin);
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {sourceLabel ? (
        <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {sourceLabel}
        </span>
      ) : null}
    </div>
  );
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
  const hasActiveIngredients = Boolean(
    activeIngredientItems.length || String(activeIngredients?.raw_text || '').trim(),
  );
  const normalizedIngredientsRawText = normalizeIngredientsRawText(
    String(ingredientsInci?.raw_text || ''),
    hasActiveIngredients,
  );

  const hasContent = Boolean(
    activeIngredientItems.length ||
      ingredientsInciItems.length ||
      howToUseItems.length ||
      activeIngredients?.raw_text ||
      normalizedIngredientsRawText ||
      howToUse?.raw_text,
  );

  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      {(activeIngredientItems.length || activeIngredients?.raw_text) ? (
        <div className="rounded-xl border border-border/70 bg-card/70 px-3 py-3">
          <SectionHeader
            title={String(activeIngredients?.title || 'Active Ingredients').trim() || 'Active Ingredients'}
            sourceOrigin={activeIngredients?.source_origin}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Highlighted actives or hero ingredients, not the full formula.
          </p>
          {activeIngredientItems.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeIngredientItems.map((item, idx) => (
                <span
                  key={`active-ingredient-${idx}`}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : activeIngredients?.raw_text ? (
            <div className="mt-3">
              <StructuredText text={String(activeIngredients.raw_text)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {(ingredientsInciItems.length || normalizedIngredientsRawText) ? (
        <div className="rounded-xl border border-border/70 bg-card/70 px-3 py-3">
          <SectionHeader
            title={String(ingredientsInci?.title || 'Ingredients').trim() || 'Ingredients'}
            sourceOrigin={ingredientsInci?.source_origin}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Full ingredient list (INCI) when available.
          </p>
          {normalizedIngredientsRawText ? (
            <div className="mt-3">
              <StructuredText text={normalizedIngredientsRawText} />
            </div>
          ) : null}
          {!normalizedIngredientsRawText && ingredientsInciItems.length ? (
            <ul className="mt-3 space-y-2 pl-4 text-sm text-muted-foreground list-disc">
              {ingredientsInciItems.map((item, idx) => (
                <li key={`ingredients-inci-${idx}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(howToUseItems.length || howToUse?.raw_text) ? (
        <div className="rounded-xl border border-border/70 bg-card/70 px-3 py-3">
          <SectionHeader
            title={String(howToUse?.title || 'How to Use').trim() || 'How to Use'}
            sourceOrigin={howToUse?.source_origin}
          />
          {howToUseItems.length ? (
            <ol className="mt-3 space-y-3">
              {howToUseItems.map((item, idx) => (
                <li key={`how-to-use-${idx}`} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-foreground">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">{item}</span>
                </li>
              ))}
            </ol>
          ) : howToUse?.raw_text ? (
            <div className="mt-3">
              <StructuredText text={String(howToUse.raw_text)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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

const INGREDIENT_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|peta-certified|vegan and cruelty-free|no worries|patch test|allerg(?:y|ic)|warning|warnings|caution|note:)\b/i;
const HOW_TO_USE_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|faq|question(?:s)?|about)\b/i;
const HOW_TO_USE_ACTION_RE =
  /\b(apply|use|massage|dispense|lather|rinse|pat|layer|follow|start|finish|take|swipe|smooth|spray|press|cleanse|shake|wet|dry|leave|reapply|mix|blend|deepen|define|buff|morning|night|am|pm)\b/i;

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

function uniqueNonEmpty(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim();
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ingredientCoreKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[\d\s,.-]+/, '')
    .replace(/[^a-z]+/g, '');
}

function dedupeIngredientItems(items: string[]): string[] {
  const preferredByCore = new Map<string, string>();
  for (const item of items) {
    const core = ingredientCoreKey(item) || item.toLowerCase();
    const existing = preferredByCore.get(core);
    if (!existing || item.length > existing.length) {
      preferredByCore.set(core, item);
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const core = ingredientCoreKey(item) || item.toLowerCase();
    const preferred = preferredByCore.get(core) || item;
    const key = preferred.toLowerCase();
    if (preferred !== item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function combineBrokenIngredientParts(items: string[]): string[] {
  const combined: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const next = items[index + 1];
    if (/^\d+$/.test(current) && typeof next === 'string' && /^\d+-[A-Za-z]/.test(next)) {
      combined.push(`${current},${next}`);
      index += 1;
      continue;
    }
    combined.push(current);
  }
  return combined;
}

function cleanStructuredToken(value: string): string {
  return String(value || '')
    .replace(/^[\s\-•*]+/, '')
    .replace(/^(?:step\s*)?\d+[\).:\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-•]\s*$/, '')
    .trim();
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

function isLikelyPureIngredientItem(item: string): boolean {
  const normalized = String(item || '').trim();
  if (!normalized) return false;
  if (INGREDIENT_NOISE_RE.test(normalized)) return false;
  if (normalized.includes(':')) return false;
  if (/[.!?]/.test(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount <= 16;
}

function parseIngredientsFromText(text: string): string[] {
  const normalized = normalizeIngredientsRawText(text, false);
  if (!normalized) return [];
  return dedupeIngredientItems(
    combineBrokenIngredientParts(
      normalized
      .split(/\n+|;|,(?![^()]*\))/)
      .map((item) => normalizeIngredientListItem(item))
      .filter((item) => item.length > 1 && !/^please be aware that ingredient lists/i.test(item)),
    ).filter((item) => isLikelyPureIngredientItem(item)),
  );
}

function normalizeIngredientListItem(item: string): string {
  return cleanStructuredToken(item)
    .replace(/^full ingredients[:\s-]*/i, '')
    .replace(/^(?:key\s+ingredients?\s+)?ingredients(?:\s*\(inci\))?[:\s-]*/i, '')
    .replace(/^\[\+\/-\s*/i, '')
    .replace(/\s*Please be aware that ingredient lists.*$/i, '')
    .replace(/\]+$/g, '')
    .trim();
}

function splitHowToUseFragments(text: string): string[] {
  const normalized = formatDescriptionText(text)
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const withBreaks = normalized
    .replace(/(?:^|\s)(?:step\s*)?\d+[\).:\-]\s*/gi, '\n')
    .replace(/(?:^|\s)[•*-]\s+/g, '\n')
    .replace(/\s+-\s+/g, '\n');

  return uniqueNonEmpty(
    withBreaks
      .split(/\n+/)
      .map((item) => cleanStructuredToken(item))
      .filter((item) => item.length > 1),
  );
}

function sanitizeHowToUseItems(steps: unknown, rawText: string): string[] {
  const sourceSteps = Array.isArray(steps) ? steps : [];
  const cleanedFromSteps = uniqueNonEmpty(
    sourceSteps
      .flatMap((step) => splitHowToUseFragments(String(step || '')))
      .filter((step) => !HOW_TO_USE_NOISE_RE.test(step))
      .filter((step) => HOW_TO_USE_ACTION_RE.test(step)),
  );
  if (cleanedFromSteps.length >= 1) return cleanedFromSteps;
  const cleanedFromRaw = splitHowToUseFragments(rawText)
    .filter((step) => !HOW_TO_USE_NOISE_RE.test(step))
    .filter((step) => HOW_TO_USE_ACTION_RE.test(step));
  return cleanedFromRaw.length >= 1 ? cleanedFromRaw : [];
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
  hideLowConfidenceActiveIngredients = false,
}: {
  activeIngredients?: ActiveIngredientsData | null;
  ingredientsInci?: IngredientsInciData | null;
  howToUse?: HowToUseData | null;
  hideLowConfidenceActiveIngredients?: boolean;
}) {
  const activeIngredientItems = getStructuredItems(activeIngredients?.items);
  const normalizedHowToUseRawText = String(howToUse?.raw_text || '').trim();
  const howToUseItems = sanitizeHowToUseItems(howToUse?.steps, normalizedHowToUseRawText);
  const normalizedIngredientsRawText = normalizeIngredientsRawText(
    String(ingredientsInci?.raw_text || ''),
    Boolean(activeIngredientItems.length || String(activeIngredients?.raw_text || '').trim()),
  );
  const ingredientsInciItems = dedupeIngredientItems(combineBrokenIngredientParts([
    ...getStructuredItems(ingredientsInci?.items)
      .map((item) => normalizeIngredientListItem(item))
      .filter((item) => item.length > 1 && !/^please be aware that ingredient lists/i.test(item))
      .filter((item) => isLikelyPureIngredientItem(item)),
    ...parseIngredientsFromText(normalizedIngredientsRawText),
  ]));
  const shouldHideActiveIngredients =
    hideLowConfidenceActiveIngredients &&
    activeIngredientItems.length <= 1 &&
    (ingredientsInciItems.length >= 4 || normalizedIngredientsRawText.length >= 80);
  const hasActiveIngredients = !shouldHideActiveIngredients && Boolean(
    activeIngredientItems.length || String(activeIngredients?.raw_text || '').trim(),
  );

  const hasContent = Boolean(
    hasActiveIngredients ||
      ingredientsInciItems.length ||
      howToUseItems.length ||
      normalizedIngredientsRawText,
  );

  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      {hasActiveIngredients ? (
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
          {ingredientsInciItems.length ? (
            <ul className="mt-3 space-y-2 pl-4 text-sm text-muted-foreground list-disc">
              {ingredientsInciItems.map((item, idx) => (
                <li key={`ingredients-inci-${idx}`}>{item}</li>
              ))}
            </ul>
          ) : null}
          {!ingredientsInciItems.length && normalizedIngredientsRawText ? (
            <div className="mt-3">
              <StructuredText text={normalizedIngredientsRawText} />
            </div>
          ) : null}
        </div>
      ) : null}

      {howToUseItems.length ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

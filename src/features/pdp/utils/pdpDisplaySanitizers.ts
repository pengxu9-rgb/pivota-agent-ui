import type {
  ActiveIngredientsData,
  DetailSection,
  HowToUseData,
  IngredientsInciData,
  ProductDetailsData,
} from '@/features/pdp/types';

const DETAIL_HEADING_NOISE_RE =
  /^(.*\bingredients?\b.*|active ingredients?|how to use|directions?|how to pair|about|our story|brand story|faq|questions?|warnings?|warning|caution)$/i;
const DETAIL_CONTENT_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge)\b/i;
const HOW_TO_USE_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|faq|question(?:s)?|about)\b/i;
const HOW_TO_USE_ACTION_RE =
  /\b(apply|use|massage|dispense|lather|rinse|pat|layer|follow|start|finish|take|swipe|smooth|spray|press|cleanse|shake|wet|dry|leave|reapply|mix|morning|night|am|pm)\b/i;
const INGREDIENT_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|peta-certified|vegan and cruelty-free|no worries|patch test|allerg(?:y|ic)|warning|warnings|caution|note:)\b/i;
const OVERVIEW_LIKE_HEADING_RE = /^(overview|details|product details?)$/i;

function normalizeWhitespace(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanStructuredItemValue(item: unknown): string {
  if (typeof item === 'string') return normalizeWhitespace(item);
  if (!item || typeof item !== 'object') return '';
  const typed = item as Record<string, unknown>;
  return normalizeWhitespace(
    typed.name || typed.title || typed.inci_name || typed.value || '',
  );
}

function stripIngredientLeadLabel(value: string): string {
  return normalizeWhitespace(value.replace(/^full ingredients:\s*/i, ''));
}

function ingredientCoreKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[\d\s,.-]+/, '')
    .replace(/[^a-z]+/g, '');
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

function isLikelyPureIngredientItem(value: string): boolean {
  const normalized = stripIngredientLeadLabel(value);
  if (!normalized) return false;
  if (INGREDIENT_NOISE_RE.test(normalized)) return false;
  if (normalized.includes(':')) return false;
  if (/[.!?]/.test(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount <= 16;
}

function cleanIngredientItems(
  items: unknown,
  rawText?: string | null,
): string[] {
  const explicitItems = Array.isArray(items)
    ? items.map((item) => stripIngredientLeadLabel(cleanStructuredItemValue(item))).filter(Boolean)
    : [];
  const fallbackItems =
    explicitItems.length > 0
      ? explicitItems
      : String(rawText || '')
          .split(/\s*,\s*/)
          .map((item) => stripIngredientLeadLabel(item))
          .filter(Boolean);

  return dedupeIngredientItems(
    combineBrokenIngredientParts(fallbackItems).filter((item) => isLikelyPureIngredientItem(item)),
  );
}

function cleanHowToUseSteps(steps: unknown, rawText?: string | null): string[] {
  const sourceSteps = Array.isArray(steps)
    ? steps.map((step) => normalizeWhitespace(step))
    : String(rawText || '')
        .split(/\n+/)
        .map((step) => normalizeWhitespace(step));

  return sourceSteps.filter((step) => {
    if (!step) return false;
    if (HOW_TO_USE_NOISE_RE.test(step)) return false;
    if (step.length > 220) return false;
    return HOW_TO_USE_ACTION_RE.test(step);
  });
}

function filterDetailSections(
  data: ProductDetailsData | null | undefined,
  options: { hasStructuredBlocks: boolean },
): DetailSection[] {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  return sections.filter((section) => {
    const heading = normalizeWhitespace(section.heading);
    const content = normalizeWhitespace(section.content);
    if (!heading && !content) return false;
    if (options.hasStructuredBlocks && DETAIL_HEADING_NOISE_RE.test(heading)) return false;
    if (DETAIL_CONTENT_NOISE_RE.test(content) && !OVERVIEW_LIKE_HEADING_RE.test(heading)) return false;
    return true;
  });
}

function sectionKey(section: DetailSection): string {
  return `${normalizeWhitespace(section.heading).toLowerCase()}::${normalizeWhitespace(section.content).toLowerCase()}`;
}

function pushUniqueSection(sections: DetailSection[], seen: Set<string>, section: DetailSection | null | undefined) {
  if (!section) return;
  const key = sectionKey(section);
  if (!key || seen.has(key)) return;
  seen.add(key);
  sections.push(section);
}

export function sanitizeActiveIngredientsData(
  data: ActiveIngredientsData | null | undefined,
): ActiveIngredientsData | null {
  if (!data) return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map((item) => cleanStructuredItemValue(item))
        .filter(Boolean)
        .filter((item) => !INGREDIENT_NOISE_RE.test(item))
    : [];
  const rawText = items.length > 0 ? '' : normalizeWhitespace(data.raw_text);
  if (!items.length && !rawText) return null;
  return {
    ...data,
    items,
    ...(rawText ? { raw_text: rawText } : {}),
  };
}

export function sanitizeIngredientsInciData(
  data: IngredientsInciData | null | undefined,
): IngredientsInciData | null {
  if (!data) return null;
  const items = cleanIngredientItems(data.items, data.raw_text || null);
  if (!items.length) return null;
  return {
    ...data,
    items,
    raw_text: items.join(', '),
  };
}

export function sanitizeHowToUseData(
  data: HowToUseData | null | undefined,
): HowToUseData | null {
  if (!data) return null;
  const steps = cleanHowToUseSteps(data.steps, data.raw_text || null);
  if (!steps.length) return null;
  return {
    ...data,
    steps,
    raw_text: steps.join('\n'),
  };
}

export function chooseProductDetailsData(args: {
  productFacts?: ProductDetailsData | null;
  legacyDetails?: ProductDetailsData | null;
  hasStructuredBlocks: boolean;
}): ProductDetailsData | null {
  const factsSections = filterDetailSections(args.productFacts, {
    hasStructuredBlocks: args.hasStructuredBlocks,
  });
  const legacySections = filterDetailSections(args.legacyDetails, {
    hasStructuredBlocks: args.hasStructuredBlocks,
  });

  const overviewIndex = legacySections.findIndex((section) =>
    OVERVIEW_LIKE_HEADING_RE.test(normalizeWhitespace(section.heading)),
  );
  const overviewSection =
    (overviewIndex >= 0 ? legacySections[overviewIndex] : legacySections[0]) || null;

  if (factsSections.length > 0) {
    const mergedSections: DetailSection[] = [];
    const seen = new Set<string>();

    pushUniqueSection(mergedSections, seen, overviewSection);
    for (const section of factsSections) {
      pushUniqueSection(mergedSections, seen, section);
    }
    for (let index = 0; index < legacySections.length; index += 1) {
      const section = legacySections[index];
      if (!section || (overviewSection && section === overviewSection)) continue;
      pushUniqueSection(mergedSections, seen, section);
    }

    return mergedSections.length ? { sections: mergedSections } : { sections: factsSections };
  }

  return legacySections.length ? { sections: legacySections } : null;
}

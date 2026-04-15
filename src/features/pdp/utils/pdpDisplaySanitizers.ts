import type {
  ActiveIngredientsData,
  DetailSection,
  HowToUseData,
  IngredientsInciData,
  ProductDetailsData,
} from '@/features/pdp/types';

const DETAIL_HEADING_NOISE_RE =
  /^(.*\bingredients?\b.*|active ingredients?|how to use|directions?|how to pair|materials?|material composition|fabric|composition|care|care instructions?|cleaning|wash(?:ing)? instructions?|storage|specifications?|specs?|dimensions?|capacity|weight|size(?: & fit)?|fit|sizing|size guide|measurements?|usage|safety|warranty|about|our story|brand story|faq|questions?|warnings?|warning|caution)$/i;
const DETAIL_CONTENT_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge)\b/i;
const HOW_TO_USE_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|faq|question(?:s)?|about)\b/i;
const HOW_TO_USE_ACTION_RE =
  /\b(apply|use|massage|dispense|lather|rinse|pat|layer|follow|start|finish|take|swipe|smooth|spray|press|cleanse|shake|wet|dry|leave|reapply|mix|morning|night|am|pm)\b/i;
const INGREDIENT_NOISE_RE =
  /\b(shop now|pair with|our story|product philosophy|sustainability|inclusivity pledge|peta-certified|vegan and cruelty-free|no worries|patch test|allerg(?:y|ic)|warning|warnings|caution|note:)\b/i;
const OVERVIEW_LIKE_HEADING_RE = /^(overview|details|product details?)$/i;
const SECTION_SOUP_LABEL_RE =
  /(^|[\n\r.;•|])\s*(description|details?|overview|benefits?|clinical results?|results?|proven results?|key ingredients?|why it works|texture|finish|coverage|free of|set includes|best for|formulation|what else you should know|good to know|ingredients?|active ingredients?|how to use|how to apply|directions?|faq|frequently asked questions?|q\s*&\s*a|questions?)\s*:?\s*(?=[A-Z0-9])/gi;

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

function countSectionSoupLabels(value: string): number {
  SECTION_SOUP_LABEL_RE.lastIndex = 0;
  let count = 0;
  while (SECTION_SOUP_LABEL_RE.exec(value)) count += 1;
  return count;
}

function looksLikeSectionSoupText(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return countSectionSoupLabels(text) >= 2;
}

export function hasLowQualityOverviewSection(
  data: ProductDetailsData | null | undefined,
): boolean {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const overviewSection =
    sections.find((section) =>
      OVERVIEW_LIKE_HEADING_RE.test(normalizeWhitespace(section.heading)),
    ) || sections[0];
  if (!overviewSection) return false;
  return looksLikeSectionSoupText(overviewSection.content);
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
  productOverview?: ProductDetailsData | null;
  supplementalDetails?: ProductDetailsData | null;
  hasStructuredBlocks: boolean;
}): ProductDetailsData | null {
  const factsSections = filterDetailSections(args.productFacts, {
    hasStructuredBlocks: args.hasStructuredBlocks,
  });
  const overviewSections = filterDetailSections(args.productOverview, {
    hasStructuredBlocks: args.hasStructuredBlocks,
  });
  const supplementalSections = filterDetailSections(args.supplementalDetails, {
    hasStructuredBlocks: args.hasStructuredBlocks,
  });

  const overviewIndex = overviewSections.findIndex((section) =>
    OVERVIEW_LIKE_HEADING_RE.test(normalizeWhitespace(section.heading)),
  );
  const overviewSection =
    (overviewIndex >= 0 ? overviewSections[overviewIndex] : overviewSections[0]) || null;

  if (factsSections.length > 0) {
    const mergedSections: DetailSection[] = [];
    const seen = new Set<string>();

    pushUniqueSection(mergedSections, seen, overviewSection);
    for (const section of factsSections) {
      pushUniqueSection(mergedSections, seen, section);
    }
    for (let index = 0; index < overviewSections.length; index += 1) {
      const section = overviewSections[index];
      if (!section || (overviewSection && section === overviewSection)) continue;
      pushUniqueSection(mergedSections, seen, section);
    }
    for (const section of supplementalSections) {
      pushUniqueSection(mergedSections, seen, section);
    }

    return mergedSections.length ? { sections: mergedSections } : { sections: factsSections };
  }

  const mergedSections: DetailSection[] = [];
  const seen = new Set<string>();
  for (const section of overviewSections) {
    pushUniqueSection(mergedSections, seen, section);
  }
  for (const section of supplementalSections) {
    pushUniqueSection(mergedSections, seen, section);
  }
  return mergedSections.length ? { sections: mergedSections } : null;
}

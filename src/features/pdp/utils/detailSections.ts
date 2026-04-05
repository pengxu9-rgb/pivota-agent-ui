import type { DetailSection } from '@/features/pdp/types';
import { formatDescriptionText } from '@/features/pdp/utils/formatDescriptionText';

const OVERVIEW_SECTION_HEADING_RE = /^(overview|product details|details|about|description)$/i;
const STRUCTURED_SECTION_HEADING_RE =
  /^(ingredients|key ingredients|active ingredients?|how to use|directions|warnings?|warning|caution)$/i;
const BRAND_STORY_HEADING_RE = /(?:brand|story)/i;

function normalizeKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeDetailSection(section: DetailSection | null | undefined): DetailSection | null {
  if (!section) return null;
  const content = formatDescriptionText(section.content);
  if (!content) return null;
  const heading = String(section.heading || '').trim() || 'Details';
  return {
    ...section,
    heading,
    content,
  };
}

function dedupeSections(sections: DetailSection[]): DetailSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = `${normalizeKey(section.heading)}::${normalizeKey(section.content)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function partitionDetailSections(sections: DetailSection[] | null | undefined): {
  overviewSection?: DetailSection;
  supplementalSections: DetailSection[];
  brandStorySection?: DetailSection;
} {
  const normalizedSections = dedupeSections(
    (Array.isArray(sections) ? sections : [])
      .map((section) => normalizeDetailSection(section))
      .filter(Boolean) as DetailSection[],
  );

  if (!normalizedSections.length) {
    return {
      overviewSection: undefined,
      supplementalSections: [],
      brandStorySection: undefined,
    };
  }

  const brandStorySection = normalizedSections.find((section) =>
    BRAND_STORY_HEADING_RE.test(section.heading),
  );

  const overviewIndex = normalizedSections.findIndex((section) => {
    if (BRAND_STORY_HEADING_RE.test(section.heading)) return false;
    if (STRUCTURED_SECTION_HEADING_RE.test(section.heading)) return false;
    return true;
  });

  const fallbackOverviewIndex = normalizedSections.findIndex(
    (section) => !BRAND_STORY_HEADING_RE.test(section.heading),
  );
  const selectedOverviewIndex =
    overviewIndex >= 0 ? overviewIndex : fallbackOverviewIndex >= 0 ? fallbackOverviewIndex : 0;
  const overviewSection = normalizedSections[selectedOverviewIndex];

  const supplementalSections = normalizedSections.filter((section, index) => {
    if (index === selectedOverviewIndex) return false;
    if (BRAND_STORY_HEADING_RE.test(section.heading)) return false;
    if (STRUCTURED_SECTION_HEADING_RE.test(section.heading)) return false;
    if (OVERVIEW_SECTION_HEADING_RE.test(section.heading)) return false;
    return true;
  });

  return {
    overviewSection,
    supplementalSections,
    brandStorySection,
  };
}

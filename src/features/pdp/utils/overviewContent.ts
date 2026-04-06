import type { DetailSection } from '@/features/pdp/types';
import {
  formatDescriptionText,
  isLikelyHeadingParagraph,
  splitParagraphs,
} from '@/features/pdp/utils/formatDescriptionText';

export type OverviewFact = {
  label: string;
  value: string;
};

export type OverviewContent = {
  eyebrow?: string;
  summary: string;
  highlights: string[];
  facts: OverviewFact[];
  body: string[];
};

const GENERIC_SECTION_HEADING_RE = /^(overview|product details|details|about|description)$/i;
const STRUCTURED_DUPLICATE_HEADING_RE =
  /^(ingredients|key ingredients|active ingredients?|how to use|directions|warnings?|warning|caution)$/i;
const HIGHLIGHT_HEADING_RE =
  /^(benefits?|features?|highlights?|results?|at a glance|why(?: you(?:'|’)ll| youll)? love it|best for)$/i;
const FACT_LABEL_RE = /^([A-Za-z][A-Za-z0-9 '&/()+-]{1,32}):\s*(.{2,180})$/;
const INLINE_FACT_LABELS = [
  'Key Notes',
  'Skin Type',
  'Skin Concern',
  'Finish',
  'Coverage',
  'Best For',
];
const INLINE_HIGHLIGHT_LABELS = [
  'Benefits',
  'Features',
  'Highlights',
  'Results',
  'Why You’ll Love It',
  "Why You'll Love It",
  'Set Includes',
  'Shades Included',
  'What Else You Need To Know',
  'Free From',
];
const INLINE_LABELS = [...INLINE_FACT_LABELS, ...INLINE_HIGHLIGHT_LABELS].sort(
  (a, b) => b.length - a.length,
);
const INLINE_LABEL_RE = new RegExp(
  `(?<![A-Za-z])(?:${INLINE_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z])`,
  'gi',
);
const SHORT_FACT_LABELS = new Set(INLINE_FACT_LABELS.map((label) => normalizeKey(label)));
const INLINE_NARRATIVE_SPLIT_RE = /\s+(?=(?:The|This|These|Each|A|An|Our|Its|It)\b)/;

function normalizeKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFacts(items: OverviewFact[]): OverviewFact[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(item.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanLine(value: string): string {
  return String(value || '')
    .replace(/^[\s\-•*]+/, '')
    .replace(/^[:\-–•]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHighlightItem(value: string): string {
  const cleaned = cleanLine(value);
  if (!cleaned) return '';
  return /^free from\b/i.test(cleaned)
    ? cleaned.replace(/^free from\b/i, 'Free from')
    : cleaned;
}

function splitEmbeddedHighlightLabels(value: string, activeLabel?: string): string[] {
  let normalized = cleanLine(value);
  if (!normalized) return [];
  const activeKey = normalizeKey(activeLabel || '');

  for (const candidate of INLINE_HIGHLIGHT_LABELS) {
    const candidateKey = normalizeKey(candidate);
    if (!candidateKey || candidateKey === activeKey) continue;
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized
      .replace(new RegExp(`([.!?])\\s+(${escaped})(?=\\s+[A-Z0-9])`, 'gi'), '$1\n$2 ')
      .replace(new RegExp(`\\s+(${escaped})(?=\\s+[A-Z0-9])`, 'gi'), '\n$1 ');
  }

  return normalized
    .split('\n')
    .map((item) => normalizeHighlightItem(item))
    .filter((item) => item.length >= 6);
}

function splitHighlightFragments(value: string): string[] {
  const normalized = cleanLine(value);
  if (!normalized) return [];
  return normalized
    .split(/[•;]+|\s{2,}/)
    .flatMap((item) => splitEmbeddedHighlightLabels(item))
    .filter((item) => item.length >= 6);
}

function splitSentences(value: string): string[] {
  return String(value || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 18);
}

function isCoverageEquivalent(a: string, b: string): boolean {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter < 18) return false;
  return longer > 0 && (left.includes(right) || right.includes(left)) && shorter / longer >= 0.72;
}

function formatEyebrow(heading: string | null | undefined): string | undefined {
  const text = String(heading || '').trim();
  if (!text || GENERIC_SECTION_HEADING_RE.test(text)) return undefined;
  return text;
}

function dedupeParagraphs(items: string[]): string[] {
  return uniqueStrings(items.map((item) => item.trim()).filter(Boolean));
}

function normalizeInlineLabel(label: string): string {
  const key = normalizeKey(label);
  return (
    INLINE_LABELS.find((candidate) => normalizeKey(candidate) === key) ||
    String(label || '').trim()
  );
}

function isFactLabel(label: string): boolean {
  const key = normalizeKey(label);
  return INLINE_FACT_LABELS.some((candidate) => normalizeKey(candidate) === key);
}

function isHighlightLabel(label: string): boolean {
  const key = normalizeKey(label);
  return INLINE_HIGHLIGHT_LABELS.some((candidate) => normalizeKey(candidate) === key);
}

function extractInlineLabelSegments(text: string): Array<{ label: string; value: string }> {
  const input = String(text || '').replace(/\s+/g, ' ').trim();
  if (!input) return [];
  INLINE_LABEL_RE.lastIndex = 0;
  const matches = Array.from(input.matchAll(INLINE_LABEL_RE))
    .map((match) => ({
      label: normalizeInlineLabel(match[0] || ''),
      index: match.index ?? 0,
      raw: match[0] || '',
    }))
    .filter((match) => match.label);

  if (!matches.length) return [];

  return matches
    .map((match, idx) => {
      const next = matches[idx + 1];
      const value = cleanLine(
        input.slice(match.index + match.raw.length, next ? next.index : input.length),
      );
      return {
        label: match.label,
        value,
      };
    })
    .filter((segment) => segment.value);
}

function splitFactValueFromNarrative(label: string, value: string): { factValue: string; narrative: string } {
  const cleaned = cleanLine(value);
  if (!cleaned) return { factValue: '', narrative: '' };
  const labelKey = normalizeKey(label);
  if (!SHORT_FACT_LABELS.has(labelKey)) {
    return { factValue: cleaned, narrative: '' };
  }
  const narrativeMatch = cleaned.match(INLINE_NARRATIVE_SPLIT_RE);
  if (narrativeMatch?.index && narrativeMatch.index > 0) {
    const factValue = cleanLine(cleaned.slice(0, narrativeMatch.index));
    const narrative = cleanLine(cleaned.slice(narrativeMatch.index));
    if (factValue.split(/\s+/).length <= 6) {
      return { factValue, narrative };
    }
  }
  return { factValue: cleaned, narrative: '' };
}

function extractHighlightItems(label: string, value: string): { items: string[]; narrative: string[] } {
  let cleaned = cleanLine(value);
  if (!cleaned) return { items: [], narrative: [] };
  const labelKey = normalizeKey(label);

  if (labelKey === normalizeKey('free from')) {
    return {
      items: [`Free from ${cleaned}`],
      narrative: [],
    };
  }

  const bulletSplit = cleaned
    .replace(/\s+[•·]\s+/g, '\n')
    .replace(/\s+-\s+/g, '\n')
    .split('\n')
    .flatMap((item) => splitEmbeddedHighlightLabels(item, label))
    .filter(Boolean);

  if (bulletSplit.length > 1) {
    const items = bulletSplit.filter((item) => item.length >= 6 && !/:$/.test(item)).slice(0, 4);
    return { items, narrative: [] };
  }

  if (labelKey === normalizeKey('shades included')) {
    const sentences = splitSentences(cleaned);
    if (sentences.length) {
      const shade = cleanLine(cleaned.slice(0, cleaned.indexOf(sentences[0])).trim());
      return {
        items: shade ? [shade] : [],
        narrative: sentences.slice(0, 1),
      };
    }
  }

  const sentences = splitSentences(cleaned);
  if (sentences.length > 1) {
    return {
      items: uniqueStrings(
        sentences
          .slice(0, 3)
          .flatMap((item) => splitEmbeddedHighlightLabels(item, label))
          .filter((item) => item.length <= 140),
      ),
      narrative: [],
    };
  }

  return {
    items: cleaned.length <= 140 ? splitEmbeddedHighlightLabels(cleaned, label) : [],
    narrative: cleaned.length > 140 ? [cleaned] : [],
  };
}

function finalizeBodyParagraphs(
  paragraphs: string[],
  summary: string,
  facts: OverviewFact[],
  highlights: string[],
): string[] {
  const coverageItems = [
    summary,
    ...highlights,
    ...facts.flatMap((item) => [item.value, `${item.label}: ${item.value}`, item.label]),
  ].filter(Boolean);

  return uniqueStrings(paragraphs)
    .filter((paragraph) => normalizeKey(paragraph) !== normalizeKey(summary))
    .filter((paragraph) => paragraph.length >= 18 || /[.?!]/.test(paragraph))
    .filter(
      (paragraph) => !coverageItems.some((covered) => isCoverageEquivalent(paragraph, covered)),
    )
    .slice(0, 3);
}

function collectInlineSegments(
  paragraph: string,
  facts: OverviewFact[],
  highlightCandidates: string[],
  paragraphCandidates: string[],
  hideStructuredDuplicates: boolean,
) {
  const segments = extractInlineLabelSegments(paragraph);
  if (!segments.length) return false;

  const firstLabel = normalizeKey(segments[0]?.label || '');
  const beginsWithLabel =
    firstLabel &&
    normalizeKey(paragraph).startsWith(firstLabel);
  if (!beginsWithLabel && segments.length < 2) return false;

  let consumed = false;
  for (const segment of segments) {
    const labelKey = normalizeKey(segment.label);
    if (hideStructuredDuplicates && STRUCTURED_DUPLICATE_HEADING_RE.test(labelKey)) {
      consumed = true;
      continue;
    }

    if (INLINE_FACT_LABELS.some((label) => normalizeKey(label) === labelKey)) {
      const { factValue, narrative } = splitFactValueFromNarrative(segment.label, segment.value);
      if (factValue) {
        facts.push({ label: segment.label, value: factValue });
        consumed = true;
      }
      if (narrative) paragraphCandidates.push(narrative);
      continue;
    }

    if (INLINE_HIGHLIGHT_LABELS.some((label) => normalizeKey(label) === labelKey)) {
      const { items, narrative } = extractHighlightItems(segment.label, segment.value);
      if (items.length) {
        highlightCandidates.push(...items);
        consumed = true;
      }
      if (narrative.length) paragraphCandidates.push(...narrative);
      continue;
    }

    paragraphCandidates.push(segment.value);
  }

  return consumed;
}

function shouldPreferLineParsing(paragraph: string): boolean {
  if (!paragraph.includes('\n')) return false;
  const rawLines = paragraph
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (rawLines.length < 2) return false;

  return rawLines.some((line) => FACT_LABEL_RE.test(cleanLine(line))) ||
    rawLines.some((line) => {
      const cleaned = cleanLine(line);
      const normalized = normalizeKey(cleaned);
      return (
        cleaned.length <= 32 &&
        !/[.?!]/.test(cleaned) &&
        (isFactLabel(cleaned) || isHighlightLabel(cleaned) || HIGHLIGHT_HEADING_RE.test(normalized))
      );
    });
}

type BuildOverviewContentArgs = {
  description?: string | null;
  section?: DetailSection | null;
  hideStructuredDuplicates?: boolean;
};

export function buildOverviewContent(args: BuildOverviewContentArgs): OverviewContent | null {
  const description = formatDescriptionText(args.description);
  const sectionContent = formatDescriptionText(args.section?.content);
  const paragraphs = dedupeParagraphs(
    splitParagraphs([description, sectionContent].filter(Boolean).join('\n\n')),
  );

  if (!paragraphs.length) return null;

  const facts: OverviewFact[] = [];
  const highlightCandidates: string[] = [];
  const paragraphCandidates: string[] = [];

  let currentHeading = '';

  for (const paragraph of paragraphs) {
    if (isLikelyHeadingParagraph(paragraph)) {
      currentHeading = paragraph;
      continue;
    }

    if (args.hideStructuredDuplicates && STRUCTURED_DUPLICATE_HEADING_RE.test(normalizeKey(currentHeading))) {
      currentHeading = '';
      continue;
    }

    if (!shouldPreferLineParsing(paragraph)) {
      const consumedInline = collectInlineSegments(
        paragraph,
        facts,
        highlightCandidates,
        paragraphCandidates,
        args.hideStructuredDuplicates === true,
      );
      if (consumedInline) {
        currentHeading = '';
        continue;
      }
    }

    if (currentHeading && isFactLabel(currentHeading)) {
      const { factValue, narrative } = splitFactValueFromNarrative(
        normalizeInlineLabel(currentHeading),
        paragraph,
      );
      if (factValue) {
        facts.push({
          label: normalizeInlineLabel(currentHeading),
          value: factValue,
        });
        if (narrative) paragraphCandidates.push(narrative);
        currentHeading = '';
        continue;
      }
    }

    if (currentHeading && isHighlightLabel(currentHeading)) {
      const { items, narrative } = extractHighlightItems(
        normalizeInlineLabel(currentHeading),
        paragraph,
      );
      if (items.length || narrative.length) {
        if (items.length) highlightCandidates.push(...items);
        if (narrative.length) paragraphCandidates.push(...narrative);
        currentHeading = '';
        continue;
      }
    }

    const remainingLines: string[] = [];
    let paragraphHeading = currentHeading;

    for (const rawLine of paragraph.split('\n')) {
      const line = cleanLine(rawLine);
      if (!line) continue;
      const normalizedLine = normalizeKey(line);
      if (
        line.length <= 32 &&
        !/[.?!]/.test(line) &&
        (HIGHLIGHT_HEADING_RE.test(normalizedLine) || STRUCTURED_DUPLICATE_HEADING_RE.test(normalizedLine))
      ) {
        paragraphHeading = line;
        continue;
      }
      const activeHeading = normalizeKey(paragraphHeading);
      if (args.hideStructuredDuplicates && STRUCTURED_DUPLICATE_HEADING_RE.test(activeHeading)) {
        continue;
      }
      const factMatch = line.match(FACT_LABEL_RE);
      if (factMatch) {
        let label = cleanLine(factMatch[1] || '');
        const prefix = remainingLines[remainingLines.length - 1];
        if (
          prefix &&
          prefix.length <= 18 &&
          /^[A-Za-z][A-Za-z0-9 '&/()+-]*$/.test(prefix) &&
          !HIGHLIGHT_HEADING_RE.test(normalizeKey(prefix))
        ) {
          label = `${prefix} ${label}`.trim();
          remainingLines.pop();
        }
        facts.push({
          label,
          value: cleanLine(factMatch[2] || ''),
        });
        continue;
      }

      if (
        /^[\s\-•*]+/.test(rawLine) ||
        (HIGHLIGHT_HEADING_RE.test(activeHeading) && line.length >= 12)
      ) {
        highlightCandidates.push(...splitHighlightFragments(line));
        continue;
      }

      remainingLines.push(line);
    }

    const normalizedParagraph = remainingLines.join(' ').replace(/\s+/g, ' ').trim();
    if (!normalizedParagraph) continue;
    paragraphCandidates.push(normalizedParagraph);
    currentHeading = '';
  }

  const summary = paragraphCandidates[0] || '';
  const normalizedFacts = uniqueFacts(
    facts.filter((item) => item.label.length >= 2 && item.value.length >= 2),
  ).slice(0, 4);
  let highlights = uniqueStrings(highlightCandidates)
    .flatMap((item) => splitEmbeddedHighlightLabels(item))
    .filter(
      (item) =>
        !normalizedFacts.some((fact) => isCoverageEquivalent(item, fact.value)) &&
        !isCoverageEquivalent(item, summary),
    )
    .slice(0, 4);

  if (!highlights.length) {
    const fallbackHighlightCandidates: string[] = [];
    collectInlineSegments(
      paragraphs.join(' '),
      [],
      fallbackHighlightCandidates,
      [],
      args.hideStructuredDuplicates === true,
    );
    highlights = uniqueStrings(fallbackHighlightCandidates).slice(0, 4);
  }

  if (!highlights.length) {
    const derived = uniqueStrings(
      paragraphCandidates
        .slice(0, 2)
        .flatMap((paragraph) => splitSentences(paragraph))
        .filter((sentence) => normalizeKey(sentence) !== normalizeKey(summary) && sentence.length <= 140),
    );
    highlights = derived.slice(0, 3);
  }

  const body = finalizeBodyParagraphs(paragraphCandidates.slice(1), summary, normalizedFacts, highlights);

  if (!summary && !highlights.length && !normalizedFacts.length && !body.length) return null;

  return {
    ...(formatEyebrow(args.section?.heading) ? { eyebrow: formatEyebrow(args.section?.heading) } : {}),
    summary,
    highlights,
    facts: normalizedFacts,
    body,
  };
}

import type { Variant } from '@/features/pdp/types';

export const VARIANT_PLACEHOLDER_TITLE_RE = /^(default(?: title)?|variant(?:\s+\d+)?)$/i;

function normalizeComparableLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPlaceholderVariantTitle(title: unknown): boolean {
  const normalized = String(title || '').trim();
  return !normalized || VARIANT_PLACEHOLDER_TITLE_RE.test(normalized);
}

function isPlaceholderTitleOption(option: { name?: unknown; value?: unknown } | null | undefined): boolean {
  const normalizedName = String(option?.name || '').trim().toLowerCase();
  return normalizedName === 'title' && isPlaceholderVariantTitle(option?.value);
}

export function getVariantOptionSummary(options: Variant['options'] | undefined): string {
  if (!Array.isArray(options) || !options.length) return '';
  return options
    .filter((option) => !isPlaceholderTitleOption(option))
    .map((option) => String(option?.value || '').trim())
    .filter(Boolean)
    .join(' · ');
}

export function getDisplayVariantLabel(
  variant: Pick<Variant, 'title' | 'options'> | undefined,
  fallbackLabel = 'Default option',
): string {
  const title = String(variant?.title || '').trim();
  const optionSummary = getVariantOptionSummary(variant?.options);
  if (!isPlaceholderVariantTitle(title)) return title;
  if (optionSummary) return optionSummary;
  return fallbackLabel;
}

export function getDisplayVariantMeta(
  variant: Pick<Variant, 'title' | 'options'> | undefined,
): string {
  const optionSummary = getVariantOptionSummary(variant?.options);
  if (!optionSummary) return '';
  const label = getDisplayVariantLabel(variant);
  if (normalizeComparableLabel(label) === normalizeComparableLabel(optionSummary)) return '';
  return optionSummary;
}

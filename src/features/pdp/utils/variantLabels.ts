import type { Variant } from '@/features/pdp/types';

export const VARIANT_PLACEHOLDER_TITLE_RE = /^(default(?: title)?|variant(?:\s+\d+)?)$/i;

const NON_DISPLAYABLE_IDENTITY_OPTION_NAMES = new Set([
  'offer',
  'sku',
  'sku id',
  'variant sku',
  'barcode',
  'upc',
  'ean',
  'gtin',
  'product id',
  'variant id',
]);

const GENERIC_VARIANT_OPTION_NAMES = new Set([
  'option',
  'variant',
  'title',
  'selection',
]);

function normalizeComparableLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeOptionName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isLikelyVariantIdentityText(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  const compact = normalized.replace(/[\s-]+/g, '');
  if (/^\d{8,14}$/.test(compact)) return true;
  return /^[a-z]{0,4}\d{6,}[a-z0-9-]*$/i.test(normalized) && normalized.length >= 8 && !/\s/.test(normalized);
}

export function isPlaceholderVariantTitle(title: unknown): boolean {
  const normalized = String(title || '').trim();
  return !normalized || VARIANT_PLACEHOLDER_TITLE_RE.test(normalized);
}

function isDisplayableVariantTitle(title: unknown): boolean {
  return !isPlaceholderVariantTitle(title) && !isLikelyVariantIdentityText(title);
}

function isPlaceholderVariantOptionValue(option: NonNullable<Variant['options']>[number] | undefined): boolean {
  const name = String(option?.name || '').trim().toLowerCase();
  if (name !== 'title') return false;
  return isPlaceholderVariantTitle(option?.value);
}

function isNonDisplayableVariantOption(option: NonNullable<Variant['options']>[number] | undefined): boolean {
  if (!option || isPlaceholderVariantOptionValue(option)) return true;
  const name = normalizeOptionName(option.name);
  const value = String(option.value || '').trim();
  if (!name || !value) return true;
  if (NON_DISPLAYABLE_IDENTITY_OPTION_NAMES.has(name)) return isLikelyVariantIdentityText(value);
  if (GENERIC_VARIANT_OPTION_NAMES.has(name)) return isLikelyVariantIdentityText(value);
  return false;
}

export function getDisplayableVariantOptions(
  options: Variant['options'] | undefined,
): NonNullable<Variant['options']> {
  if (!Array.isArray(options) || !options.length) return [];
  return options.filter((option) => !isNonDisplayableVariantOption(option));
}

export function hasDisplayableVariantOptions(
  variant: Pick<Variant, 'options'> | undefined,
): boolean {
  return getDisplayableVariantOptions(variant?.options).length > 0;
}

export function getVariantOptionSummary(options: Variant['options'] | undefined): string {
  return getDisplayableVariantOptions(options)
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
  if (isDisplayableVariantTitle(title)) return title;
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

export function isHiddenVariantForSelector(
  variant: Pick<Variant, 'title' | 'options' | 'hidden_from_selector' | 'source_quality_status'> | undefined,
): boolean {
  if (!variant) return true;
  if (variant.hidden_from_selector === true) return true;
  const title = String(variant.title || '').trim();
  const hasDisplayableOptions = hasDisplayableVariantOptions(variant);
  const qualityStatus = String(variant.source_quality_status || '').trim().toLowerCase();
  if (!hasDisplayableOptions && !isDisplayableVariantTitle(title)) return true;
  if (qualityStatus === 'quarantined' && !hasDisplayableOptions) return true;
  return false;
}

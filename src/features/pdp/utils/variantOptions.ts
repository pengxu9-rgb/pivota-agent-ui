import type { Variant } from '@/features/pdp/types';

const COLOR_KEYS = ['color', 'colour', 'shade', 'tone'];
const SIZE_KEYS = ['size', 'fit'];
const BEAUTY_KEYS = [
  { label: 'Finish', keys: ['finish', 'texture'] },
  { label: 'Coverage', keys: ['coverage'] },
  { label: 'Undertone', keys: ['undertone', 'tone'] },
];

function normalizeOptionName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesKey(name: string, keys: string[]) {
  const lowered = normalizeOptionName(name);
  return keys.some((key) => lowered.includes(key));
}

export function isCombinedColorSizeOptionName(name: string): boolean {
  return matchesKey(name, COLOR_KEYS) && matchesKey(name, SIZE_KEYS);
}

function normalizeOptionValue(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseCombinedColorSizeValue(value: string): { color: string; size: string } | null {
  const parts = normalizeOptionValue(value)
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [color, size] = parts;
  if (!color || !size) return null;
  if (!/\d/.test(size) && !/\b(size|fit|pack|count)\b/i.test(size)) return null;
  return { color, size };
}

function getAxisFallbackValue(
  variant: Variant,
  axis: 'color' | 'size',
): string | undefined {
  const options = variant.options || [];
  const combinedOption = options.find((opt) => isCombinedColorSizeOptionName(String(opt?.name || '')));
  if (!combinedOption?.value) return undefined;
  const parsed = parseCombinedColorSizeValue(String(combinedOption.value));
  if (!parsed) return undefined;
  return axis === 'color' ? parsed.color : parsed.size;
}

export function normalizeVariantOptionNameForMatching(name: string): string {
  if (isCombinedColorSizeOptionName(name)) return 'color_size';
  const normalized = normalizeOptionName(name);
  if (!normalized) return '';
  if (matchesKey(name, COLOR_KEYS)) return 'color';
  if (matchesKey(name, SIZE_KEYS)) return 'size';
  return normalized;
}

export function getNormalizedVariantOptionValue(
  options: Array<{ name: string; value: string }> | undefined,
  normalizedKey: string,
): string | null {
  if (!Array.isArray(options) || !options.length) return null;
  const wanted = String(normalizedKey || '').trim().toLowerCase();
  if (!wanted) return null;

  const direct = options.find((opt) => normalizeVariantOptionNameForMatching(opt?.name || '') === wanted);
  if (direct?.value != null) {
    return normalizeOptionValue(String(direct.value)).toLowerCase();
  }

  if (wanted === 'color' || wanted === 'size') {
    const fallback = getAxisFallbackValue({ variant_id: '', title: '', options } as Variant, wanted);
    return fallback ? normalizeOptionValue(fallback).toLowerCase() : null;
  }

  return null;
}

function getOptionValueFromAxis(variant: Variant, axis: 'color' | 'size'): string | undefined {
  const options = variant.options || [];
  const direct = options.find(
    (opt) =>
      opt.name &&
      !isCombinedColorSizeOptionName(String(opt.name)) &&
      matchesKey(String(opt.name), axis === 'color' ? COLOR_KEYS : SIZE_KEYS),
  );
  if (direct?.value != null) return normalizeOptionValue(String(direct.value));
  return getAxisFallbackValue(variant, axis);
}

export function getOptionValue(variant: Variant, keys: string[]): string | undefined {
  const wantsColor = keys.length > 0 && keys.every((key) => COLOR_KEYS.includes(key));
  const wantsSize = keys.length > 0 && keys.every((key) => SIZE_KEYS.includes(key));
  if (wantsColor && !wantsSize) return getOptionValueFromAxis(variant, 'color');
  if (wantsSize && !wantsColor) return getOptionValueFromAxis(variant, 'size');
  const options = variant.options || [];
  const match = options.find(
    (opt) => opt.name && !isCombinedColorSizeOptionName(String(opt.name)) && matchesKey(String(opt.name), keys),
  );
  return match?.value != null ? normalizeOptionValue(String(match.value)) : undefined;
}

export function collectOptionValues(variants: Variant[], keys: string[]): string[] {
  const values = new Set<string>();
  variants.forEach((variant) => {
    const value = getOptionValue(variant, keys);
    if (value) values.add(String(value));
  });
  return Array.from(values);
}

export function collectColorOptions(variants: Variant[]) {
  return collectOptionValues(variants, COLOR_KEYS);
}

export function collectSizeOptions(variants: Variant[]) {
  return collectOptionValues(variants, SIZE_KEYS);
}

export function getStaticSizeOption(variants: Variant[]): string | null {
  const colorOptions = collectColorOptions(variants);
  const sizeOptions = collectSizeOptions(variants);
  if (colorOptions.length > 1 && sizeOptions.length === 1) {
    return sizeOptions[0];
  }
  return null;
}

export function findVariantByOptions(args: {
  variants: Variant[];
  color?: string | null;
  size?: string | null;
}): Variant | undefined {
  const { variants, color, size } = args;
  if (!color && !size) return undefined;

  return variants.find((variant) => {
    const colorValue = getOptionValue(variant, COLOR_KEYS);
    const sizeValue = getOptionValue(variant, SIZE_KEYS);
    const colorMatch = color ? colorValue === color : true;
    const sizeMatch = size ? sizeValue === size : true;
    return colorMatch && sizeMatch;
  });
}

export function extractAttributeOptions(variant: Variant): Array<{ name: string; value: string }> {
  const options = variant.options || [];
  return options
    .filter((opt) => opt?.name && opt?.value)
    .filter((opt) => !isCombinedColorSizeOptionName(String(opt.name)))
    .filter((opt) => !matchesKey(String(opt.name), COLOR_KEYS) && !matchesKey(String(opt.name), SIZE_KEYS))
    .filter((opt) => !BEAUTY_KEYS.some((beauty) => matchesKey(opt.name, beauty.keys)))
    .map((opt) => ({ name: String(opt.name), value: String(opt.value) }))
    .slice(0, 3);
}

export function extractBeautyAttributes(variant: Variant): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const meta = variant.beauty_meta || {};

  BEAUTY_KEYS.forEach((beauty) => {
    const fromMeta =
      beauty.label === 'Finish'
        ? meta.finish
        : beauty.label === 'Coverage'
          ? meta.coverage
          : meta.undertone;
    const fromOption = getOptionValue(variant, beauty.keys);
    const value = fromMeta || fromOption;
    if (value) {
      items.push({ label: beauty.label, value: String(value) });
    }
  });

  return items;
}

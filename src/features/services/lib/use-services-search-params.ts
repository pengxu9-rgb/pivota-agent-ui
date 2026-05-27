'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ServiceType, ServicesBrowseQuery } from './types';

const SERVICE_TYPES = new Set<ServiceType>([
  'facial',
  'dermatology-clinic',
  'skin-care',
  'body-care',
  'massage',
  'hair-cut',
  'hair-color',
  'hair-perm',
  'hair-treatment',
  'scalp-care',
  'lashes',
  'eyebrow-tattoo',
  'makeup',
  'bridal-makeup',
  'waxing',
  'nails',
]);

function readBoolean(value: string | null): boolean | undefined {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

function readPositiveInt(value: string | null): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function readServiceTypes(value: string | null): ServiceType[] | undefined {
  const serviceTypes = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is ServiceType => SERVICE_TYPES.has(part as ServiceType));
  return serviceTypes.length ? serviceTypes : undefined;
}

function writeFiltersToParams(filters: ServicesBrowseQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.english_friendly) params.set('english_friendly', '1');
  if (filters.priced_only) params.set('priced_only', '1');
  if (filters.walk_ins) params.set('walk_ins', '1');
  if (filters.service_type?.length) params.set('service_type', filters.service_type.join(','));
  if (filters.max_price_won) params.set('max_price_won', String(filters.max_price_won));
  if (filters.offset) params.set('offset', String(filters.offset));
  return params;
}

export function useServicesSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<ServicesBrowseQuery>(() => {
    return {
      ...(searchParams.get('q')?.trim() ? { q: searchParams.get('q')?.trim() } : {}),
      ...(readBoolean(searchParams.get('english_friendly')) ? { english_friendly: true } : {}),
      ...(readBoolean(searchParams.get('priced_only')) ? { priced_only: true } : {}),
      ...(readBoolean(searchParams.get('walk_ins')) ? { walk_ins: true } : {}),
      ...(readServiceTypes(searchParams.get('service_type'))
        ? { service_type: readServiceTypes(searchParams.get('service_type')) }
        : {}),
      ...(readPositiveInt(searchParams.get('max_price_won'))
        ? { max_price_won: readPositiveInt(searchParams.get('max_price_won')) }
        : {}),
      ...(readPositiveInt(searchParams.get('offset')) ? { offset: readPositiveInt(searchParams.get('offset')) } : {}),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (nextFilters: ServicesBrowseQuery) => {
      const params = writeFiltersToParams(nextFilters);
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const patch = useCallback(
    (partial: Partial<ServicesBrowseQuery>) => {
      setFilters({
        ...filters,
        ...partial,
        ...(partial.offset == null && partial.offset !== filters.offset ? { offset: undefined } : {}),
      });
    },
    [filters, setFilters],
  );

  const clear = useCallback(() => {
    setFilters({});
  }, [setFilters]);

  return { filters, setFilters, patch, clear };
}

'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatKST } from '@/features/services/lib/format';
import type { DayKey, ProviderHours } from '@/features/services/lib/types';

const DAY_ORDER: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

const SHORT_TO_KEY: Record<string, DayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

function todayKeyKST(): DayKey {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date());
  return SHORT_TO_KEY[short] || 'mon';
}

function formatRanges(ranges: ProviderHours[DayKey] | undefined): string {
  if (!ranges?.length) return 'Closed';
  return ranges.map((range) => `${range.open}–${range.close}`).join(', ');
}

export function HoursAccordion({ hours }: { hours?: ProviderHours }) {
  const [open, setOpen] = useState(false);
  const todayKey = useMemo(() => todayKeyKST(), []);
  const todayRanges = hours?.[todayKey] || [];
  const todayLabel = todayRanges.length ? `Open today · ${formatKST(formatRanges(todayRanges))}` : 'Closed today';

  return (
    <section className="mx-4 rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white shadow-[var(--pv-shadow-sm)] md:mx-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <Clock size={16} className="text-[var(--pv-teal)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--pv-ink)]">{todayLabel}</span>
        <ChevronDown
          size={16}
          className={cn('text-[var(--pv-ink-45)] transition-transform duration-200', open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--pv-border)] px-4 py-3">
          <div className="space-y-2">
            {DAY_ORDER.map((day) => {
              const isToday = day.key === todayKey;
              return (
                <div
                  key={day.key}
                  className={cn('grid grid-cols-[92px_1fr] text-[12px]', isToday ? 'font-semibold text-[var(--pv-ink)]' : 'text-[var(--pv-ink-60)]')}
                >
                  <div>{day.label}</div>
                  <div>{formatRanges(hours?.[day.key])}{hours?.[day.key]?.length ? ' KST' : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

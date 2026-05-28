'use client';

import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateChip, formatKST } from '@/features/services/lib/format';
import type { BookingDraftAction, BookingDraftState } from '@/features/services/lib/use-booking-draft';
import type { SlotChoice } from '@/features/services/lib/types';

const TIMES = ['11:00', '13:30', '15:00', '17:30', '19:00'];

// Backend requires the requested slot to be at least 60 minutes out. Add a
// small buffer so a slot can't go stale between selection and submit.
const MIN_LEAD_MS = 75 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextDays(): Date[] {
  return Array.from({ length: 14 }, (_, index) => addDays(new Date(), index));
}

// Slots are KST wall-clock; pin to +09:00 to compare against now.
function slotTimestamp(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}+09:00`).getTime();
}

function slotLabel(slot: SlotChoice): string {
  return `${slot.date} · ${formatKST(slot.time)}`;
}

type Props = {
  draft: BookingDraftState;
  dispatch: React.Dispatch<BookingDraftAction>;
};

export function BookingStepSlots({ draft, dispatch }: Props) {
  const days = nextDays();
  const minTimestamp = Date.now() + MIN_LEAD_MS;
  const dayHasValidTime = (value: string) => TIMES.some((time) => slotTimestamp(value, time) >= minTimestamp);
  const firstBookableDay = days.find((day) => dayHasValidTime(toIsoDay(day))) || days[0];
  const selectedDate = draft.preferred.date || toIsoDay(firstBookableDay);

  const setPreferred = (patch: Partial<SlotChoice>) => {
    dispatch({
      type: 'set_preferred',
      preferred: { ...draft.preferred, ...patch },
    });
  };

  const addAlternate = () => {
    if (draft.alternates.length >= 5) return;
    const next: SlotChoice = {
      date: draft.preferred.date || toIsoDay(days[Math.min(draft.alternates.length + 1, days.length - 1)]),
      time: draft.preferred.time || TIMES[(draft.alternates.length + 1) % TIMES.length],
    };
    dispatch({ type: 'set_alternates', alternates: [...draft.alternates, next] });
  };

  const removeAlternate = (index: number) => {
    dispatch({ type: 'set_alternates', alternates: draft.alternates.filter((_, itemIndex) => itemIndex !== index) });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-3 py-2 text-[12px] font-medium text-[var(--pv-tip-fg)]">
        Times shown are in KST. Providers confirm the final time within 24h.
      </div>

      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">Preferred day</div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {days.map((day) => {
            const value = toIsoDay(day);
            const active = (draft.preferred.date || selectedDate) === value;
            const dayDisabled = !dayHasValidTime(value);
            return (
              <button
                key={value}
                type="button"
                disabled={dayDisabled}
                onClick={() => setPreferred({ date: value })}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-2 text-[12px] font-semibold transition-colors',
                  dayDisabled
                    ? 'cursor-not-allowed border-[var(--pv-border)] bg-[var(--pv-paper-muted)] text-[var(--pv-ink-45)] opacity-50'
                    : active
                      ? 'border-[1.5px] border-[var(--pv-primary)] bg-[var(--pv-primary-50)] text-[var(--pv-primary)]'
                      : 'border-[var(--pv-border)] bg-white text-[var(--pv-ink-60)]',
                )}
              >
                {formatDateChip(day)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">Preferred time</div>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {TIMES.map((time) => {
            const active = draft.preferred.time === time;
            const timeDisabled = slotTimestamp(selectedDate, time) < minTimestamp;
            return (
              <button
                key={time}
                type="button"
                disabled={timeDisabled}
                onClick={() => setPreferred({ date: draft.preferred.date || selectedDate, time })}
                className={cn(
                  'h-10 rounded-full text-[12px] font-semibold transition-colors',
                  timeDisabled
                    ? 'cursor-not-allowed border border-[var(--pv-border)] bg-[var(--pv-paper-muted)] text-[var(--pv-ink-45)] opacity-50'
                    : active
                      ? 'bg-[var(--pv-ink)] text-white'
                      : 'border border-[var(--pv-border)] bg-white text-[var(--pv-ink)]',
                )}
              >
                {formatKST(time)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">Alternate slots</div>
            <div className="mt-0.5 text-[11px] text-[var(--pv-ink-45)]">Add up to 5 backup times.</div>
          </div>
          <button
            type="button"
            onClick={addAlternate}
            disabled={draft.alternates.length >= 5}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--pv-border)] bg-white px-3 text-[12px] font-semibold text-[var(--pv-ink)] disabled:opacity-45"
          >
            <Plus size={13} aria-hidden="true" />
            Add
          </button>
        </div>
        {draft.alternates.length ? (
          <div className="mt-3 space-y-2">
            {draft.alternates.map((slot, index) => (
              <div key={`${slot.date}:${slot.time}:${index}`} className="flex items-center justify-between gap-3 rounded-[var(--pv-radius-md)] border border-[var(--pv-border)] bg-white px-3 py-2">
                <div className="text-[12px] font-medium text-[var(--pv-ink)]">{slotLabel(slot)}</div>
                <button type="button" onClick={() => removeAlternate(index)} className="text-[var(--pv-coral)]" aria-label="Remove alternate slot">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

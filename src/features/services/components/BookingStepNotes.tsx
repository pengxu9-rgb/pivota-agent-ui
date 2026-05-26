'use client';

import type { BookingDraftAction, BookingDraftState } from '@/features/services/lib/use-booking-draft';

type Props = {
  draft: BookingDraftState;
  dispatch: React.Dispatch<BookingDraftAction>;
};

export function BookingStepNotes({ draft, dispatch }: Props) {
  const notes = draft.notes || '';

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[12px] font-semibold text-[var(--pv-ink)]">Notes for the provider</span>
        <textarea
          value={notes}
          maxLength={500}
          onChange={(event) => dispatch({ type: 'set_notes', notes: event.target.value })}
          placeholder="Skin concerns, allergies, timing constraints, or anything Pivota should translate."
          className="mt-1 min-h-[160px] w-full resize-none rounded-[var(--pv-radius-md)] border border-[var(--pv-border)] bg-white px-3 py-3 text-[14px] leading-relaxed text-[var(--pv-ink)] outline-none focus:border-[var(--pv-primary)]"
        />
      </label>
      <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--pv-ink-45)]">
        <span>Pivota translates your message to Korean before sending.</span>
        <span>{notes.length}/500</span>
      </div>
    </div>
  );
}

'use client';

import { X } from 'lucide-react';

export type FilterChipTone = 'purple' | 'coral' | 'teal';

export type FilterChip = {
  id: string;
  label: string;
  tone: FilterChipTone;
};

const TONE_STYLES: Record<FilterChipTone, { bg: string; fg: string }> = {
  purple: { bg: '#EEEDFE', fg: '#3C3489' },
  coral:  { bg: '#FAECE7', fg: '#993C1D' },
  teal:   { bg: '#E1F5EE', fg: '#0F6E56' },
};

type Props = {
  chips: FilterChip[];
  onRemove: (id: string) => void;
};

export function FilterChips({ chips, onRemove }: Props) {
  if (chips.length === 0) return null;

  return (
    <div className="overflow-x-auto px-3 py-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex gap-1.5 min-w-max">
        {chips.map((chip) => {
          const tone = TONE_STYLES[chip.tone];
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onRemove(chip.id)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity active:opacity-70"
              style={{ backgroundColor: tone.bg, color: tone.fg }}
              aria-label={`Remove filter ${chip.label}`}
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3" strokeWidth={2.2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

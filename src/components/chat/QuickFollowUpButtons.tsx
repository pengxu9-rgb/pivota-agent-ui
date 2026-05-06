'use client';

import { ArrowUpRight, Scale, Palette, Coins, Shirt, type LucideIcon } from 'lucide-react';

export type FollowUpIconName = 'scale' | 'palette' | 'coins' | 'shirt';

export type FollowUp = {
  id: string;
  label: string;
  icon: FollowUpIconName;
  prompt: string;
};

const ICONS: Record<FollowUpIconName, LucideIcon> = {
  scale: Scale,
  palette: Palette,
  coins: Coins,
  shirt: Shirt,
};

type Props = {
  items: FollowUp[];
  onSelect: (prompt: string) => void;
};

export function QuickFollowUpButtons({ items, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.prompt)}
            className="flex items-center justify-between gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-medium text-[#2C2C2A] transition-colors active:bg-[#EEEDFE]"
            style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.12)' }}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.7} />
              <span className="truncate">{item.label}</span>
            </span>
            <ArrowUpRight className="h-3 w-3 flex-shrink-0" strokeWidth={2} style={{ color: '#534AB7' }} />
          </button>
        );
      })}
    </div>
  );
}

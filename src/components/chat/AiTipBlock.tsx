'use client';

import { Lightbulb } from 'lucide-react';

type Props = {
  children: React.ReactNode;
};

export function AiTipBlock({ children }: Props) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg p-2.5"
      style={{ backgroundColor: '#FAEEDA', color: '#633806' }}
    >
      <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" strokeWidth={2} />
      <p className="text-[11px] leading-[1.5]">{children}</p>
    </div>
  );
}

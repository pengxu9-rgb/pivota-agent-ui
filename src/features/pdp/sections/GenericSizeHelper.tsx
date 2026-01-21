'use client';

import { Ruler } from 'lucide-react';

export function GenericSizeHelper() {
  return (
    <div className="mt-4 mx-4 border border-border rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold flex items-center gap-2">
          <Ruler className="h-3.5 w-3.5" />
          Size Helper
        </h3>
        <button className="text-[11px] text-primary">AI Fit</button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Add your height & weight for personalized size recommendations.
      </p>
    </div>
  );
}

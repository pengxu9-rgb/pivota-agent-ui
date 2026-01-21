'use client';

import { Ruler } from 'lucide-react';

export function GenericSizeHelper() {
  return (
    <div className="mt-4 mx-4 border border-border rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Ruler className="h-4 w-4" />
          Size Helper
        </h3>
        <button className="text-xs text-primary">AI Fit</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Add your height & weight for personalized size recommendations.
      </p>
    </div>
  );
}

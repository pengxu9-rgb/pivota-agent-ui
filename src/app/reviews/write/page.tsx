import { Suspense } from 'react';
import WriteReviewClient from './WriteReviewClient';

export default function WriteReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4 py-10">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <WriteReviewClient />
    </Suspense>
  );
}


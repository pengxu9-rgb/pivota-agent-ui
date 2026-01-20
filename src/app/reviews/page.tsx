import { Suspense } from 'react';
import ReviewsListClient from './ReviewsListClient';

export const dynamic = 'force-dynamic';

export default function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-mesh px-4 py-10">
          <div className="max-w-4xl mx-auto text-sm text-muted-foreground">Loading reviews…</div>
        </div>
      }
    >
      <ReviewsListClient />
    </Suspense>
  );
}

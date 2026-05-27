import { SkeletonCard } from '@/features/services/components/SkeletonCard';

export default function Loading() {
  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]">
      <div className="h-[280px] animate-pulse bg-[var(--pv-paper-muted)] md:mx-auto md:mt-8 md:h-[480px] md:max-w-[1180px] md:rounded-[var(--pv-radius-lg)]" />
      <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-6">
        <div className="grid gap-6 md:grid-cols-[600px_1fr]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}

import { SkeletonCard } from '@/features/services/components/SkeletonCard';

export default function Loading() {
  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)]">
      <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-6">
        <div className="h-8 w-64 animate-pulse rounded-full bg-[var(--pv-paper-muted)]" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

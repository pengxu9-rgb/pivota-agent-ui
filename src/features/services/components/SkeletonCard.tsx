import { cn } from '@/lib/utils';

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white', className)}>
      <div className="h-36 animate-pulse bg-[var(--pv-paper-muted)] md:h-44" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--pv-paper-muted)]" />
        <div className="h-4 w-full animate-pulse rounded-full bg-[var(--pv-paper-muted)]" />
        <div className="h-3 w-4/5 animate-pulse rounded-full bg-[var(--pv-paper-muted)]" />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="h-8 animate-pulse rounded-md bg-[var(--pv-paper-muted)]" />
          <div className="h-8 animate-pulse rounded-md bg-[var(--pv-paper-muted)]" />
        </div>
      </div>
    </div>
  );
}

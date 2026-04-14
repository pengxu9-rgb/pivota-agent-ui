interface ProductDetailLoadingProps {
  label?: string;
}

function ProductDetailSkeletonBackground() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-md px-4 pt-6 opacity-70">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted/25" />
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted/20" />
        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted/25" />
      </div>

      <div className="mt-4 aspect-[3/4] animate-pulse rounded-lg bg-muted/20" />

      <div className="mt-5 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted/20" />
        <div className="h-5 w-full animate-pulse rounded-lg bg-muted/20" />
        <div className="h-5 w-3/4 animate-pulse rounded-lg bg-muted/20" />
        <div className="h-4 w-1/2 animate-pulse rounded-lg bg-muted/20" />
      </div>
    </div>
  );
}

export function ProductDetailLoading({ label = 'Loading products' }: ProductDetailLoadingProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <ProductDetailSkeletonBackground />

      <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-6">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/80 px-5 py-3 text-sm font-medium text-foreground shadow-lg backdrop-blur-md"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function ProductPageLoading() {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pt-6 opacity-80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
          <div className="h-10 flex-1 rounded-full bg-muted/20 animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
        </div>
        <div className="mt-4 aspect-[3/4] rounded-3xl bg-muted/20 animate-pulse" />
        <div className="mt-5 space-y-2">
          <div className="h-8 w-36 rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-3/4 rounded bg-muted/20 animate-pulse" />
        </div>
      </div>
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
        <div className="rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_35px_rgba(0,0,0,0.2)]">
          Loading products
        </div>
      </div>
    </div>
  );
}

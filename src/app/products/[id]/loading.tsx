export default function ProductPageLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pt-6">
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
        <div className="mt-6 text-center text-sm text-muted-foreground">Loading product...</div>
      </div>
    </div>
  );
}

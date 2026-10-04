export type ReviewScopeOption = { id: string; label: string; count?: number; default?: boolean };

export function ReviewScopeSelector({ scopes, onSelect }: {
  scopes?: ReviewScopeOption[]; onSelect?: (id: string) => void;
}) {
  if (!scopes?.length) return null;
  return <div aria-label="Review scope" className="mb-3 flex flex-wrap gap-2">
    {scopes.map((scope) => <button key={scope.id} type="button" aria-pressed={scope.default === true}
      disabled={!onSelect || scope.default === true} onClick={() => onSelect?.(scope.id)}
      className="rounded-full border border-border px-2.5 py-1 text-xs disabled:opacity-70">
      {scope.label}{typeof scope.count === 'number' ? ` (${scope.count})` : ''}
    </button>)}
  </div>;
}

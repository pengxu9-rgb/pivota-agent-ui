'use client';

export function BeautyKeyClaims({
  title = 'What it does',
  claims,
}: {
  title?: string;
  claims: string[];
}) {
  if (!claims?.length) return null;
  return (
    <section className="mx-2.5 mt-5 sm:mx-3 lg:mx-0">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </div>
      <ul className="flex flex-col gap-2">
        {claims.map((claim, idx) => (
          <li key={`${idx}-${claim.slice(0, 24)}`} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 flex-shrink-0 text-primary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="text-[13.5px] leading-[1.5] text-foreground">{claim}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

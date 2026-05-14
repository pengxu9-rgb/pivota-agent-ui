'use client';

/**
 * "What it does" key-claims checklist for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → KeyClaimsSection:
 *   11px uppercase muted eyebrow, then a column of rows — each a 12px teal
 *   check icon (mt-1) + 13.5px/1.5 foreground claim text.
 *
 * Prop-driven; renders nothing when there are no claims.
 */
export function BeautyKeyClaims({
  title = 'What it does',
  claims,
}: {
  title?: string;
  claims: string[];
}) {
  if (!claims?.length) return null;
  return (
    <section className="mx-[18px] mt-[22px]">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {claims.map((claim, idx) => (
          <div key={`${idx}-${claim.slice(0, 24)}`} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 flex-shrink-0 text-primary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <div className="text-[13.5px] leading-normal text-foreground">{claim}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

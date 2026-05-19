'use client';

/**
 * Pivota Insights — the signature insights card on the Beauty mobile PDP.
 *
 * Brand Kit v2.0 (handoff §3h): the cream-paper slab + gradient sparkle
 * header is retired. The card is now a single white surface with a hairline
 * border. The identifier row leads with the gradient `p.` mark + a
 * `PIVOTA INSIGHTS` eyebrow in brand purple + a freshness stamp on the
 * right; an editorial Cormorant headline carries the lede; the existing
 * data binding (What it is / Why it stands out / Routine / Watch-outs /
 * Community) renders below — content unchanged, wrapper restyled.
 */

export type BeautyInsightsData = {
  displayName?: string | null;
  evidenceLabel?: string | null;
  whatItIs?: { headline?: string | null; body?: string | null } | null;
  bestFor?: string[] | null;
  highlights?: Array<{ headline?: string | null; body?: string | null }> | null;
  routine?: {
    step?: string | null;
    amPm?: string[] | null;
    texture?: string | null;
    finish?: string | null;
    pairingNotes?: string[] | null;
  } | null;
  watchouts?: Array<{ label?: string | null; severity?: string | null }> | null;
  community?: { loves?: string[] | null; complaints?: string[] | null } | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-[3px]"
      style={{ background: 'rgba(44,44,42,0.6)' }}
    />
  );
}

function RoutineChip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? 'rounded-full bg-[var(--paper-muted,#F4F4F2)] px-2.5 py-1 text-[11px] font-medium text-foreground'
          : 'rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-foreground'
      }
    >
      {children}
    </span>
  );
}

function CommunityCard({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl bg-[var(--paper-muted,#F4F4F2)] px-3 py-2.5">
      <SectionLabel>{label}</SectionLabel>
      <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-[1.45] text-muted-foreground">
            <Dot />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BeautyPivotaInsights({ insights }: { insights: BeautyInsightsData | null | undefined }) {
  if (!insights) return null;
  const {
    displayName = 'Pivota Insights',
    evidenceLabel,
    whatItIs,
    bestFor,
    highlights,
    routine,
    watchouts,
    community,
  } = insights;

  const hasBody =
    whatItIs?.headline ||
    whatItIs?.body ||
    bestFor?.length ||
    highlights?.length ||
    routine?.step ||
    routine?.pairingNotes?.length ||
    watchouts?.length;
  if (!hasBody) return null;

  return (
    <div className="mx-4 mt-3.5 overflow-hidden rounded-2xl border border-border bg-white">
      <div className="px-4 pt-3.5">
        {/* Identifier row: gradient mark + brand eyebrow + freshness stamp. */}
        <div className="mb-2 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md text-white"
            style={{ background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))' }}
          >
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ fontFamily: 'var(--pv-font-brand, "Fredoka", system-ui, sans-serif)' }}
            >
              p
              <span style={{ marginLeft: 0.5 }}>.</span>
            </span>
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary"
          >
            {displayName || 'Pivota Insights'}
          </span>
          {evidenceLabel ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'var(--pv-teal, #1D9E75)' }}
              />
              {evidenceLabel}
            </span>
          ) : null}
        </div>

        {/* Editorial headline + caption (Cormorant per the brand type protocol). */}
        {whatItIs?.headline ? (
          <div
            className="text-[22px] font-medium leading-[1.2] tracking-[-0.015em] text-foreground"
            style={{ fontFamily: 'var(--pv-font-serif, "Cormorant Garamond", Georgia, serif)' }}
          >
            {whatItIs.headline}
          </div>
        ) : null}
        {whatItIs?.body ? (
          <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">{whatItIs.body}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5">
          {/* Best for — the only piece of "what it is" not already captured
              in the editorial headline + caption above. */}
          {bestFor?.length ? (
            <div>
              <SectionLabel>Best for</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bestFor.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-[var(--paper-muted,#F4F4F2)] px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Why it stands out */}
          {highlights?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>Why it stands out</SectionLabel>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {highlights.map((h, i) => (
                  <div key={i} className="flex gap-2.5 border-l border-border pl-3">
                    <Dot />
                    <div>
                      {h.headline ? (
                        <div className="text-[13px] font-semibold leading-[1.4] text-foreground">
                          {h.headline}
                        </div>
                      ) : null}
                      {h.body ? (
                        <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
                          {h.body}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* How it fits in a routine */}
          {routine?.step || routine?.pairingNotes?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>How it fits in a routine</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {routine?.step ? <RoutineChip>{routine.step}</RoutineChip> : null}
                {(routine?.amPm || []).map((t) => (
                  <RoutineChip key={t}>{t}</RoutineChip>
                ))}
                {routine?.texture ? <RoutineChip muted>Texture: {routine.texture}</RoutineChip> : null}
                {routine?.finish ? <RoutineChip muted>Finish: {routine.finish}</RoutineChip> : null}
              </div>
              {routine?.pairingNotes?.length ? (
                <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
                  {routine.pairingNotes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] leading-[1.45] text-muted-foreground">
                      <Dot />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Watch-outs & compatibility */}
          {watchouts?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>Watch-outs &amp; compatibility</SectionLabel>
              <div className="mt-2 flex flex-col gap-1.5">
                {watchouts.map((w, i) => (
                  <div key={i} className="flex gap-2 border-l border-border pl-3">
                    <Dot />
                    <div className="flex flex-1 justify-between gap-3">
                      <span className="text-[12.5px] leading-[1.45] text-foreground">{w.label}</span>
                      {w.severity ? (
                        <span className="mt-0.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                          {w.severity}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Community signals */}
        {community?.loves?.length || community?.complaints?.length ? (
          <div className="border-t border-border pt-3">
            <SectionLabel>Community signals</SectionLabel>
            <div className="mt-2 flex flex-col gap-2">
              <CommunityCard label="What people notice" items={community?.loves || []} />
              <CommunityCard label="Common complaints" items={community?.complaints || []} />
            </div>
          </div>
        ) : null}
      </div>
  );
}


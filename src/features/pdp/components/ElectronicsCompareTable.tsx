'use client';

/**
 * ElectronicsCompareTable
 *
 * 3-up comparison: this product + 2 alternatives. Each alternative is a
 * column with the same set of rows (Price, Display, Chip, Battery, Weight,
 * Ports, Reviews). Pivota curates the alternatives; for the prototype,
 * `compareAlternatives` ships pre-shaped from the adapter.
 *
 * Mobile renders the table inside an x-scroll container; desktop in a
 * card. Same component for both — `overflow-x-auto` handles narrow widths.
 */

export type CompareEntry = {
  id: string;
  title: string;       // 'MacBook Air 15" M3'
  /** Row key → cell value. Row order is fixed in this component. */
  rows: Record<string, string>;
};

const ROW_KEYS: { key: string; label: string }[] = [
  { key: 'price',    label: 'Price (configured)' },
  { key: 'display',  label: 'Display' },
  { key: 'chip',     label: 'Chip' },
  { key: 'battery',  label: 'Battery (Pivota)' },
  { key: 'weight',   label: 'Weight' },
  { key: 'ports',    label: 'Ports' },
  { key: 'reviews',  label: 'Reviews' },
];

export function ElectronicsCompareTable({
  thisProduct,
  alternatives,
  title = 'Compare alternatives',
}: {
  thisProduct: CompareEntry;
  alternatives: CompareEntry[];
  title?: string;
}) {
  const columns = [thisProduct, ...alternatives.slice(0, 2)];
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-[22px] font-medium tracking-tight text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">Pivota picks · same config tier</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"></th>
              {columns.map((c, i) => (
                <th
                  key={c.id}
                  className={
                    'py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] ' +
                    (i === 0 ? 'text-primary' : 'text-muted-foreground')
                  }
                >
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_KEYS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border">
                <td className="whitespace-nowrap py-3 pr-3 text-[12px] text-muted-foreground">{label}</td>
                {columns.map((c, i) => (
                  <td
                    key={`${c.id}-${key}`}
                    className={
                      'px-3 py-3 ' + (i === 0 ? 'font-semibold text-foreground' : 'text-foreground')
                    }
                  >
                    {c.rows[key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

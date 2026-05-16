'use client';

/**
 * ElectronicsTechSpecs
 *
 * Tech-spec groups: Chip · Display · Battery · Memory & Storage · Ports.
 *
 * Two layouts:
 *  - 'accordion' (default, mobile): each group is a `BeautyAccordion` with
 *    a 2-col table inside.
 *  - 'grid' (desktop): groups render as side-by-side cards (2-up).
 */

import { Cpu, Monitor, BatteryCharging, ListTree, ShieldCheck } from 'lucide-react';
import { BeautyAccordion } from '@/features/pdp/components/BeautyAccordion';

export type SpecGroup = {
  group: string;                            // 'Chip' | 'Display' | …
  icon?: 'cpu' | 'display' | 'battery' | 'spec' | 'shield' | null;
  rows: [string, string][];                 // [['Chip', 'Apple M3'], …]
};

const ICONS: Record<NonNullable<SpecGroup['icon']>, typeof Cpu> = {
  cpu: Cpu, display: Monitor, battery: BatteryCharging, spec: ListTree, shield: ShieldCheck,
};

function GroupTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={k} className={i ? 'border-t border-border' : ''}>
            <td className="w-[40%] py-2.5 align-top text-[12px] text-muted-foreground">{k}</td>
            <td className="py-2.5 text-[13px] leading-snug text-foreground">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ElectronicsTechSpecs({
  groups,
  layout = 'accordion',
  title = 'Tech specs',
}: {
  groups: SpecGroup[];
  layout?: 'accordion' | 'grid';
  title?: string;
}) {
  if (!groups?.length) return null;

  if (layout === 'grid') {
    return (
      <section>
        <h3 className="mb-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.map((g) => {
            const Icon = (g.icon && ICONS[g.icon]) || ListTree;
            return (
              <div key={g.group} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <h4 className="text-[14px] font-semibold text-foreground">{g.group}</h4>
                </div>
                <GroupTable rows={g.rows} />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-3 px-[18px]">
        <h3 className="font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h3>
      </div>
      {groups.map((g, i) => {
        const Icon = (g.icon && ICONS[g.icon]) || ListTree;
        return (
          <BeautyAccordion
            key={g.group}
            title={
              <span className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
                {g.group}
              </span> as any
            }
            defaultOpen={i === 0}
          >
            <GroupTable rows={g.rows} />
          </BeautyAccordion>
        );
      })}
    </section>
  );
}

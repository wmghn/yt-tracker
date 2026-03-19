import { useState, useMemo } from "react";
import type { StaffPeriodMetrics, StaffTrend } from "@/lib/services/analytics";

interface Props {
  allMetrics: StaffPeriodMetrics[];
  trends:     StaffTrend[];
}

interface AggStaff {
  staffName:        string;
  role:             string;
  videoCount:       number;
  totalViews:       number;
  totalWatchTime:   number;
  totalRevenue:     number;
  totalSubscribers: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("vi-VN");
}

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({
  title, meta, defaultOpen = false, children,
}: {
  title: string; meta?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink text-sm uppercase tracking-wide">{title}</span>
          {meta}
        </div>
        <span className={`text-ink-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && <div className="border-t border-border animate-in">{children}</div>}
    </div>
  );
}

// ── Staff table inside accordion ──────────────────────────────────────────────
function StaffTable({ members, hasRevenue, hasWatch }: {
  members: AggStaff[]; hasRevenue: boolean; hasWatch: boolean;
}) {
  const sorted = [...members].sort((a, b) => b.totalViews - a.totalViews);

  const maxViews   = Math.max(...sorted.map(m => m.totalViews), 1);
  const maxRevenue = Math.max(...sorted.map(m => m.totalRevenue), 1);
  const maxWatch   = Math.max(...sorted.map(m => m.totalWatchTime), 1);

  // Totals for % contribution
  const sumViews   = sorted.reduce((s, m) => s + m.totalViews, 0);
  const sumWatch   = sorted.reduce((s, m) => s + m.totalWatchTime, 0);
  const sumRevenue = sorted.reduce((s, m) => s + m.totalRevenue, 0);
  const sumSubs    = sorted.reduce((s, m) => s + m.totalSubscribers, 0);
  const hasSubs    = sumSubs > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2">
            <th className="pl-5 px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide">#</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">Tên</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">
              Video
              <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[180px]">
              Tổng views
              <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">tỷ lệ</span>
            </th>
            {hasWatch && (
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Watch time
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              </th>
            )}
            {hasRevenue && (
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Doanh thu
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">tỷ lệ</span>
              </th>
            )}
            {hasSubs && (
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[140px]">
                Subscribers
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((m, i) => {
            const viewsPct   = sumViews   > 0 ? (m.totalViews        / sumViews)   * 100 : 0;
            const watchPct_  = sumWatch   > 0 ? (m.totalWatchTime    / sumWatch)   * 100 : 0;
            const revPct     = sumRevenue > 0 ? (m.totalRevenue      / sumRevenue) * 100 : 0;
            const subsPct    = sumSubs    > 0 ? (m.totalSubscribers  / sumSubs)    * 100 : 0;
            return (
              <tr key={m.staffName} className="hover:bg-surface-2/40">
                <td className="pl-5 px-4 py-3 text-xs text-ink-muted font-bold">{i + 1}</td>
                <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">{m.staffName}</td>
                <td className="px-4 py-3">
                  <span className="font-mono font-bold text-ink">{m.videoCount}</span>
                </td>
                <td className="px-4 py-3 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(m.totalViews / maxViews) * 100}%` }} />
                    </div>
                    <div>
                      <span className="font-bold text-accent text-xs whitespace-nowrap">{fmt(m.totalViews)}</span>
                      <span className="block text-[10px] text-ink-muted">{viewsPct.toFixed(1)}% views</span>
                    </div>
                  </div>
                </td>
                {hasWatch && (
                  <td className="px-4 py-3 min-w-[160px]">
                    {m.totalWatchTime > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(m.totalWatchTime / maxWatch) * 100}%` }} />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-sky-600 whitespace-nowrap">
                            {m.totalWatchTime >= 1000 ? `${(m.totalWatchTime / 1000).toFixed(1)}K` : m.totalWatchTime.toFixed(1)}h
                          </span>
                          <span className="block text-[10px] text-ink-muted">{watchPct_.toFixed(1)}% watch time</span>
                        </div>
                      </div>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>
                )}
                {hasRevenue && (
                  <td className="px-4 py-3 min-w-[160px]">
                    {m.totalRevenue > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(m.totalRevenue / maxRevenue) * 100}%` }} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">${m.totalRevenue.toFixed(2)}</span>
                          <span className="block text-[10px] text-ink-muted">{revPct.toFixed(1)}% doanh thu</span>
                        </div>
                      </div>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>
                )}
                {hasSubs && (
                  <td className="px-4 py-3 min-w-[140px]">
                    {m.totalSubscribers > 0 ? (
                      <div>
                        <span className="text-xs font-semibold text-violet-600 whitespace-nowrap">
                          {m.totalSubscribers > 0 ? `+${fmt(m.totalSubscribers)}` : fmt(m.totalSubscribers)}
                        </span>
                        <span className="block text-[10px] text-ink-muted">{subsPct.toFixed(1)}% subscribers</span>
                      </div>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {/* Role totals footer */}
        <tfoot>
          <tr className="bg-surface-2 border-t-2 border-border-strong">
            <td colSpan={3} className="pl-5 px-4 py-2 text-xs font-bold text-ink-secondary">Tổng</td>
            <td className="px-4 py-2">
              <span className="text-xs font-bold text-accent">
                {fmt(sorted.reduce((s, m) => s + m.totalViews, 0))}
              </span>
            </td>
            {hasWatch && (
              <td className="px-4 py-2">
                <span className="text-xs font-semibold text-sky-600">
                  {(() => { const t = sorted.reduce((s, m) => s + m.totalWatchTime, 0); return t >= 1000 ? `${(t/1000).toFixed(1)}Kh` : `${t.toFixed(1)}h`; })()}
                </span>
              </td>
            )}
            {hasRevenue && (
              <td className="px-4 py-2">
                <span className="text-xs font-bold text-emerald-600">
                  ${sorted.reduce((s, m) => s + m.totalRevenue, 0).toFixed(2)}
                </span>
              </td>
            )}
            {hasSubs && (
              <td className="px-4 py-2">
                <span className="text-xs font-semibold text-violet-600">
                  +{fmt(sorted.reduce((s, m) => s + m.totalSubscribers, 0))}
                </span>
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function OverviewTab({ allMetrics }: Omit<Props, "trends">) {
  // Aggregate per staff across all periods
  const aggregated = useMemo(() => {
    const map = new Map<string, AggStaff>();
    for (const m of allMetrics) {
      const key = `${m.staffName}::${m.role}`;
      if (!map.has(key)) {
        map.set(key, { staffName: m.staffName, role: m.role, videoCount: 0, totalViews: 0, totalWatchTime: 0, totalRevenue: 0, totalSubscribers: 0 });
      }
      const agg = map.get(key)!;
      agg.videoCount       += m.videoCount;
      agg.totalViews       += m.weightedViews;
      agg.totalWatchTime   += m.totalWatchTime;
      agg.totalRevenue     += m.totalRevenue;
      agg.totalSubscribers += m.totalSubscribers;
    }
    return Array.from(map.values());
  }, [allMetrics]);

  // Group by role (preserve insertion order = sorted by first occurrence)
  const byRole = useMemo(() => {
    const map = new Map<string, AggStaff[]>();
    for (const m of aggregated) {
      if (!map.has(m.role)) map.set(m.role, []);
      map.get(m.role)!.push(m);
    }
    return Array.from(map.entries());
  }, [aggregated]);

  const hasRevenue = aggregated.some(m => m.totalRevenue > 0);
  const hasWatch   = aggregated.some(m => m.totalWatchTime > 0);

  // Global KPIs
  const kpis = useMemo(() => ({
    staffCount:  aggregated.length,
    videoCount:  aggregated.reduce((s, m) => s + m.videoCount, 0),
    totalViews:  aggregated.reduce((s, m) => s + m.totalViews, 0),
    totalRevenue: aggregated.reduce((s, m) => s + m.totalRevenue, 0),
  }), [aggregated]);

  if (aggregated.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-ink-muted">
        Chưa có dữ liệu. Hãy nhập danh sách nhân sự ở tab Tính views trước.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className={`grid gap-3 ${hasRevenue ? "grid-cols-4" : "grid-cols-3"}`}>
        {[
          { label: "Nhân sự",       value: String(kpis.staffCount),               color: "text-ink",         badge: null },
          { label: "Video theo dõi", value: String(kpis.videoCount),              color: "text-ink",         badge: "tổng" as const },
          { label: "Tổng views",    value: fmt(kpis.totalViews),                  color: "text-accent",      badge: "tỷ lệ" as const },
          ...(hasRevenue ? [{ label: "Tổng doanh thu", value: `$${kpis.totalRevenue.toFixed(2)}`, color: "text-emerald-600", badge: "tỷ lệ" as const }] : []),
        ].map(k => (
          <div key={k.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-xs text-ink-muted">{k.label}</p>
              {k.badge === "tỷ lệ" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">tỷ lệ</span>
              )}
              {k.badge === "tổng" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              )}
            </div>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Role accordions */}
      {byRole.map(([role, members], idx) => {
        const roleTotalViews   = members.reduce((s, m) => s + m.totalViews, 0);
        const roleTotalRevenue = members.reduce((s, m) => s + m.totalRevenue, 0);
        return (
          <Section
            key={role}
            title={role}
            defaultOpen={idx === 0}
            meta={
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full border border-border">
                  {members.length} người
                </span>
                <span className="text-xs font-semibold text-accent">{fmt(roleTotalViews)} views</span>
                {roleTotalRevenue > 0 && (
                  <span className="text-xs font-semibold text-emerald-600">${roleTotalRevenue.toFixed(2)}</span>
                )}
              </div>
            }
          >
            <StaffTable members={members} hasRevenue={hasRevenue} hasWatch={hasWatch} />
          </Section>
        );
      })}
    </div>
  );
}

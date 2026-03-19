import { useMemo } from "react";
import type { StaffPeriodMetrics, StaffTrend } from "@/lib/services/analytics";

interface Props {
  allMetrics: StaffPeriodMetrics[];
  trends:     StaffTrend[];
}

interface AggStaff {
  staffName:           string;
  role:                string;
  videoCount:          number;
  totalWatchTime:      number;
  avgWatchTimePerVideo: number;
  totalViews:          number;
  totalRevenue:        number;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("vi-VN");
}

/** Rank badge: 1=gold, 2=silver, 3=bronze */
function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? "bg-yellow-100 text-yellow-700 border-yellow-300"
    : rank === 2 ? "bg-slate-100 text-slate-600 border-slate-300"
    : rank === 3 ? "bg-orange-100 text-orange-600 border-orange-300"
    : "bg-surface-2 text-ink-muted border-border";
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>#{rank}</span>
  );
}

function RoleGroup({ role, members, hasRevenue }: { role: string; members: AggStaff[]; hasRevenue: boolean }) {
  // Sort by total views descending for ranking
  const ranked = [...members].sort((a, b) => b.totalViews - a.totalViews);

  // Max values for bar visualization
  const maxViews   = Math.max(...members.map(m => m.totalViews), 1);
  const maxWatch   = Math.max(...members.map(m => m.totalWatchTime), 1);
  const maxRevenue = Math.max(...members.map(m => m.totalRevenue), 1);

  // Totals for % contribution (within this role group)
  const sumViews   = members.reduce((s, m) => s + m.totalViews, 0);
  const sumWatch   = members.reduce((s, m) => s + m.totalWatchTime, 0);
  const sumRevenue = members.reduce((s, m) => s + m.totalRevenue, 0);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <h2 className="text-base font-bold text-ink uppercase tracking-wide">{role}</h2>
        <span className="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full border border-border">
          {members.length} người
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="pl-5 px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">Tên</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">
                Video
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">
                Watch time TB
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Tổng watch time
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">tổng</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Tổng views
                <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">tỷ lệ</span>
              </th>
              {hasRevenue && (
                <th className="px-4 py-3 text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                  Tổng doanh thu
                  <span className="ml-1 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">tỷ lệ</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ranked.map((m, i) => {
              const barViewsPct  = (m.totalViews / maxViews) * 100;
              const barWatchPct  = (m.totalWatchTime / maxWatch) * 100;
              const barRevPct    = hasRevenue ? (m.totalRevenue / maxRevenue) * 100 : 0;
              const contribViewsPct = sumViews   > 0 ? (m.totalViews     / sumViews)   * 100 : 0;
              const contribWatchPct = sumWatch   > 0 ? (m.totalWatchTime / sumWatch)   * 100 : 0;
              const contribRevPct   = sumRevenue > 0 ? (m.totalRevenue   / sumRevenue) * 100 : 0;
              return (
                <tr key={m.staffName} className="hover:bg-surface-2/40">
                  <td className="pl-5 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={i + 1} />
                      <span className="font-semibold text-ink">{m.staffName}</span>
                    </div>
                  </td>

                  {/* Video count */}
                  <td className="px-4 py-4">
                    <span className="font-mono font-bold text-ink">{m.videoCount}</span>
                  </td>

                  {/* Avg watch time per video */}
                  <td className="px-4 py-4 min-w-[120px]">
                    <p className="font-semibold text-ink text-xs mb-1">
                      {m.avgWatchTimePerVideo > 0 ? `${m.avgWatchTimePerVideo.toFixed(1)}h` : "—"}
                    </p>
                    {m.totalWatchTime > 0 && (
                      <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-20">
                        <div className="h-full bg-sky-400 rounded-full" style={{ width: `${barWatchPct}%` }} />
                      </div>
                    )}
                  </td>

                  {/* Total watch time + % */}
                  <td className="px-4 py-4 min-w-[160px]">
                    {m.totalWatchTime > 0 ? (
                      <div>
                        <span className="font-mono font-semibold text-ink text-xs">
                          {formatNum(m.totalWatchTime)}h
                        </span>
                        <span className="block text-[10px] text-ink-muted">{contribWatchPct.toFixed(1)}% watch time</span>
                      </div>
                    ) : <span className="text-xs text-ink-muted">—</span>}
                  </td>

                  {/* Total views + % */}
                  <td className="px-4 py-4 min-w-[160px]">
                    <p className="font-bold text-accent text-sm mb-0.5">{formatNum(m.totalViews)}</p>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden w-24 mb-0.5">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${barViewsPct}%` }} />
                    </div>
                    <span className="text-[10px] text-ink-muted">{contribViewsPct.toFixed(1)}% views</span>
                  </td>

                  {/* Revenue + % */}
                  {hasRevenue && (
                    <td className="px-4 py-4 min-w-[160px]">
                      {m.totalRevenue > 0 ? (
                        <>
                          <p className="font-bold text-emerald-600 text-sm mb-0.5">${m.totalRevenue.toFixed(2)}</p>
                          <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-20 mb-0.5">
                            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${barRevPct}%` }} />
                          </div>
                          <span className="text-[10px] text-ink-muted">{contribRevPct.toFixed(1)}% doanh thu</span>
                        </>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                  )}

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RoleCompareTab({ allMetrics }: Omit<Props, "trends">) {
  // Aggregate per-staff across all periods
  const aggregated = useMemo(() => {
    const map = new Map<string, AggStaff>();
    for (const m of allMetrics) {
      const key = `${m.staffName}::${m.role}`;
      if (!map.has(key)) {
        map.set(key, {
          staffName:            m.staffName,
          role:                 m.role,
          videoCount:           0,
          totalWatchTime:       0,
          avgWatchTimePerVideo: 0,
          totalViews:           0,
          totalRevenue:         0,
        });
      }
      const agg = map.get(key)!;
      agg.videoCount     += m.videoCount;
      agg.totalWatchTime += m.totalWatchTime;
      agg.totalViews     += m.weightedViews;
      agg.totalRevenue   += m.totalRevenue;
    }
    for (const agg of map.values()) {
      agg.avgWatchTimePerVideo = agg.videoCount > 0 ? agg.totalWatchTime / agg.videoCount : 0;
    }
    return Array.from(map.values());
  }, [allMetrics]);

  const hasRevenue = aggregated.some(m => m.totalRevenue > 0);

  // Group by role
  const byRole = useMemo(() => {
    const map = new Map<string, AggStaff[]>();
    for (const m of aggregated) {
      if (!map.has(m.role)) map.set(m.role, []);
      map.get(m.role)!.push(m);
    }
    return map;
  }, [aggregated]);

  if (aggregated.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-ink-muted">
        Chưa có dữ liệu phân tích. Hãy nhập danh sách nhân sự ở tab Tính views trước.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        So sánh nhân sự trong cùng vai trò. Dữ liệu tổng hợp từ tất cả các tháng trong khoảng thời gian đang lọc.
      </div>

      {Array.from(byRole.entries()).map(([role, members]) => (
        <RoleGroup key={role} role={role} members={members} hasRevenue={hasRevenue} />
      ))}
    </div>
  );
}

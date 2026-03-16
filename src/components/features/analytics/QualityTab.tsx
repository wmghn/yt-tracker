import { useMemo } from "react";
import type { StaffPeriodMetrics } from "@/lib/services/analytics";

interface Props {
  metrics:    StaffPeriodMetrics[];
  channelAvg: number;
}

function RankedList({
  title,
  items,
  valueKey,
  format,
  unit,
}: {
  title: string;
  items: StaffPeriodMetrics[];
  valueKey: keyof StaffPeriodMetrics;
  format?: (v: number) => string;
  unit?: string;
}) {
  const sorted = [...items]
    .filter(m => (m[valueKey] as number) > 0)
    .sort((a, b) => (b[valueKey] as number) - (a[valueKey] as number));

  const max = sorted[0] ? (sorted[0][valueKey] as number) : 1;
  const fmt = format ?? ((v: number) => v.toFixed(2));

  if (sorted.length === 0) {
    return (
      <div className="card p-4">
        <h3 className="font-bold text-ink text-sm mb-3">{title}</h3>
        <p className="text-xs text-ink-muted">Không có dữ liệu</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="font-bold text-ink text-sm mb-3">{title}</h3>
      <div className="space-y-3">
        {sorted.map((m, i) => {
          const val = m[valueKey] as number;
          const pct = max > 0 ? (val / max) * 100 : 0;
          return (
            <div key={`${m.staffName}-${m.period}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-ink">
                  <span className="text-ink-muted mr-1">#{i + 1}</span>
                  {m.staffName}
                  <span className="text-ink-muted ml-1">· {m.period}</span>
                </span>
                <span className="font-bold text-ink">{fmt(val)}{unit}</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QualityTab({ metrics, channelAvg: _channelAvg }: Props) {
  // Aggregate per-staff across all periods (latest period only for lists)
  const latestPeriod = useMemo(() => {
    const periods = [...new Set(metrics.map(m => m.period))].sort().reverse();
    return periods[0] ?? "";
  }, [metrics]);

  const latestMetrics = useMemo(() =>
    metrics.filter(m => m.period === latestPeriod),
    [metrics, latestPeriod]
  );

  const roles = [...new Set(metrics.map(m => m.role))];

  return (
    <div className="space-y-6">
      {/* Guide callout */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <p className="font-bold mb-1">Hướng dẫn đọc chỉ số chất lượng</p>
        <ul className="space-y-0.5 list-disc list-inside text-xs text-blue-600">
          <li><strong>CTR (Tỷ lệ nhấp)</strong>: cao hơn = thumbnail/title hấp dẫn hơn. Trung bình kênh YouTube: 2–10%.</li>
          <li><strong>Watch time TB</strong>: tổng giờ xem trung bình mỗi video — phản ánh khả năng giữ người xem.</li>
          <li><strong>Viral</strong>: video đạt ≥ 2× views trung bình kênh. <strong>Underperform</strong>: &lt; 0.5× trung bình.</li>
        </ul>
      </div>

      {/* CTR + Watch Time ranked lists per role */}
      {roles.map(role => {
        const roleMetrics = latestMetrics.filter(m => m.role === role);
        return (
          <div key={role}>
            <h2 className="text-base font-bold text-ink-secondary mb-3 uppercase tracking-wide">{role}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RankedList
                title="CTR trung bình (%)"
                items={roleMetrics}
                valueKey="avgCtr"
                format={v => v.toFixed(2)}
                unit="%"
              />
              <RankedList
                title="Watch time TB (giờ/video)"
                items={roleMetrics}
                valueKey="avgWatchTimeRatio"
                format={v => v.toFixed(1)}
                unit="h"
              />
            </div>
          </div>
        );
      })}

      {/* Video distribution table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-ink">Phân bổ chất lượng video ({latestPeriod})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2">
                {["Tên", "Vai trò", "Tổng video", "Viral 🔥", "Bình thường", "Underperform ⚠️"].map((h, i) => (
                  <th key={h} className={`text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 ${i === 0 ? "pl-5" : ""} text-left whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {latestMetrics.map(m => {
                const normal = m.videoCount - m.viralCount - m.underCount;
                return (
                  <tr key={`${m.staffName}-${m.role}`} className="hover:bg-surface-2/40">
                    <td className="pl-5 px-4 py-3 font-semibold text-ink">{m.staffName}</td>
                    <td className="px-4 py-3 text-ink-secondary">{m.role}</td>
                    <td className="px-4 py-3 font-mono text-ink">{m.videoCount}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-600 font-bold">{m.viralCount}</span>
                      {m.viralCount > 0 && (
                        <span className="ml-1 text-xs text-ink-muted">
                          ({Math.round((m.viralCount / m.videoCount) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink-secondary">{Math.max(0, normal)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${m.underCount > 0 ? "text-red-500" : "text-ink-muted"}`}>
                        {m.underCount}
                      </span>
                      {m.underCount > 0 && (
                        <span className="ml-1 text-xs text-ink-muted">
                          ({Math.round((m.underCount / m.videoCount) * 100)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {latestMetrics.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-ink-muted">
            Không có dữ liệu cho tháng {latestPeriod}.
          </div>
        )}
      </div>

      {/* Revenue */}
      {latestMetrics.some(m => m.totalRevenue > 0) && (
        <div className="card p-5">
          <h2 className="text-base font-bold text-ink mb-4">Doanh thu ước tính ({latestPeriod})</h2>
          <div className="space-y-3">
            {[...latestMetrics]
              .filter(m => m.totalRevenue > 0)
              .sort((a, b) => b.totalRevenue - a.totalRevenue)
              .map((m, i) => {
                const maxRev = latestMetrics.reduce((mx, x) => Math.max(mx, x.totalRevenue), 1);
                return (
                  <div key={`${m.staffName}-rev`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-ink">
                        <span className="text-ink-muted mr-1">#{i + 1}</span> {m.staffName}
                      </span>
                      <span className="font-bold text-ink">${m.totalRevenue.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full"
                        style={{ width: `${(m.totalRevenue / maxRev) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">${m.revenuePerVideo.toFixed(2)}/video</p>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}
    </div>
  );
}

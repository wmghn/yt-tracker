import { useState, useMemo } from "react";
import type { VideoRow, StaffMember } from "@/types";
import type { StaffPeriodMetrics } from "@/lib/services/analytics";

interface Props {
  allMetrics:    StaffPeriodMetrics[];
  filteredVideos: VideoRow[];
  staffList:     StaffMember[];
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

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  title, badge, defaultOpen = false, children,
}: {
  title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink text-sm">{title}</span>
          {badge}
        </div>
        <span className={`text-ink-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="border-t border-border animate-in">{children}</div>}
    </div>
  );
}

// ── Top Video list ────────────────────────────────────────────────────────────
type TopCat = "views" | "revenue" | "subscribers";

function TopVideoList({
  videos, staffList, category, colorBar, colorText, formatValue, emptyMsg,
}: {
  videos: VideoRow[]; staffList: StaffMember[]; category: TopCat;
  colorBar: string; colorText: string; formatValue: (v: VideoRow) => string;
  emptyMsg?: string;
}) {
  const videoStaff = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of staffList) {
      for (const vid of s.videoIds) {
        if (!m.has(vid)) m.set(vid, []);
        m.get(vid)!.push(s.name);
      }
    }
    return m;
  }, [staffList]);

  const sorted = useMemo(() =>
    [...videos]
      .filter(v =>
        category === "views"       ? true
        : category === "revenue"   ? (v.revenue ?? 0) > 0
        : (v.subscribers ?? 0) > 0
      )
      .sort((a, b) =>
        category === "views"       ? b.views - a.views
        : category === "revenue"   ? (b.revenue ?? 0) - (a.revenue ?? 0)
        : (b.subscribers ?? 0) - (a.subscribers ?? 0)
      )
      .slice(0, 10),
    [videos, category]
  );

  if (sorted.length === 0) {
    return <p className="px-5 py-4 text-sm text-ink-muted">{emptyMsg ?? "Không có dữ liệu."}</p>;
  }

  const maxVal =
    category === "views"     ? sorted[0].views
    : category === "revenue" ? (sorted[0].revenue ?? 1)
    : (sorted[0].subscribers ?? 1);

  return (
    <div className="divide-y divide-border">
      {sorted.map((v, i) => {
        const rawVal =
          category === "views"     ? v.views
          : category === "revenue" ? (v.revenue ?? 0)
          : (v.subscribers ?? 0);
        const pct    = maxVal > 0 ? (rawVal / maxVal) * 100 : 0;
        const makers = videoStaff.get(v.youtubeId) ?? [];
        return (
          <div key={v.youtubeId} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm font-bold text-ink-muted w-5 flex-shrink-0 mt-0.5">#{i + 1}</span>
                <div className="min-w-0">
                  <a
                    href={`https://youtube.com/watch?v=${v.youtubeId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold text-ink hover:text-accent truncate block max-w-sm"
                    title={v.title}
                  >
                    {v.title}
                  </a>
                  {makers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {makers.map(name => (
                        <span key={name} className="text-xs bg-surface-2 text-ink-tertiary px-1.5 py-0.5 rounded-full border border-border">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${colorText}`}>{formatValue(v)}</span>
            </div>
            <div className="ml-7 h-1 bg-surface-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Staff leaderboard ─────────────────────────────────────────────────────────
function Leaderboard({ staff, getValue, formatVal, unit, colorBar, colorText, emptyMsg }: {
  staff: AggStaff[]; getValue: (s: AggStaff) => number;
  formatVal: (v: number) => string; unit: string;
  colorBar: string; colorText: string; emptyMsg?: string;
}) {
  const sorted = [...staff].filter(s => getValue(s) > 0).sort((a, b) => getValue(b) - getValue(a));
  const max = getValue(sorted[0]) || 1;

  if (sorted.length === 0) {
    return <p className="px-5 py-4 text-sm text-ink-muted">{emptyMsg ?? "Không có dữ liệu."}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {sorted.map((s, i) => {
        const val = getValue(s);
        const pct = (val / max) * 100;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
        return (
          <div key={`${s.staffName}::${s.role}`} className="px-5 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {medal
                  ? <span className="text-base w-6 text-center">{medal}</span>
                  : <span className="w-6 h-6 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold text-ink-muted flex-shrink-0">{i + 1}</span>
                }
                <span className="text-sm font-semibold text-ink">{s.staffName}</span>
                <span className="text-xs text-ink-muted">· {s.role}</span>
              </div>
              <span className={`text-sm font-bold ${colorText}`}>
                {formatVal(val)}<span className="text-xs font-normal text-ink-muted ml-0.5">{unit}</span>
              </span>
            </div>
            <div className="ml-8 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function RankingTab({ allMetrics, filteredVideos, staffList }: Props) {
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

  const hasRevenue     = filteredVideos.some(v => (v.revenue ?? 0) > 0);
  const hasSubscribers = filteredVideos.some(v => (v.subscribers ?? 0) > 0);
  const hasWatchTime   = aggregated.some(s => s.totalWatchTime > 0);

  const topVideosBadge = (
    <span className="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full border border-border">
      {Math.min(filteredVideos.length, 10)} / {filteredVideos.length} video
    </span>
  );

  // Reusable badge components
  const ratioBadge = (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
      Theo tỷ lệ vai trò
    </span>
  );
  const rawBadge = (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      Tổng từ video
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-0.5 text-xs text-ink-muted items-center">
        <span>Khoảng thời gian đang lọc, xếp giảm dần.</span>
        <span className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-semibold">Theo tỷ lệ vai trò</span>
          <span>= views/doanh thu × trọng số vai trò ÷ số người cùng vai trò trong video</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-semibold">Tổng từ video</span>
          <span>= cộng thẳng từ các video đã làm, không chia tỷ lệ</span>
        </span>
      </div>

      {/* ── TOP VIDEOS ─────────────────────────────────────────────────── */}
      <Section title="🎬 Top 10 Video — Lượt xem" badge={topVideosBadge} defaultOpen>
        <TopVideoList
          videos={filteredVideos} staffList={staffList} category="views"
          colorBar="bg-accent" colorText="text-accent"
          formatValue={v => fmt(v.views)}
        />
      </Section>

      {hasRevenue && (
        <Section title="🎬 Top 10 Video — Doanh thu">
          <TopVideoList
            videos={filteredVideos} staffList={staffList} category="revenue"
            colorBar="bg-emerald-400" colorText="text-emerald-600"
            formatValue={v => `$${(v.revenue ?? 0).toFixed(2)}`}
          />
        </Section>
      )}

      {hasSubscribers && (
        <Section title="🎬 Top 10 Video — Lượt đăng ký">
          <TopVideoList
            videos={filteredVideos} staffList={staffList} category="subscribers"
            colorBar="bg-purple-400" colorText="text-purple-600"
            formatValue={v => fmt(v.subscribers ?? 0)}
          />
        </Section>
      )}

      {/* ── STAFF LEADERBOARDS ─────────────────────────────────────────── */}
      {aggregated.length > 0 && <>
        <div className="pt-1">
          <p className="text-xs font-bold text-ink-tertiary uppercase tracking-wide px-0.5 mb-2">Xếp hạng nhân sự</p>
        </div>

        <Section title="👁️ Số views" badge={ratioBadge} defaultOpen>
          <Leaderboard
            staff={aggregated} getValue={s => s.totalViews}
            formatVal={fmt} unit=""
            colorBar="bg-accent" colorText="text-accent"
          />
        </Section>

        <Section title="🎬 Video đóng góp" badge={rawBadge}>
          <Leaderboard
            staff={aggregated} getValue={s => s.videoCount}
            formatVal={v => String(v)} unit=" video"
            colorBar="bg-blue-400" colorText="text-blue-600"
          />
        </Section>

        {aggregated.some(s => s.totalRevenue > 0) && (
          <Section title="💰 Doanh thu" badge={ratioBadge}>
            <Leaderboard
              staff={aggregated} getValue={s => s.totalRevenue}
              formatVal={v => `$${v.toFixed(2)}`} unit=""
              colorBar="bg-emerald-400" colorText="text-emerald-600"
              emptyMsg="Chưa có dữ liệu doanh thu."
            />
          </Section>
        )}

        {aggregated.some(s => s.totalSubscribers > 0) && (
          <Section title="🔔 Lượt đăng ký" badge={rawBadge}>
            <Leaderboard
              staff={aggregated} getValue={s => s.totalSubscribers}
              formatVal={fmt} unit=""
              colorBar="bg-purple-400" colorText="text-purple-600"
              emptyMsg="Chưa có dữ liệu đăng ký."
            />
          </Section>
        )}

        {hasWatchTime && (
          <Section title="⏱️ Thời lượng xem" badge={rawBadge}>
            <Leaderboard
              staff={aggregated} getValue={s => s.totalWatchTime}
              formatVal={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(1)} unit=" giờ"
              colorBar="bg-sky-400" colorText="text-sky-600"
              emptyMsg="Chưa có dữ liệu thời lượng xem."
            />
          </Section>
        )}
      </>}
    </div>
  );
}

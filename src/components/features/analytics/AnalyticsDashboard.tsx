import { useState, useMemo } from "react";
import type { MonthSession, StaffMember, VideoRow } from "@/types";
import {
  computeMetricsFromSessions,
  computeTrends,
} from "@/lib/services/analytics";
import OverviewTab    from "./OverviewTab";
import RoleCompareTab from "./RoleCompareTab";
import RankingTab     from "./RankingTab";
import TrendTab       from "./TrendTab";

// ── Untracked videos block ────────────────────────────────────────────────────
function UntrackedVideos({ videos }: { videos: VideoRow[] }) {
  const [open, setOpen] = useState(false);

  if (videos.length === 0) return null;

  const totalViews = videos.reduce((s, v) => s + v.views, 0);
  const fmtExact = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-amber-50/60 transition-colors text-left"
      >
        <span className="text-base">⚠️</span>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-700 text-sm">
            {videos.length} video chưa được track
          </span>
          <span className="ml-2 text-xs text-amber-600">
            — {fmtExact(totalViews)} views bị mất
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-amber-600 font-medium">Views không được tính</p>
            <p className="text-sm font-bold text-amber-700">{fmtExact(totalViews)}</p>
          </div>
          <svg
            width={14} height={14} viewBox="0 0 16 16" fill="currentColor"
            className={`text-amber-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-amber-100 animate-in">
          {/* Summary bar */}
          <div className="px-6 py-3 bg-amber-50 flex flex-wrap gap-4 text-xs text-amber-700 border-b border-amber-100">
            <span><strong>{videos.length}</strong> video không có nhân sự phụ trách</span>
            <span>·</span>
            <span>Tổng views bị mất: <strong>{totalViews.toLocaleString("vi-VN")}</strong></span>
            <span>·</span>
            <span>Thêm Video ID của các video này vào nhân sự để được tính vào phân tích.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50">
                  <th className="pl-6 px-4 py-3 text-left text-xs font-bold text-amber-700 uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-amber-700 uppercase tracking-wide">Tiêu đề video</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-amber-700 uppercase tracking-wide whitespace-nowrap">Video ID</th>
                  <th className="px-4 pr-6 py-3 text-right text-xs font-bold text-amber-700 uppercase tracking-wide whitespace-nowrap">Views</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {videos
                  .slice()
                  .sort((a, b) => b.views - a.views)
                  .map((v, i) => (
                    <tr key={v.youtubeId} className="hover:bg-amber-50/40 transition-colors">
                      <td className="pl-6 px-4 py-3 text-xs text-amber-500 font-bold">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-ink max-w-xs">
                        <span className="line-clamp-2">{v.title}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://youtube.com/watch?v=${v.youtubeId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="font-mono text-xs text-blue-500 hover:underline"
                        >
                          {v.youtubeId}
                        </a>
                      </td>
                      <td className="px-4 pr-6 py-3 text-right font-bold text-amber-700 whitespace-nowrap">
                        {v.views.toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  sessions: MonthSession[];
}

type SubTab = "overview" | "role" | "ranking" | "trend";

export default function AnalyticsDashboard({ sessions }: Props) {
  const [subTab,            setSubTab]            = useState<SubTab>("overview");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // ── Selected session for Overview / Role / Ranking (default = latest) ───────
  const selectedSession: MonthSession | undefined = useMemo(() => {
    if (selectedSessionId) return sessions.find(s => s.id === selectedSessionId);
    return sessions[0];
  }, [sessions, selectedSessionId]);

  // ── Metrics for Overview / Role / Ranking — single session ──────────────────
  const singleMetrics = useMemo(
    () => (selectedSession ? computeMetricsFromSessions([selectedSession]) : []),
    [selectedSession],
  );

  const singleVideos = useMemo((): VideoRow[] =>
    selectedSession
      ? selectedSession.videos.map(v => ({ ...v, publishedMonth: v.publishedMonth ?? selectedSession.period }))
      : [],
    [selectedSession],
  );

  const singleStaff = useMemo((): StaffMember[] => selectedSession?.staffList ?? [], [selectedSession]);

  // ── Untracked videos — in selected session but not in any staff's videoIds ───
  const untrackedVideos = useMemo(() => {
    if (!selectedSession) return [];
    const tracked = new Set(selectedSession.staffList.flatMap(s => s.videoIds));
    return selectedSession.videos.filter(v => !tracked.has(v.youtubeId));
  }, [selectedSession]);

  // ── Metrics for Trend — ALL sessions ────────────────────────────────────────
  const allMetrics  = useMemo(() => computeMetricsFromSessions(sessions), [sessions]);
  const allTrends   = useMemo(() => computeTrends(allMetrics), [allMetrics]);

  // ── Gate ─────────────────────────────────────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="card p-16 text-center">
          <p className="text-4xl mb-4">📈</p>
          <h2 className="text-xl font-bold text-ink mb-2">Chưa có dữ liệu</h2>
          <p className="text-ink-muted">Lưu ít nhất 1 tháng trong tab Lịch sử để xem phân tích.</p>
        </div>
      </div>
    );
  }

  const SUB_TABS: Array<{ key: SubTab; label: string }> = [
    { key: "overview", label: "🏆 Tổng quan"    },
    { key: "role",     label: "👥 Theo vai trò" },
    { key: "ranking",  label: "📊 Xếp hạng"    },
    { key: "trend",    label: "📈 Xu hướng"     },
  ];

  const isSingleSessionTab = subTab !== "trend";

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Phân tích nhân sự</h1>
          <p className="text-sm text-ink-muted">
            {sessions.length} tháng đã lưu
            {isSingleSessionTab && selectedSession
              ? ` · Đang xem: ${selectedSession.name}`
              : ""}
          </p>
        </div>

        {/* Session picker — shown only for Overview / Role / Ranking */}
        {isSingleSessionTab && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted font-medium">Tháng:</span>
            <select
              value={selectedSession?.id ?? ""}
              onChange={e => setSelectedSessionId(e.target.value || null)}
              className="input input-sm text-sm pr-8 min-w-[160px]"
            >
              {sessions.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {s.name}{i === 0 ? " (gần nhất)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
              subTab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Untracked videos — shown for all single-session tabs */}
      {isSingleSessionTab && (
        <div className="mb-5">
          <UntrackedVideos videos={untrackedVideos} />
        </div>
      )}

      {subTab === "overview" && <OverviewTab allMetrics={singleMetrics} />}
      {subTab === "role"     && <RoleCompareTab allMetrics={singleMetrics} />}
      {subTab === "ranking"  && (
        <RankingTab allMetrics={singleMetrics} filteredVideos={singleVideos} staffList={singleStaff} />
      )}
      {subTab === "trend"    && <TrendTab allMetrics={allMetrics} trends={allTrends} sessions={sessions} />}
    </div>
  );
}

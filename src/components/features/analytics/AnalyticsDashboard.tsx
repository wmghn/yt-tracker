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

      {subTab === "overview" && <OverviewTab allMetrics={singleMetrics} />}
      {subTab === "role"     && <RoleCompareTab allMetrics={singleMetrics} />}
      {subTab === "ranking"  && (
        <RankingTab allMetrics={singleMetrics} filteredVideos={singleVideos} staffList={singleStaff} />
      )}
      {subTab === "trend"    && <TrendTab allMetrics={allMetrics} trends={allTrends} />}
    </div>
  );
}

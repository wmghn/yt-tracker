import { useState, useMemo } from "react";
import type { VideoRow, StaffMember } from "@/types";
import {
  getDistinctPeriods,
  computeAllPeriodMetrics,
  computeTrends,
} from "@/lib/services/analytics";
import OverviewTab    from "./OverviewTab";
import RoleCompareTab from "./RoleCompareTab";
import RankingTab     from "./RankingTab";
import TrendTab       from "./TrendTab";

interface Props {
  videos:    VideoRow[];
  staffList: StaffMember[];
  weights:   Record<string, number>;
}

type SubTab      = "overview" | "role" | "ranking" | "trend";
type PeriodRange = "3m" | "6m" | "12m" | "all";

export default function AnalyticsDashboard({ videos, staffList, weights }: Props) {
  const [subTab,      setSubTab]      = useState<SubTab>("overview");
  const [periodRange, setPeriodRange] = useState<PeriodRange>("6m");

  // All distinct periods in the uploaded data (newest first)
  const allPeriods = useMemo(() => getDistinctPeriods(videos), [videos]);

  // Apply period range filter
  const activePeriods = useMemo(() => {
    if (periodRange === "all") return allPeriods;
    const n = periodRange === "3m" ? 3 : periodRange === "6m" ? 6 : 12;
    return allPeriods.slice(0, n);
  }, [allPeriods, periodRange]);

  // Filter videos to only those within the active periods
  const filteredVideos = useMemo(() => {
    const set = new Set(activePeriods);
    return videos.filter(v => v.publishedMonth && set.has(v.publishedMonth));
  }, [videos, activePeriods]);

  const allMetrics  = useMemo(
    () => computeAllPeriodMetrics(filteredVideos, staffList, weights),
    [filteredVideos, staffList, weights],
  );
  const trends = useMemo(() => computeTrends(allMetrics), [allMetrics]);

  if (allPeriods.length < 2) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="card p-16 text-center">
          <p className="text-4xl mb-4">📈</p>
          <h2 className="text-xl font-bold text-ink mb-2">Chưa đủ dữ liệu</h2>
          <p className="text-ink-muted">
            Cần dữ liệu từ ít nhất 2 tháng để xem phân tích xu hướng.
          </p>
          <p className="text-sm text-ink-muted mt-1">
            Hiện có: <strong>{allPeriods.length} tháng</strong>. Upload file YouTube Analytics chứa nhiều tháng
            (cột <em>Thời gian xuất bản video</em>).
          </p>
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Phân tích nhân sự</h1>
          <p className="text-sm text-ink-muted">
            {allPeriods.length} tháng trong dữ liệu · Tháng gần nhất:{" "}
            {activePeriods[0]
              ? activePeriods[0].replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `Tháng ${parseInt(m)}/${y}`)
              : "—"}
          </p>
        </div>

        {/* Period range filter */}
        <div className="flex gap-1 bg-surface-2 rounded-xl p-1">
          {(["3m", "6m", "12m", "all"] as PeriodRange[]).map(r => (
            <button
              key={r}
              onClick={() => setPeriodRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                periodRange === r ? "bg-white shadow-sm text-ink" : "text-ink-tertiary hover:text-ink"
              }`}
            >
              {r === "all" ? "Tất cả" : r.toUpperCase()}
            </button>
          ))}
        </div>
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

      {subTab === "overview" && (
        <OverviewTab allMetrics={allMetrics} trends={trends} />
      )}
      {subTab === "role" && (
        <RoleCompareTab allMetrics={allMetrics} trends={trends} />
      )}
      {subTab === "ranking" && (
        <RankingTab allMetrics={allMetrics} filteredVideos={filteredVideos} staffList={staffList} />
      )}
      {subTab === "trend" && (
        <TrendTab allMetrics={allMetrics} trends={trends} />
      )}
    </div>
  );
}

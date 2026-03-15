import { useState, useMemo } from "react";
import type { StaffAttribution, OptionalColumnKey, ExportOptionalColumn, ExportConfig } from "@/types";
import { GROUPS, getGroup } from "@/config/groups";
import { formatFormula } from "@/lib/services/attribution";
import { exportToExcel } from "@/lib/exporters/excel-export";
import ExportModal from "./ExportModal";

interface Props {
  results:          StaffAttribution[];
  weights:          Record<string, number>;
  detectedOptional: OptionalColumnKey[];
  onBack:           () => void;
}

export default function ResultsTable({ results, weights, detectedOptional, onBack }: Props) {
  const [expandedId,  setExpandedId]  = useState<string | null>(results[0]?.staffId ?? null);
  const [showExport,  setShowExport]  = useState(false);
  const [countFilter, setCountFilter] = useState<number | null>(null); // null = show all

  // Build set of distinct contributor counts across ALL videos in ALL staff
  const allCounts = useMemo(() => {
    const counts = new Set<number>();
    results.forEach((r) =>
      r.videos.forEach((v) => counts.add(v.contributors.length))
    );
    return Array.from(counts).sort((a, b) => a - b);
  }, [results]);

  // Filter each staff member's video list by contributor count
  const filteredResults = useMemo(() => {
    if (countFilter === null) return results;
    return results
      .map((r) => ({
        ...r,
        videos: r.videos.filter((v) => v.contributors.length === countFilter),
        totalViewsEarned: r.videos
          .filter((v) => v.contributors.length === countFilter)
          .reduce((s, v) => s + v.viewsEarned, 0),
      }))
      .filter((r) => r.videos.length > 0);
  }, [results, countFilter]);

  const handleExport = (sel: ExportOptionalColumn[], staffFilter: "all" | string) => {
    exportToExcel(results, { selectedOptional: sel, staffFilter } as ExportConfig);
    setShowExport(false);
  };

  const totalViews   = filteredResults.reduce((s, r) => s + r.totalViewsEarned, 0);
  const uniqueVideos = new Set(filteredResults.flatMap((r) => r.videos.map((v) => v.youtubeId))).size;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-2">Kết quả tính toán</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {GROUPS.map((g) => {
              const w = weights[g.key] ?? g.weight;
              return (
                <span key={g.key} className={`text-sm font-semibold px-3 py-1 rounded-full border ${g.color.bg} ${g.color.text} ${g.color.border}`}>
                  {g.label} {w}%
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex gap-3 mt-1">
          <button onClick={onBack} className="btn-ghost btn-sm">← Sửa</button>
          <button onClick={() => setShowExport(true)} className="btn-primary btn-sm px-5">↓ Export Excel</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Tổng views phân bổ", value: totalViews.toLocaleString("vi-VN") },
          { label: "Nhân sự", value: String(filteredResults.length) },
          { label: "Videos được track", value: String(uniqueVideos) },
        ].map(({ label, value }) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-ink-tertiary mb-1">{label}</p>
            <p className="text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Contributor count filter ──────────────────────────────────────── */}
      {allCounts.length > 1 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-sm font-semibold text-ink-secondary mr-1">Lọc theo số người làm video:</span>
          <button
            onClick={() => setCountFilter(null)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
              countFilter === null
                ? "border-accent bg-accent-muted text-accent"
                : "border-border bg-white text-ink-tertiary hover:border-border-strong"
            }`}
          >
            Tất cả
          </button>
          {allCounts.map((n) => {
            // Count how many videos across all staff have exactly n contributors
            const videoCount = new Set(
              results.flatMap((r) =>
                r.videos.filter((v) => v.contributors.length === n).map((v) => v.youtubeId)
              )
            ).size;
            return (
              <button
                key={n}
                onClick={() => setCountFilter(countFilter === n ? null : n)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all flex items-center gap-2 ${
                  countFilter === n
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border bg-white text-ink-tertiary hover:border-border-strong"
                }`}
              >
                <span>{n} người</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  countFilter === n ? "bg-accent/20 text-accent" : "bg-surface-2 text-ink-muted"
                }`}>{videoCount}</span>
              </button>
            );
          })}
          {countFilter !== null && (
            <span className="text-xs text-ink-muted ml-1">
              — Đang lọc video có đúng {countFilter} người tham gia
            </span>
          )}
        </div>
      )}

      {/* Results list */}
      <div className="space-y-3">
        {filteredResults.map((r) => {
          const isOpen = expandedId === r.staffId;
          const group  = getGroup(r.role);

          return (
            <div key={r.staffId} className="card overflow-hidden">
              {/* Staff summary row */}
              <div
                className="flex items-center gap-4 px-6 py-5 cursor-pointer hover:bg-surface-2/50 transition-colors"
                onClick={() => setExpandedId(isOpen ? null : r.staffId)}
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-base font-bold flex-shrink-0 ${group.color.bg} ${group.color.text} ${group.color.border}`}>
                  {r.staffName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-ink text-base">{r.staffName}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${group.color.bg} ${group.color.text} ${group.color.border}`}>
                      {group.label} · {weights[r.role] ?? group.weight}%
                    </span>
                    {countFilter !== null && (
                      <span className="text-xs text-ink-muted">{r.videos.length} videos (đã lọc)</span>
                    )}
                  </div>
                  {countFilter === null && (
                    <p className="text-sm text-ink-muted mt-0.5">{r.videos.length} videos</p>
                  )}
                </div>
                <div className="text-right mr-3">
                  <p className="text-2xl font-bold text-accent">{r.totalViewsEarned.toLocaleString("vi-VN")}</p>
                  <p className="text-xs text-ink-muted">views nhận được</p>
                </div>
                <span className={`text-ink-muted text-sm transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▼</span>
              </div>

              {/* Video detail table */}
              {isOpen && (
                <div className="border-t border-border animate-in">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-2">
                          {["Tiêu đề video", "Video ID", "Tổng views", "Người làm", "Công thức", "Views nhận"].map((h, i) => (
                            <th key={h} className={`text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 ${i === 0 ? "pl-6" : ""} ${i === 5 ? "text-right pr-6" : "text-left"} whitespace-nowrap`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {r.videos.map((v) => (
                          <tr key={v.youtubeId} className="hover:bg-surface-2/40 transition-colors">
                            <td className="pl-6 pr-4 py-4 max-w-xs">
                              <p className="font-medium text-ink truncate" title={v.title}>{v.title}</p>
                            </td>
                            <td className="px-4 py-4">
                              <a href={`https://youtube.com/watch?v=${v.youtubeId}`}
                                target="_blank" rel="noopener noreferrer"
                                className="font-mono text-xs text-blue-500 hover:underline"
                                onClick={(e) => e.stopPropagation()}>
                                {v.youtubeId}
                              </a>
                            </td>
                            <td className="px-4 py-4 font-mono font-medium text-ink-secondary whitespace-nowrap">
                              {v.totalViews.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {/* Contributor count badge */}
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                  v.contributors.length === 1
                                    ? "bg-slate-50 text-slate-500 border-slate-200"
                                    : v.contributors.length === 2
                                    ? "bg-sky-50 text-sky-600 border-sky-200"
                                    : v.contributors.length === 3
                                    ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                                    : "bg-purple-50 text-purple-600 border-purple-200"
                                }`}>
                                  {v.contributors.length}P
                                </span>
                                {v.contributors.map((name) => {
                                  const cGroup = results.find((x) => x.staffName === name);
                                  const cg     = cGroup ? getGroup(cGroup.role) : null;
                                  return (
                                    <span key={name}
                                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                        name === r.staffName && cg
                                          ? `${cg.color.bg} ${cg.color.text} border ${cg.color.border}`
                                          : "bg-surface-2 text-ink-tertiary border border-border"
                                      }`}>
                                      {name}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="font-mono text-xs text-ink-tertiary whitespace-nowrap">
                                {formatFormula(v, group.label)}
                              </span>
                            </td>
                            <td className="px-4 pr-6 py-4 text-right">
                              <span className="text-lg font-bold text-accent">{v.viewsEarned.toLocaleString("vi-VN")}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-2 border-t-2 border-border-strong">
                          <td colSpan={5} className="pl-6 px-4 py-3 text-sm font-semibold text-ink-secondary">Tổng cộng</td>
                          <td className="px-4 pr-6 py-3 text-right text-xl font-bold text-accent">
                            {r.totalViewsEarned.toLocaleString("vi-VN")}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredResults.length === 0 && (
        <div className="card p-16 text-center">
          <p className="text-base text-ink-muted">
            {countFilter !== null
              ? `Không có video nào có đúng ${countFilter} người làm.`
              : "Không có kết quả — kiểm tra lại video ID của nhân sự"}
          </p>
          {countFilter !== null && (
            <button onClick={() => setCountFilter(null)} className="mt-4 btn-ghost btn-sm mx-auto">Xoá bộ lọc</button>
          )}
        </div>
      )}

      {showExport && (
        <ExportModal
          results={results}
          detectedOptional={detectedOptional}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

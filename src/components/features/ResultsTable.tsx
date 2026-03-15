import { useState } from "react";
import type { StaffAttribution, GroupConfig, OptionalColumnKey, ExportOptionalColumn, ExportConfig } from "@/types";
import { formatFormula } from "@/lib/services/attribution";
import { exportToExcel } from "@/lib/exporters/excel-export";
import ExportModal from "./ExportModal";

interface Props {
  results: StaffAttribution[];
  config: GroupConfig;
  detectedOptional: OptionalColumnKey[];
  onBack: () => void;
}

export default function ResultsTable({ results, config, detectedOptional, onBack }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  const handleExport = (selectedOptional: ExportOptionalColumn[]) => {
    const cfg: ExportConfig = { selectedOptional };
    exportToExcel(results, cfg);
    setShowExport(false);
  };

  const totalViews = results.reduce((s, r) => s + r.totalViewsEarned, 0);
  const editorPct = config.editorWeight;
  const contentPct = config.contentWeight;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Kết quả tính toán</h1>
          <p className="text-slate-400 text-sm">
            Tỷ trọng: Editor {editorPct}% · Content {contentPct}% · {results.length} nhân sự
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-ghost text-xs py-2 px-3">← Sửa</button>
          <button onClick={() => setShowExport(true)} className="btn-primary text-xs py-2 px-4">
            ↓ Export Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">Tổng views phân bổ</div>
          <div className="text-xl font-semibold text-white">{totalViews.toLocaleString("vi-VN")}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">Nhân sự</div>
          <div className="text-xl font-semibold text-white">{results.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">Tỷ trọng</div>
          <div className="text-sm font-medium mt-1 flex gap-2">
            <span className="badge-editor">Editor {editorPct}%</span>
            <span className="badge-content">Content {contentPct}%</span>
          </div>
        </div>
      </div>

      {/* Results table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Nhân sự</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Vai trò</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Videos</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Tổng views nhận</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <>
                {/* Summary row */}
                <tr
                  key={r.staffId}
                  className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-surface-2/50 ${
                    expandedId === r.staffId ? "bg-surface-2/30" : ""
                  }`}
                  onClick={() => setExpandedId(expandedId === r.staffId ? null : r.staffId)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-xs font-medium text-slate-300">
                        {r.staffName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{r.staffName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={r.role === "EDITOR" ? "badge-editor" : "badge-content"}>
                      {r.role === "EDITOR" ? "Editor" : "Content"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">{r.videos.length}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-accent text-base">
                      {r.totalViewsEarned.toLocaleString("vi-VN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {expandedId === r.staffId ? "▲" : "▼"}
                  </td>
                </tr>

                {/* Expanded video breakdown */}
                {expandedId === r.staffId && (
                  <tr key={`${r.staffId}-detail`} className="bg-surface-2/20">
                    <td colSpan={5} className="px-4 py-2">
                      <div className="py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-600">
                              <th className="text-left py-1.5 pr-4 font-medium">Tiêu đề video</th>
                              <th className="text-left py-1.5 pr-4 font-medium w-32">Video ID</th>
                              <th className="text-right py-1.5 pr-4 font-medium">Tổng views</th>
                              <th className="text-left py-1.5 pr-4 font-medium">Người làm</th>
                              <th className="text-left py-1.5 pr-4 font-medium">Công thức</th>
                              <th className="text-right py-1.5 font-medium">Views nhận</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.videos.map((v) => (
                              <tr key={v.youtubeId} className="border-t border-border/30">
                                <td className="py-2 pr-4 text-slate-300 max-w-[240px]">
                                  <div className="truncate" title={v.title}>{v.title}</div>
                                </td>
                                <td className="py-2 pr-4">
                                  <a
                                    href={`https://youtube.com/watch?v=${v.youtubeId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-blue-400/70 hover:text-blue-400 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {v.youtubeId}
                                  </a>
                                </td>
                                <td className="py-2 pr-4 text-right text-slate-400 font-mono">
                                  {v.totalViews.toLocaleString("vi-VN")}
                                </td>
                                <td className="py-2 pr-4 text-slate-400">
                                  <div className="flex flex-wrap gap-1">
                                    {v.contributors.map((name) => (
                                      <span
                                        key={name}
                                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                                          name === r.staffName
                                            ? r.role === "EDITOR"
                                              ? "bg-blue-500/20 text-blue-300"
                                              : "bg-purple-500/20 text-purple-300"
                                            : "bg-surface-3 text-slate-500"
                                        }`}
                                      >
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-2 pr-4 font-mono text-slate-500 text-[10px]">
                                  {formatFormula(v, r.role)}
                                </td>
                                <td className="py-2 text-right font-semibold text-accent">
                                  {v.viewsEarned.toLocaleString("vi-VN")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-border/50">
                              <td colSpan={5} className="py-2 text-slate-500 font-medium">Tổng</td>
                              <td className="py-2 text-right font-bold text-accent">
                                {r.totalViewsEarned.toLocaleString("vi-VN")}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {results.length === 0 && (
          <div className="text-center py-16 text-slate-600">
            <p className="text-sm">Không có kết quả — kiểm tra lại video ID của nhân sự</p>
          </div>
        )}
      </div>

      {showExport && (
        <ExportModal
          detectedOptional={detectedOptional}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

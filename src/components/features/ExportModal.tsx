import { useState } from "react";
import type { ExportOptionalColumn, OptionalColumnKey, StaffAttribution } from "@/types";
import { OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";

interface Props {
  results:          StaffAttribution[];
  detectedOptional: OptionalColumnKey[];
  onExport: (sel: ExportOptionalColumn[], staffFilter: "all" | string) => void;
  onClose:  () => void;
}

const MANDATORY = [
  "Video ID",
  "Tiêu đề video",
  "Số lượt xem (tổng)",
  "Số người làm video + tên",
  "Views nhận được",
  "Công thức tính",
];

const ALL_OPT: ExportOptionalColumn[] = ["duration", "watchTime", "subscribers", "revenue"];

export default function ExportModal({ results, detectedOptional, onExport, onClose }: Props) {
  const available = ALL_OPT.filter((c) => detectedOptional.includes(c));
  const [selected,     setSelected]     = useState<ExportOptionalColumn[]>([]);
  const [staffFilter,  setStaffFilter]  = useState<"all" | string>("all");

  const toggle = (c: ExportOptionalColumn) =>
    setSelected((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const selectedStaff = results.find((r) => r.staffId === staffFilter);
  const exportLabel   = staffFilter === "all"
    ? `Tất cả (${results.length} nhân sự)`
    : selectedStaff?.staffName ?? "—";

  return (
    <div className="fixed inset-0 bg-ink/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade">
      <div className="card w-full max-w-lg p-7 shadow-xl animate-in overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-ink">Export Excel</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center text-ink-tertiary hover:text-ink text-lg transition-colors">×</button>
        </div>

        {/* ── Staff filter ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">Xuất cho ai?</p>

          {/* All option */}
          <button
            onClick={() => setStaffFilter("all")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all mb-2 ${
              staffFilter === "all"
                ? "border-accent bg-accent-muted"
                : "border-border bg-white hover:border-border-strong"
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              staffFilter === "all" ? "border-accent bg-accent" : "border-border-strong"
            }`}>
              {staffFilter === "all" && <span className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">Tất cả nhân sự</p>
              <p className="text-xs text-ink-tertiary">{results.length} người — Summary + Detail đầy đủ</p>
            </div>
          </button>

          {/* Per-staff options */}
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={r.staffId}
                onClick={() => setStaffFilter(r.staffId)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  staffFilter === r.staffId
                    ? "border-accent bg-accent-muted"
                    : "border-border bg-white hover:border-border-strong"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  staffFilter === r.staffId ? "border-accent bg-accent" : "border-border-strong"
                }`}>
                  {staffFilter === r.staffId && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink text-sm">{r.staffName}</p>
                    <span className="text-xs text-ink-tertiary">·</span>
                    <p className="text-xs text-ink-tertiary">{r.videos.length} videos</p>
                  </div>
                  <p className="text-xs text-accent font-semibold">{r.totalViewsEarned.toLocaleString("vi-VN")} views</p>
                </div>
                <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold text-ink-secondary flex-shrink-0">
                  {r.staffName.charAt(0).toUpperCase()}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Mandatory columns ─────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">Cột bắt buộc</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {MANDATORY.map((col) => (
              <div key={col} className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 text-[10px] font-bold flex-shrink-0">✓</div>
                <span className="text-ink-secondary text-xs">{col}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Optional columns ──────────────────────────────────────────── */}
        {available.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">Cột tuỳ chọn</p>
            <div className="grid grid-cols-2 gap-2">
              {available.map((col) => (
                <label key={col} className="flex items-center gap-2.5 cursor-pointer group px-3 py-2.5 rounded-xl border border-border hover:border-accent/50 transition-all">
                  <div onClick={() => toggle(col)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      selected.includes(col) ? "bg-accent border-accent text-white" : "border-border-strong bg-white"
                    }`}>
                    {selected.includes(col) && "✓"}
                  </div>
                  <span className="text-sm text-ink-secondary select-none">{OPTIONAL_COLUMN_LABELS[col]}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5 flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Huỷ</button>
          <button
            onClick={() => onExport(selected, staffFilter)}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <span>↓</span>
            <span className="truncate max-w-[160px]">{exportLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

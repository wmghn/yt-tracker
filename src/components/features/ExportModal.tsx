import { useState, useEffect, useCallback } from "react";
import type { ExportOptionalColumn, OptionalColumnKey, StaffAttribution } from "@/types";
import { OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";
import { getGroup } from "@/config/groups";

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
  const [closing,      setClosing]      = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose]);

  const toggle = (c: ExportOptionalColumn) =>
    setSelected((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const selectedStaff = results.find((r) => r.staffId === staffFilter);

  const handleExport = () => {
    onExport(selected, staffFilter);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-300 ${closing ? "opacity-0" : "animate-fade"}`}
        onClick={handleClose}
      />

      {/* Slide panel */}
      <div className={`relative w-full max-w-md bg-surface-1 shadow-2xl flex flex-col h-full border-l border-border ${closing ? "animate-slide-out" : "animate-slide-in"}`}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white/60">
          <div>
            <h2 className="text-lg font-bold text-ink">Export Excel</h2>
            <p className="text-xs text-ink-muted mt-0.5">Chọn nhân sự và cột dữ liệu cần xuất</p>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-2 flex items-center justify-center text-ink-tertiary hover:text-ink text-lg transition-colors"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Staff filter */}
          <div className="px-6 pt-6 pb-2">
            <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">Xuất cho ai?</p>

            {/* All staff option */}
            <button
              onClick={() => setStaffFilter("all")}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all mb-2 ${
                staffFilter === "all"
                  ? "border-accent bg-accent/5"
                  : "border-border bg-white hover:border-border-strong"
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                staffFilter === "all" ? "border-accent bg-accent" : "border-border-strong"
              }`}>
                {staffFilter === "all" && <span className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink text-sm">Tất cả nhân sự</p>
                <p className="text-xs text-ink-tertiary">{results.length} người — Summary + Detail đầy đủ</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
                <span className="text-sm">👥</span>
              </div>
            </button>

            {/* Individual staff */}
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {results.map((r) => {
                const group = getGroup(r.role);
                const isActive = staffFilter === r.staffId;
                return (
                  <button
                    key={r.staffId}
                    onClick={() => setStaffFilter(r.staffId)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      isActive
                        ? "border-accent bg-accent/5"
                        : "border-transparent bg-white hover:bg-surface-2/60"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isActive ? "border-accent bg-accent" : "border-border-strong"
                    }`}>
                      {isActive && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>

                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold flex-shrink-0 ${group.color.bg} ${group.color.text} ${group.color.border}`}>
                      {r.staffName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink text-sm truncate">{r.staffName}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${group.color.bg} ${group.color.text}`}>
                          {group.label.charAt(0)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">{r.videos.length} videos</p>
                    </div>

                    <p className="text-sm font-bold text-accent tabular-nums flex-shrink-0">
                      {r.totalViewsEarned.toLocaleString("vi-VN")}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-6 my-4 border-t border-border" />

          {/* Column config */}
          <div className="px-6 pb-6">
            <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">Cột dữ liệu</p>

            {/* Mandatory */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-ink-secondary mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Luôn bao gồm
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MANDATORY.map((col) => (
                  <span key={col} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            {/* Optional */}
            {available.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-ink-secondary mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Tuỳ chọn thêm
                </p>
                <div className="space-y-1.5">
                  {available.map((col) => {
                    const isOn = selected.includes(col);
                    return (
                      <button
                        key={col}
                        onClick={() => toggle(col)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left ${
                          isOn
                            ? "border-accent/40 bg-accent/5"
                            : "border-border bg-white hover:border-border-strong"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                          isOn ? "bg-accent border-accent text-white" : "border-border-strong bg-white"
                        }`}>
                          {isOn && "✓"}
                        </div>
                        <span className="text-sm text-ink-secondary flex-1">{OPTIONAL_COLUMN_LABELS[col]}</span>
                        {isOn && <span className="text-xs text-accent font-semibold">Bao gồm</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer / Action ─────────────────────────────────────── */}
        <div className="border-t border-border bg-white/80 px-6 py-4">
          {/* Summary line */}
          <div className="flex items-center gap-2 mb-3 text-xs text-ink-muted">
            <span className="font-semibold text-ink">
              {staffFilter === "all"
                ? `${results.length} nhân sự`
                : selectedStaff?.staffName ?? "—"
              }
            </span>
            <span>·</span>
            <span>{MANDATORY.length + selected.length} cột</span>
            {selected.length > 0 && (
              <>
                <span>·</span>
                <span className="text-accent font-medium">+{selected.length} tuỳ chọn</span>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleClose} className="btn-ghost btn-sm flex-1">
              Huỷ
            </button>
            <button
              onClick={handleExport}
              className="btn-primary btn-sm flex-[2] flex items-center justify-center gap-2"
            >
              <span>↓</span>
              <span>Tải xuống Excel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

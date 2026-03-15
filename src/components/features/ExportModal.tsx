import { useState } from "react";
import type { ExportOptionalColumn, OptionalColumnKey } from "@/types";
import { OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";

interface Props {
  detectedOptional: OptionalColumnKey[];
  onExport: (selected: ExportOptionalColumn[]) => void;
  onClose: () => void;
}

export default function ExportModal({ detectedOptional, onExport, onClose }: Props) {
  const allOptional: ExportOptionalColumn[] = ["duration", "watchTime", "subscribers", "revenue"];
  const available = allOptional.filter((col) => detectedOptional.includes(col));

  const [selected, setSelected] = useState<ExportOptionalColumn[]>([]);

  const toggle = (col: ExportOptionalColumn) => {
    setSelected((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Export Excel</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none">×</button>
        </div>

        {/* Mandatory */}
        <div className="mb-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Cột bắt buộc (luôn có)
          </p>
          <div className="space-y-2">
            {[
              "Video ID",
              "Tiêu đề video",
              "Số lượt xem (tổng)",
              "Số người làm video + tên",
              "Views nhận được",
              "Công thức tính",
            ].map((col) => (
              <div key={col} className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 rounded bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-[10px]">✓</span>
                <span className="text-slate-400">{col}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Optional */}
        {available.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Cột tuỳ chọn (có trong file upload)
            </p>
            <div className="space-y-2">
              {available.map((col) => (
                <label key={col} className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    onClick={() => toggle(col)}
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-all cursor-pointer ${
                      selected.includes(col)
                        ? "bg-accent border-accent text-surface"
                        : "border-border bg-surface-2 group-hover:border-white/20"
                    }`}
                  >
                    {selected.includes(col) && "✓"}
                  </div>
                  <span className="text-sm text-slate-300">{OPTIONAL_COLUMN_LABELS[col]}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {available.length === 0 && (
          <p className="text-xs text-slate-600 mb-6">
            File upload không có cột tuỳ chọn nào (Doanh thu, Thời gian xem...).
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Huỷ</button>
          <button onClick={() => onExport(selected)} className="btn-primary flex-1">
            ↓ Download .xlsx
          </button>
        </div>
      </div>
    </div>
  );
}



import { useRef, useState } from "react";
import type { OptionalColumnKey, VideoRow } from "@/types";
import { parseYouTubeExport, REQUIRED_COLUMNS, OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";

interface Props {
  onSuccess: (videos: VideoRow[], detectedOptional: OptionalColumnKey[]) => void;
}

interface ColStatus { key: string; label: string; found: boolean; required: boolean; }
interface ParseState {
  status: "idle" | "success" | "error";
  message?: string; videoCount?: number; skipped?: number;
  columns?: ColStatus[]; detectedOptional?: OptionalColumnKey[]; videos?: VideoRow[];
  missingViews?: number; fileTotalViews?: number; parsedTotalViews?: number;
}

export default function UploadZone({ onSuccess }: Props) {
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ParseState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const processBuffer = (buffer: ArrayBuffer, filename: string) => {
    const parsed = parseYouTubeExport(buffer);
    if (!parsed.success) {
      const found = Object.entries(REQUIRED_COLUMNS)
        .filter(([, name]) => !(parsed.missing ?? []).includes(name))
        .map(([, name]) => ({ key: name, label: name, found: true, required: true }));
      const missing = (parsed.missing ?? []).map((name) => ({ key: name, label: name, found: false, required: true }));
      setResult({ status: "error", message: parsed.error, columns: [...found, ...missing] });
      return;
    }
    const reqCols: ColStatus[] = Object.entries(REQUIRED_COLUMNS).map(([, name]) => ({ key: name, label: name, found: true, required: true }));
    const optCols: ColStatus[] = (parsed.detectedOptional ?? []).map((key) => ({ key, label: OPTIONAL_COLUMN_LABELS[key], found: true, required: false }));
    setResult({ status: "success", videoCount: parsed.rows.length, skipped: parsed.skipped,
      columns: [...reqCols, ...optCols], detectedOptional: parsed.detectedOptional, videos: parsed.rows, message: filename,
      missingViews: parsed.missingViews, fileTotalViews: parsed.fileTotalViews, parsedTotalViews: parsed.parsedTotalViews });
  };

  const readFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|csv|xls)$/i)) {
      setResult({ status: "error", message: "Chỉ chấp nhận file .xlsx, .xls hoặc .csv" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => processBuffer(e.target!.result as ArrayBuffer, file.name);
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-ink mb-3">Upload YouTube Analytics</h1>
        <p className="text-base text-ink-tertiary leading-relaxed">
          Vào YouTube Studio → Analytics → Content → Xuất dữ liệu → tải file Excel hoặc CSV.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 ${
          dragging ? "border-accent bg-accent-light" : "border-border-strong hover:border-accent hover:bg-accent-muted"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
        <div className="w-16 h-16 rounded-2xl bg-accent-muted border-2 border-accent/20 flex items-center justify-center mx-auto mb-5">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 18V6M14 6L9 11M14 6L19 11" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 19v3a2 2 0 002 2h16a2 2 0 002-2v-3" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
          </svg>
        </div>
        <p className="text-lg font-semibold text-ink mb-1.5">Kéo thả file vào đây</p>
        <p className="text-sm text-ink-muted">hoặc click để chọn · .xlsx · .xls · .csv</p>
      </div>

      {/* Result */}
      {result.status !== "idle" && (
        <div className={`mt-5 card p-6 animate-in ${result.status === "error" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"}`}>
          {result.status === "success" ? (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-sm">✓</div>
                <div>
                  <p className="font-semibold text-ink">{result.videoCount} videos đã load</p>
                  <p className="text-sm text-ink-tertiary">{result.message}{result.skipped ? ` · ${result.skipped} dòng bỏ qua` : ""}</p>
                </div>
              </div>
              <div className="space-y-2 mb-5">
                {result.columns?.map((col) => (
                  <div key={col.key} className="flex items-center gap-3 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${col.found ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {col.found ? "✓" : "✗"}
                    </span>
                    <span className={col.found ? "text-ink-secondary" : "text-red-600 font-medium"}>{col.label}</span>
                    <span className="text-ink-muted text-xs">{col.required ? "bắt buộc" : "tuỳ chọn"}</span>
                  </div>
                ))}
              </div>
              {/* Missing views warning */}
              {result.missingViews !== undefined && result.missingViews > 0 && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-3">
                    <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-800">
                        Bảng export thiếu video — chênh lệch {result.missingViews.toLocaleString("vi-VN")} views
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Tổng "Số lượt xem" trong file: {result.fileTotalViews!.toLocaleString("vi-VN")} —
                        nhưng tổng từ {result.videoCount} video đã parse: {result.parsedTotalViews!.toLocaleString("vi-VN")}.
                        File YouTube Analytics export có thể không liệt kê đủ hết video.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <button className="btn-primary w-full text-base" onClick={() => onSuccess(result.videos!, result.detectedOptional!)}>
                Tiếp theo →
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 font-bold text-sm">✗</div>
                <div>
                  <p className="font-semibold text-red-700">Upload thất bại</p>
                  <p className="text-sm text-red-500">{result.message}</p>
                </div>
              </div>
              {result.columns && (
                <div className="space-y-2">
                  {result.columns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 text-sm">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${col.found ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{col.found ? "✓" : "✗"}</span>
                      <span className={col.found ? "text-ink-tertiary" : "text-red-600"}>{col.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-ink-muted mt-4 p-3 bg-surface-2 rounded-lg">
                Tên cột bắt buộc: <span className="font-mono font-medium text-ink-secondary">Nội dung · Tiêu đề video · Số lượt xem</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

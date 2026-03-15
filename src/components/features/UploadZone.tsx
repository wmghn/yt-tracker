import { useRef, useState } from "react";
import type { OptionalColumnKey, VideoRow } from "@/types";
import { parseYouTubeExport, REQUIRED_COLUMNS, OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";

interface Props {
  onSuccess: (videos: VideoRow[], detectedOptional: OptionalColumnKey[]) => void;
}

interface ColumnStatus {
  key: string;
  label: string;
  found: boolean;
  required: boolean;
}

interface ParseState {
  status: "idle" | "success" | "error";
  message?: string;
  videoCount?: number;
  skipped?: number;
  columns?: ColumnStatus[];
  detectedOptional?: OptionalColumnKey[];
  videos?: VideoRow[];
}

export default function UploadZone({ onSuccess }: Props) {
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ParseState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const processBuffer = (buffer: ArrayBuffer, filename: string) => {
    const parsed = parseYouTubeExport(buffer);

    if (!parsed.success) {
      const missingCols = (parsed.missing ?? []).map((name) => ({
        key: name,
        label: name,
        found: false,
        required: true,
      }));

      const foundCols = Object.entries(REQUIRED_COLUMNS)
        .filter(([, name]) => !(parsed.missing ?? []).includes(name))
        .map(([, name]) => ({ key: name, label: name, found: true, required: true }));

      setResult({
        status: "error",
        message: parsed.error,
        columns: [...foundCols, ...missingCols],
      });
      return;
    }

    // Build column status for display
    const allReqCols: ColumnStatus[] = Object.entries(REQUIRED_COLUMNS).map(([, name]) => ({
      key: name,
      label: name,
      found: true,
      required: true,
    }));

    const optCols: ColumnStatus[] = (parsed.detectedOptional ?? []).map((key) => ({
      key,
      label: OPTIONAL_COLUMN_LABELS[key],
      found: true,
      required: false,
    }));

    setResult({
      status: "success",
      videoCount: parsed.rows.length,
      skipped: parsed.skipped,
      columns: [...allReqCols, ...optCols],
      detectedOptional: parsed.detectedOptional,
      videos: parsed.rows,
      message: filename,
    });
  };

  const readFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|csv|xls)$/i)) {
      setResult({ status: "error", message: "Chỉ chấp nhận file .xlsx, .xls hoặc .csv" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      processBuffer(e.target!.result as ArrayBuffer, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-2">Upload YouTube Analytics</h1>
        <p className="text-slate-400 text-sm">
          Export từ YouTube Studio → Analytics → Content → Xuất → chọn định dạng Excel hoặc CSV.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
          ${dragging ? "border-accent bg-accent/5" : "border-border hover:border-white/20"}
        `}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChange} />
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 14V4M11 4L7.5 7.5M11 4L14.5 7.5" stroke="#00d084" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 15v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-white font-medium mb-1">Kéo thả file vào đây</p>
        <p className="text-slate-500 text-sm">hoặc click để chọn file · .xlsx .xls .csv</p>
      </div>

      {/* Result */}
      {result.status !== "idle" && (
        <div className={`mt-4 card p-5 animate-in ${result.status === "error" ? "border-red-500/30" : "border-accent/20"}`}>
          {result.status === "success" ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs">✓</span>
                <span className="text-white font-medium text-sm">{result.videoCount} videos loaded</span>
                {result.skipped ? (
                  <span className="text-slate-500 text-xs">· {result.skipped} dòng bỏ qua</span>
                ) : null}
                <span className="ml-auto text-slate-500 text-xs font-mono truncate max-w-[180px]">{result.message}</span>
              </div>

              <div className="space-y-1.5">
                {result.columns?.map((col) => (
                  <div key={col.key} className="flex items-center gap-2 text-xs">
                    <span className={col.found ? "text-accent" : "text-red-400"}>
                      {col.found ? "✓" : "✗"}
                    </span>
                    <span className={col.found ? "text-slate-300" : "text-red-400"}>{col.label}</span>
                    <span className="text-slate-600">
                      {col.required ? "(bắt buộc)" : "(tuỳ chọn — có trong file)"}
                    </span>
                  </div>
                ))}
              </div>

              <button
                className="btn-primary mt-5 w-full"
                onClick={() => onSuccess(result.videos!, result.detectedOptional!)}
              >
                Tiếp theo →
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs">✗</span>
                <span className="text-red-400 font-medium text-sm">Upload thất bại</span>
              </div>
              <p className="text-slate-400 text-xs mb-3">{result.message}</p>
              {result.columns && result.columns.length > 0 && (
                <div className="space-y-1">
                  {result.columns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 text-xs">
                      <span className={col.found ? "text-accent" : "text-red-400"}>{col.found ? "✓" : "✗"}</span>
                      <span className={col.found ? "text-slate-400" : "text-red-400"}>{col.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-slate-500 text-xs mt-3">
                Tên cột bắt buộc: <span className="font-mono text-slate-400">Nội dung · Tiêu đề video · Số lượt xem</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";

import { fetchTranscript } from "@/lib/transcript/fetcher";
import {
  saveTranscript, hasTranscript, getStats,

} from "@/lib/transcript/db";
import { parseYouTubeExport } from "@/lib/parsers/youtube-export";
import type { VideoRow } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobItem {
  videoId:   string;
  title:     string;
  status:    "pending" | "fetching" | "done" | "error" | "skipped";
  chars?:    number;
  lang?:     string;
  error?:    string;
}

interface DBStats { total: number; totalChars: number; languages: Record<string, number>; }

function fmtSize(chars: number) {
  if (chars > 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M chars`;
  if (chars > 1_000)     return `${(chars / 1_000).toFixed(0)}K chars`;
  return `${chars} chars`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TranscriptDownloader() {
  const [dbStats,    setDbStats]    = useState<DBStats | null>(null);
  const [videos,     setVideos]     = useState<VideoRow[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [skipExist,  setSkipExist]  = useState(true);
  const [items,      setItems]      = useState<JobItem[]>([]);
  const [running,    setRunning]    = useState(false);
  const [progress,   setProgress]   = useState(0);
  const abortRef = useRef(false);
  const fileRef  = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(async () => {
    const s = await getStats();
    setDbStats(s);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Load video list from YouTube export ──────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = parseYouTubeExport(ev.target!.result as ArrayBuffer);
      if (!result.success) { alert(result.error); return; }

      // Check which already have transcripts
      const rows = result.rows;
      const withStatus = await Promise.all(
        rows.map(async v => ({ ...v, _has: await hasTranscript(v.youtubeId) }))
      );
      setVideos(rows);
      setSelected(new Set(
        withStatus.filter(v => !v._has).map(v => v.youtubeId)
      ));
      setItems([]);
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Toggle selection ──────────────────────────────────────────────────────
  const toggleAll = () => {
    setSelected(selected.size === videos.length
      ? new Set()
      : new Set(videos.map(v => v.youtubeId)));
  };

  const toggleOne = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  // ── Run download ──────────────────────────────────────────────────────────
  const startDownload = async () => {
    const toFetch = videos.filter(v => selected.has(v.youtubeId));
    if (!toFetch.length) return;

    abortRef.current = false;
    setRunning(true);
    setProgress(0);

    const initialItems: JobItem[] = toFetch.map(v => ({
      videoId: v.youtubeId, title: v.title, status: "pending",
    }));
    setItems(initialItems);

    for (let i = 0; i < toFetch.length; i++) {
      if (abortRef.current) break;

      const v = toFetch[i];

      // Skip if already in DB and skipExist is on
      if (skipExist && await hasTranscript(v.youtubeId)) {
        setItems(prev => prev.map((it, idx) =>
          idx === i ? { ...it, status: "skipped" } : it));
        setProgress(i + 1);
        continue;
      }

      // Mark as fetching
      setItems(prev => prev.map((it, idx) =>
        idx === i ? { ...it, status: "fetching" } : it));

      const result = await fetchTranscript(v.youtubeId);

      if (result.ok) {
        await saveTranscript(result.transcript, v.title);
        setItems(prev => prev.map((it, idx) =>
          idx === i ? {
            ...it, status: "done",
            chars: result.transcript.text.length,
            lang:  result.transcript.language,
          } : it));
      } else {
        setItems(prev => prev.map((it, idx) =>
          idx === i ? { ...it, status: "error", error: result.error } : it));
      }

      setProgress(i + 1);

      // Small delay between requests
      if (i < toFetch.length - 1) {
        await new Promise(r => setTimeout(r, 1500));  // 1.5s between requests to avoid 429
      }
    }

    setRunning(false);
    loadStats();
  };

  const done     = items.length > 0 && !running;
  const total    = items.length;
  const okCount  = items.filter(i => i.status === "done").length;
  const errCount = items.filter(i => i.status === "error").length;

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Transcript Downloader</h1>
          <p className="text-base text-ink-tertiary">
            Upload YouTube Analytics export → tải transcript thẳng trong browser.
          </p>
        </div>
        {dbStats && dbStats.total > 0 && (
          <div className="card-subtle p-4 text-right ml-6 flex-shrink-0">
            <p className="text-2xl font-bold text-ink">{dbStats.total}</p>
            <p className="text-xs text-ink-muted">transcript trong DB</p>
            <p className="text-xs text-ink-muted">{fmtSize(dbStats.totalChars)}</p>
          </div>
        )}
      </div>

      {/* How it works note */}
      <div className="card-subtle p-4 mb-6 flex items-start gap-3">
        <span className="text-lg mt-0.5">ℹ</span>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Chạy bằng <strong className="text-ink">npm run dev</strong> — Vite proxy YouTube API trực tiếp trong browser.
          Transcript được lưu vào <strong className="text-ink">IndexedDB</strong> trên máy của bạn (không bị mất khi reload).
          Chỉ cần đang đăng nhập YouTube trong browser này.
        </p>
      </div>

      {/* Upload export file */}
      {videos.length === 0 ? (
        <div
          className="border-2 border-dashed border-border-strong hover:border-accent rounded-2xl p-14 text-center cursor-pointer transition-all hover:bg-accent-muted/30"
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <div className="w-14 h-14 rounded-2xl bg-accent-muted border-2 border-accent/20 flex items-center justify-center mx-auto mb-4">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path d="M13 17V5M13 5L8 10M13 5L18 10" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 18v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
            </svg>
          </div>
          <p className="text-lg font-semibold text-ink mb-1">Upload YouTube Analytics Export</p>
          <p className="text-sm text-ink-muted">File .xlsx hoặc .csv từ YouTube Studio → Analytics → Content</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                onClick={toggleAll}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold cursor-pointer transition-all ${
                  selected.size === videos.length
                    ? "bg-accent border-accent text-white"
                    : selected.size > 0 ? "bg-accent/30 border-accent text-white"
                    : "border-border-strong bg-white"
                }`}
              >{selected.size > 0 && "✓"}</div>
              <span className="text-sm font-medium text-ink">{selected.size}/{videos.length} đã chọn</span>
              {running && (
                <span className="text-sm text-ink-tertiary flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  {progress}/{total}
                </span>
              )}
              {done && (
                <span className="text-sm">
                  <span className="text-emerald-600 font-medium">{okCount} thành công</span>
                  {errCount > 0 && <span className="text-red-500 font-medium ml-2">{errCount} lỗi</span>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-tertiary cursor-pointer">
                <input type="checkbox" checked={skipExist}
                  onChange={e => setSkipExist(e.target.checked)} className="accent-accent" />
                Bỏ qua đã có
              </label>
              <button onClick={() => { setVideos([]); setItems([]); setSelected(new Set()); }}
                className="btn-ghost btn-sm">↺ Đổi file</button>
              {running ? (
                <button onClick={() => { abortRef.current = true; }}
                  className="btn-sm px-4 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors">
                  ✕ Dừng
                </button>
              ) : (
                <button onClick={startDownload} disabled={selected.size === 0}
                  className="btn-primary btn-sm px-5">
                  ↓ Tải {selected.size} transcript
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {items.length > 0 && (
            <div className="mb-3">
              <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${done ? "bg-emerald-500" : "bg-accent"}`}
                  style={{ width: `${total ? (progress / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Video list */}
          <div className="card overflow-hidden">
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
              {videos.map((v) => {
                const item = items.find(it => it.videoId === v.youtubeId);
                return (
                  <div
                    key={v.youtubeId}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-surface-2/60 transition-colors ${
                      selected.has(v.youtubeId) ? "bg-accent-muted/40" : ""
                    }`}
                    onClick={() => !running && toggleOne(v.youtubeId)}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      selected.has(v.youtubeId)
                        ? "bg-accent border-accent text-white"
                        : "border-border-strong bg-white"
                    }`}>{selected.has(v.youtubeId) && "✓"}</div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{v.title}</p>
                      <p className="text-xs text-ink-muted font-mono">{v.youtubeId}</p>
                    </div>

                    {/* Views */}
                    <span className="text-xs text-ink-muted whitespace-nowrap">
                      {v.views.toLocaleString("vi-VN")} views
                    </span>

                    {/* Status */}
                    <div className="w-28 text-right flex-shrink-0">
                      {!item && <span className="text-xs text-ink-muted">—</span>}
                      {item?.status === "fetching" && (
                        <span className="flex items-center justify-end gap-1.5 text-xs text-accent">
                          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                          Đang tải...
                        </span>
                      )}
                      {item?.status === "done" && (
                        <span className="text-xs text-emerald-600 font-medium">
                          ✓ {item.chars ? fmtSize(item.chars) : ""} {item.lang ? `[${item.lang}]` : ""}
                        </span>
                      )}
                      {item?.status === "skipped" && (
                        <span className="text-xs text-ink-muted">↷ bỏ qua</span>
                      )}
                      {item?.status === "error" && (
                        <span className="text-xs text-red-500" title={item.error}>✗ Lỗi</span>
                      )}
                      {item?.status === "pending" && (
                        <span className="text-xs text-ink-muted">chờ...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

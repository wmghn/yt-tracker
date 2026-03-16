import { useRef, useState, useCallback, useEffect, useMemo, Fragment } from "react";
import * as XLSX from "xlsx";
import {
  searchChannelForTitle,
  normaliseChannelPath,
  type VideoCandidate,
  type SearchOutcome,
} from "@/lib/transcript/channel-search";

// ── Column config ─────────────────────────────────────────────────────────────
const DATA_START_ROW = 1;
const CACHE_KEY      = "yt-tracker-search-v1";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SheetRow {
  rowIndex:    number;
  query:       string;
  queryFrom:   "title" | "search";
  staffNames:  string[];
  productLink: string;  // link SẢN PHẨM (Google Drive)
  duration:    string;  // thời lượng từ sheet, e.g. "12:34"
  prefilledId?: string; // video ID trích từ cột Video URL (bỏ qua search nếu có)
}

type RowStatus =
  | "pending"
  | "searching"
  | "confirmed"
  | "multiple"
  | "notfound"
  | "skipped";

interface RowState {
  row:          SheetRow;
  status:       RowStatus;
  videoId:      string | null;
  matchedTitle: string | null;
  candidates:   VideoCandidate[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseStaffNames(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).trim().split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Trích video ID từ YouTube URL.
 * Xử lý mọi dạng: youtu.be/ID, ?v=ID, &v=ID, /embed/ID, /shorts/ID.
 * Chỉ lấy đúng 11 ký tự sau v=, bỏ qua mọi tham số khác.
 */
function extractVideoIdFromUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,          // ?v=ID  hoặc  &v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,      // youtu.be/ID
    /\/embed\/([a-zA-Z0-9_-]{11})/,        // /embed/ID
    /\/shorts\/([a-zA-Z0-9_-]{11})/,       // /shorts/ID
    /\/v\/([a-zA-Z0-9_-]{11})/,            // /v/ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Lấy URL từ một cell — ưu tiên hyperlink target (Smart Link) trước,
 * sau đó mới dùng giá trị text của cell.
 * Trường hợp Smart Link: cell.v = display text (tiêu đề), cell.l.Target = URL thật.
 */
function getCellUrl(ws: XLSX.WorkSheet, rowIdx: number, colIdx: number): string {
  if (colIdx < 0) return "";
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  const cell = ws[addr];
  if (!cell) return "";
  if (cell.l?.Target) return String(cell.l.Target).trim();
  return String(cell.v ?? "").trim();
}

/** Tìm link Google Drive trong hàng (không cần biết cột cố định) */
function findProductLink(row: unknown[]): string {
  for (const cell of row) {
    const val = String(cell ?? "").trim();
    if (val.startsWith("http") && (val.includes("drive.google.com") || val.includes("docs.google.com"))) {
      return val;
    }
  }
  return "";
}

/** Tìm index cột theo tên header (không phân biệt hoa/thường, bỏ dấu space) */
function findColByHeader(header: unknown[], ...keywords: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const kw = keywords.map(norm);
  for (let i = 0; i < header.length; i++) {
    const cell = norm(String(header[i] ?? ""));
    if (kw.some(k => cell === k || cell.includes(k))) return i;
  }
  return -1;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SheetMatcher() {
  const [channelInput,  setChannelInput]  = useState(() =>
    localStorage.getItem("yt-tracker-channel") ?? ""
  );
  const [rows,          setRows]          = useState<SheetRow[]>([]);
  const [states,        setStates]        = useState<RowState[]>([]);
  const [running,       setRunning]       = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [parseError,    setParseError]    = useState("");
  const [editIdx,       setEditIdx]       = useState<number | null>(null);
  const [editVal,       setEditVal]       = useState("");
  const [waitingForIdx,   setWaitingForIdx]   = useState<number | null>(null);
  const [isDragging,      setIsDragging]      = useState(false);
  const [showExportMenu,  setShowExportMenu]  = useState(false);

  const abortRef        = useRef(false);
  const fileRef         = useRef<HTMLInputElement>(null);
  const resumeRef       = useRef<(() => void) | null>(null);
  const statesRef       = useRef<RowState[]>([]);
  const rowRefs         = useRef<(HTMLTableRowElement | null)[]>([]);
  const originalRawRef  = useRef<unknown[][]>([]);
  const colTitleRef     = useRef(-1);
  const saveCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep statesRef in sync so async loop can read current state
  const updateStates = useCallback((updater: (prev: RowState[]) => RowState[]) => {
    setStates(prev => {
      const next = updater(prev);
      statesRef.current = next;
      return next;
    });
  }, []);

  // ── Cache: restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(CACHE_KEY);
    if (!saved) return;
    try {
      const { rows: r, states: st, originalRaw: raw } = JSON.parse(saved) as {
        rows: SheetRow[];
        states: RowState[];
        originalRaw: unknown[][];
      };
      if (!Array.isArray(r) || !r.length) return;

      // Reset trạng thái "searching" (bị interrupt khi refresh) về "pending"
      const restoredStates: RowState[] = (st ?? []).map(s => ({
        ...s,
        status: s.status === "searching" ? "pending" : s.status,
        // Đảm bảo thumbnail luôn có (có thể không được cache)
        candidates: (s.candidates ?? []).map(c => ({
          ...c,
          thumbnail: c.thumbnail || `https://i.ytimg.com/vi/${c.videoId}/mqdefault.jpg`,
        })),
      }));

      setRows(r);
      setStates(restoredStates);
      statesRef.current = restoredStates;

      if (Array.isArray(raw) && raw.length) {
        originalRawRef.current = raw;
        const header = (raw[0] ?? []) as unknown[];
        colTitleRef.current = findColByHeader(header, "tiêu đề", "tiêuđề", "title");
      }
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cache: save (debounced 800ms) khi rows/states thay đổi ───────────────
  useEffect(() => {
    if (!rows.length) return;
    if (saveCacheTimerRef.current) clearTimeout(saveCacheTimerRef.current);
    saveCacheTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          rows,
          states,
          originalRaw: originalRawRef.current,
        }));
      } catch {
        // Quota exceeded — thử lại không có originalRaw
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ rows, states, originalRaw: [] }));
        } catch { /* bỏ qua */ }
      }
    }, 800);
  }, [rows, states]);

  // ── Clear edit input when a new row starts waiting ────────────────────────
  useEffect(() => {
    if (waitingForIdx !== null) {
      setEditVal("");
      setEditIdx(null);
    }
  }, [waitingForIdx]);

  // ── Parse uploaded sheet ──────────────────────────────────────────────────
  const processFile = (file: File) => {
    localStorage.removeItem(CACHE_KEY); // xóa cache cũ khi upload file mới
    setParseError(""); setStates([]); setRows([]);
    statesRef.current = [];
    originalRawRef.current = [];

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb  = XLSX.read(ev.target!.result as ArrayBuffer, { type: "array" });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        originalRawRef.current = raw as unknown[][];

        // Detect tất cả cột từ header row — không hardcode index
        const header = (raw[0] ?? []) as unknown[];
        const colTitle    = findColByHeader(header, "tiêu đề", "tiêuđề", "title");
        const colSearch   = findColByHeader(header, "search", "tìm kiếm", "tìmkiếm");
        const colStaff    = findColByHeader(header, "tên người làm", "tênnngườilàm", "nhân sự", "nhânsự", "staff");
        const colDuration = findColByHeader(header, "thời lượng", "thờilượng", "duration", "length");
        const colVideoUrl = findColByHeader(header, "my video url");
        colTitleRef.current = colTitle;

        if (colTitle < 0) {
          setParseError("Không tìm thấy cột TIÊU ĐỀ trong file. Hãy kiểm tra lại header row.");
          return;
        }

        const parsed: SheetRow[] = [];
        for (let i = DATA_START_ROW; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          if (!row?.length) continue;
          const t = String(row[colTitle]  ?? "").trim();
          const s = colSearch >= 0 ? String(row[colSearch] ?? "").trim() : "";
          if (!t && !s) continue;

          // Trích video ID từ cột Video URL nếu có
          // getCellUrl kiểm tra hyperlink target (Smart Link) trước, rồi mới đọc text
          const urlRaw      = getCellUrl(ws, i, colVideoUrl);
          const prefilledId = extractVideoIdFromUrl(urlRaw) ?? undefined;

          parsed.push({
            rowIndex:    i,
            query:       t || s,
            queryFrom:   t ? "title" : "search",
            staffNames:  colStaff >= 0 ? parseStaffNames(row[colStaff]) : [],
            productLink: findProductLink(row),
            duration:    colDuration >= 0 ? String(row[colDuration] ?? "").trim() : "",
            prefilledId,
          });
        }

        if (!parsed.length) {
          setParseError("Không tìm thấy dữ liệu hợp lệ trong file.");
          return;
        }

        const initialStates = parsed.map(row => ({
          row,
          status:       row.prefilledId ? "confirmed" as RowStatus : "pending" as RowStatus,
          videoId:      row.prefilledId ?? null,
          matchedTitle: row.prefilledId ? "(from URL)" : null,
          candidates:   [],
        }));
        setRows(parsed);
        setStates(initialStates);
        statesRef.current = initialStates;
      } catch (err) {
        setParseError(String(err));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!channelInput.trim()) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processFile(file);
  };

  // ── Wait helpers ──────────────────────────────────────────────────────────
  const waitForUser = useCallback((idx: number): Promise<void> => {
    setWaitingForIdx(idx);
    setTimeout(() => {
      rowRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return new Promise<void>(resolve => {
      resumeRef.current = resolve;
    });
  }, []);

  const resumeSearch = useCallback(() => {
    setWaitingForIdx(null);
    if (resumeRef.current) {
      resumeRef.current();
      resumeRef.current = null;
    }
  }, []);

  // ── Run search ────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    if (!rows.length || !channelInput.trim()) return;

    const channelPath = normaliseChannelPath(channelInput);
    abortRef.current  = false;
    setRunning(true);
    setProgress(0);

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;

      const curr = statesRef.current[i];

      // Skip already done
      if (curr?.status === "confirmed" || curr?.status === "skipped") {
        setProgress(i + 1);
        continue;
      }

      // Already searched but needs user action — just wait
      if (curr?.status === "multiple" || curr?.status === "notfound") {
        await waitForUser(i);
        setProgress(i + 1);
        if (abortRef.current) break;
        continue;
      }

      // Mark as searching and scroll into view
      updateStates(prev => prev.map((s, idx) =>
        idx === i && s.status === "pending" ? { ...s, status: "searching" } : s
      ));
      setTimeout(() => {
        rowRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);

      let needUserAction = false;
      try {
        const outcome: SearchOutcome = await searchChannelForTitle(channelPath, rows[i].query);

        updateStates(prev => prev.map((s, idx) => {
          if (idx !== i) return s;
          if (outcome.type === "found") {
            return { ...s, status: "confirmed", videoId: outcome.candidates[0].videoId,
                     matchedTitle: outcome.candidates[0].title, candidates: outcome.candidates };
          }
          if (outcome.type === "multiple") {
            return { ...s, status: "multiple", candidates: outcome.candidates,
                     videoId: null, matchedTitle: null };
          }
          return { ...s, status: "notfound", candidates: [], videoId: null, matchedTitle: null };
        }));

        needUserAction = outcome.type === "multiple" || outcome.type === "notfound";
      } catch (e) {
        const msg = String(e);
        if (msg.includes("429")) {
          await sleep(5000);
          i--;
          continue;
        }
        updateStates(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: "notfound", candidates: [] } : s
        ));
        needUserAction = true;
      }

      if (needUserAction) {
        await waitForUser(i);
        if (abortRef.current) break;
      } else {
        await sleep(1200);
      }

      setProgress(i + 1);
    }

    setRunning(false);
  }, [rows, channelInput, updateStates, waitForUser]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const pickCandidate = useCallback((i: number, c: VideoCandidate) => {
    updateStates(prev => prev.map((s, idx) =>
      idx === i ? { ...s, status: "confirmed", videoId: c.videoId, matchedTitle: c.title } : s
    ));
    resumeSearch();
  }, [updateStates, resumeSearch]);

  const saveManual = useCallback((i: number) => {
    const id = editVal.trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return;
    updateStates(prev => prev.map((s, idx) =>
      idx === i ? { ...s, status: "confirmed", videoId: id, matchedTitle: "(manual)" } : s
    ));
    setEditIdx(null); setEditVal("");
    resumeSearch();
  }, [editVal, updateStates, resumeSearch]);

  const skipRow = useCallback((i: number) => {
    updateStates(prev => prev.map((s, idx) =>
      idx === i ? { ...s, status: "skipped", videoId: null } : s
    ));
    resumeSearch();
  }, [updateStates, resumeSearch]);

  const resetRow = useCallback((i: number) => {
    updateStates(prev => prev.map((s, idx) =>
      idx === i ? { ...s, status: "pending", videoId: null, matchedTitle: null, candidates: [] } : s
    ));
  }, [updateStates]);

  // ── Export ────────────────────────────────────────────────────────────────
  /**
   * doExport(personFilter?)
   *   - Không có personFilter → export toàn bộ (Export 1)
   *   - Có personFilter → chỉ export các row có tên người đó (Export 2)
   * Cả hai đều: giữ cấu trúc file gốc + ghi Video ID tìm được vào đúng cột.
   */
  const doExport = useCallback((personFilter?: string) => {
    const raw = originalRawRef.current;
    if (!raw.length) return;

    // Lọc states theo người nếu có
    const targetStates = personFilter
      ? states.filter(s => s.row.staffNames.includes(personFilter))
      : states;

    // Tập hợp rowIndex cần đưa vào file
    const targetSet = new Set(targetStates.map(s => s.row.rowIndex));

    // Build data: header (row 0) + các row cần thiết (theo thứ tự gốc)
    const data: unknown[][] = [];
    const rowIndexToDataIdx = new Map<number, number>();
    for (let i = 0; i < raw.length; i++) {
      if (i === 0 || targetSet.has(i)) {
        rowIndexToDataIdx.set(i, data.length);
        data.push([...(raw[i] as unknown[])]);
      }
    }

    // Tìm cột My Video ID trong header
    const headerRow = data[0] ?? [];
    let videoIdCol = -1;
    for (let j = 0; j < headerRow.length; j++) {
      const cell = String(headerRow[j] ?? "").toLowerCase().trim();
      if (cell === "my video id") {
        videoIdCol = j;
        break;
      }
    }

    if (videoIdCol === -1) {
      // Chưa có cột → chèn ngay sau TIÊU ĐỀ
      const insertAt = (colTitleRef.current >= 0 ? colTitleRef.current : 2) + 1;
      data.forEach((row, r) => {
        while (row.length < insertAt) row.push("");
        row.splice(insertAt, 0, r === 0 ? "My Video ID" : "");
      });
      videoIdCol = insertAt;
    }

    // Ghi Video ID vào đúng hàng
    targetStates.forEach(s => {
      if (!s.videoId || s.status === "skipped") return;
      const di = rowIndexToDataIdx.get(s.row.rowIndex);
      if (di === undefined || !data[di]) return;
      while (data[di].length <= videoIdCol) data[di].push("");
      data[di][videoIdCol] = s.videoId;
    });

    const wb   = XLSX.utils.book_new();
    const name = personFilter ? personFilter.substring(0, 31) : "Sheet gốc + Video ID";
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name);
    XLSX.writeFile(wb, personFilter ? `video-id-${personFilter}.xlsx` : "video-id-mapping.xlsx");
  }, [states]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const confirmed  = states.filter(s => s.status === "confirmed").length;
  const multiple   = states.filter(s => s.status === "multiple").length;
  const notfound   = states.filter(s => s.status === "notfound").length;
  const pending    = states.filter(s => s.status === "pending").length;
  const allDone    = !running && states.length > 0 && pending === 0 &&
                     !states.some(s => s.status === "searching");
  const needAction = multiple + notfound;

  // Danh sách tên người làm (unique, sort alpha) — dùng cho export theo người
  const allStaffNames = useMemo(() => {
    const names = new Set<string>();
    states.forEach(s => s.row.staffNames.forEach(n => { if (n) names.add(n); }));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "vi"));
  }, [states]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-ink mb-1">Xác định Video ID</h1>
        <p className="text-base text-ink-tertiary">
          Upload Google Sheet → tìm Video ID trên kênh YouTube → phân loại theo nhân sự.
        </p>
      </div>

      {/* Step 1 — Channel + File */}
      {!rows.length && (
        <div className="space-y-4">
          <div className="card p-5">
            <label className="label">Kênh YouTube</label>
            <input
              value={channelInput}
              onChange={e => {
                setChannelInput(e.target.value);
                localStorage.setItem("yt-tracker-channel", e.target.value);
              }}
              placeholder="@YourChannel  hoặc  https://www.youtube.com/@YourChannel"
              className="input text-base"
            />
            <p className="text-xs text-ink-muted mt-2">
              Tất cả video sẽ được tìm trong kênh này — giảm nhầm lẫn với kênh khác.
            </p>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
              !channelInput.trim()
                ? "border-border opacity-50 cursor-not-allowed"
                : isDragging
                  ? "border-accent bg-accent-muted/30 cursor-copy scale-[1.01]"
                  : "border-border-strong hover:border-accent cursor-pointer hover:bg-accent-muted/20"
            }`}
            onClick={() => channelInput.trim() && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (channelInput.trim()) setIsDragging(true); }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); if (channelInput.trim()) setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              className="hidden" onChange={handleFile} />
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mx-auto mb-3 transition-colors ${
              isDragging ? "bg-accent-muted border-accent" : "bg-surface-2 border-border"
            }`}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 14V4M11 4L7 8M11 4L15 8" stroke={isDragging ? "var(--color-accent, #3b82f6)" : "#6B6760"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={isDragging ? "var(--color-accent, #3b82f6)" : "#6B6760"} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-ink mb-1">
              {!channelInput.trim() ? "Nhập kênh YouTube trước" : isDragging ? "Thả file vào đây" : "Upload Google Sheet"}
            </p>
            <p className="text-sm text-ink-muted">
              {isDragging ? "Thả để tải lên" : "Click hoặc kéo thả file .xlsx / .xls / .csv"}
            </p>
          </div>

          {parseError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Results */}
      {rows.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-ink">{rows.length} video</span>
              <span className="text-xs text-ink-muted font-mono">{normaliseChannelPath(channelInput)}</span>
              {states.length > 0 && confirmed > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  ✓ {confirmed} khớp
                </span>
              )}
              {multiple > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                  ⚠ {multiple} nhiều kết quả
                </span>
              )}
              {notfound > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 font-semibold">
                  ✗ {notfound} không tìm thấy
                </span>
              )}
              {running && (
                <span className="text-sm text-ink-tertiary flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  {progress}/{rows.length}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setRows([]); setStates([]); statesRef.current = []; }}
                className="btn-ghost btn-sm"
              >↺ Đổi file</button>
              {states.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(v => !v)}
                    className="btn-primary btn-sm px-4 flex items-center gap-1.5"
                  >
                    ↓ Export
                    <span className="text-[10px] opacity-70">▾</span>
                  </button>
                  {showExportMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-border rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                        <button
                          onClick={() => { doExport(); setShowExportMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2 transition-colors border-b border-border"
                        >
                          Tất cả ({states.length} video)
                        </button>
                        {allStaffNames.length > 0 && (
                          <>
                            <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-ink-muted uppercase tracking-widest">Theo người làm</p>
                            {allStaffNames.map(name => {
                              const count = states.filter(s =>
                                s.videoId && s.status !== "skipped" && s.row.staffNames.includes(name)
                              ).length;
                              return (
                                <button
                                  key={name}
                                  onClick={() => { doExport(name); setShowExportMenu(false); }}
                                  className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-2 transition-colors flex items-center justify-between gap-3"
                                >
                                  <span>{name}</span>
                                  {count > 0 && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      {count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {running ? (
                <button
                  onClick={() => { abortRef.current = true; resumeSearch(); }}
                  className="btn-sm px-4 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold">
                  ✕ Dừng
                </button>
              ) : (
                <button onClick={runSearch} disabled={!channelInput.trim()}
                  className="btn-primary btn-sm px-5">
                  🔍 {allDone ? "Tìm lại" : "Bắt đầu tìm kiếm"}
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {running && (
            <div className="mb-3 w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${rows.length ? (progress / rows.length) * 100 : 0}%` }} />
            </div>
          )}

          {/* Export panel */}
          {states.length > 0 && (
            <div className="mb-4 card p-5 space-y-5">
              <h3 className="text-sm font-bold text-ink">Export</h3>

              {/* Export 1 — file gốc + toàn bộ Video ID */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-ink">Export file gốc + Video ID</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {confirmed > 0 ? `${confirmed} video đã khớp` : "Chưa có video nào được xác nhận"} — ghi Video ID vào đúng cột trong file gốc
                  </p>
                </div>
                <button onClick={() => doExport()} className="btn-primary px-6 flex-shrink-0">
                  ↓ Export tất cả
                </button>
              </div>

              {/* Export 2 — theo từng người làm */}
              {allStaffNames.length > 0 && (
                <div className="border-t border-border pt-5">
                  <p className="text-xs font-bold text-ink-tertiary uppercase tracking-wide mb-3">
                    Export theo người làm
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allStaffNames.map(name => {
                      const count = states.filter(s =>
                        s.videoId && s.status !== "skipped" && s.row.staffNames.includes(name)
                      ).length;
                      return (
                        <button
                          key={name}
                          onClick={() => doExport(name)}
                          className="group flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-surface-2 hover:border-accent hover:bg-accent-muted/20 transition-all"
                        >
                          <span className="text-sm font-medium text-ink">{name}</span>
                          {count > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {count}
                            </span>
                          )}
                          <span className="text-xs text-accent opacity-60 group-hover:opacity-100 transition-opacity">↓</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Need action banner */}
          {allDone && needAction > 0 && (
            <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-3">
              <span className="font-bold text-lg mt-0.5">⚠</span>
              <div>
                <p className="font-bold mb-1">{needAction} video cần xử lý thủ công</p>
                <p className="text-amber-700">
                  {multiple > 0 && `${multiple} video có nhiều kết quả — chọn đúng bên dưới. `}
                  {notfound > 0 && `${notfound} video không tìm thấy — nhập ID tay.`}
                </p>
              </div>
            </div>
          )}

          {/* Main table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 w-6">#</th>
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3">Tiêu đề</th>
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 w-20">Thời lượng</th>
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 w-32">Video ID</th>
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3">Tên Người Làm</th>
                  <th className="text-left text-xs font-bold text-ink-tertiary uppercase tracking-wide px-4 py-3 w-28">Trạng thái</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {states.map((s, i) => (
                  <Fragment key={s.row.rowIndex}>
                    {/* Main row */}
                    <tr
                      ref={el => { rowRefs.current[i] = el; }}
                      className={`transition-colors ${
                        waitingForIdx === i           ? "bg-blue-50/40" :
                        s.status === "confirmed"      ? "bg-emerald-50/30" :
                        s.status === "multiple"       ? "bg-amber-50/30" :
                        s.status === "notfound"       ? "bg-red-50/20" :
                        s.status === "skipped"        ? "opacity-40" : ""
                      }`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-ink-muted">{s.row.rowIndex}</td>

                      {/* Title */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-ink leading-snug">
                          {s.row.query}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                          s.row.queryFrom === "title"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-surface-2 text-ink-muted"
                        }`}>
                          {s.row.queryFrom === "title" ? "TIÊU ĐỀ" : "Search"}
                        </span>
                      </td>

                      {/* Thời lượng (từ sheet) */}
                      <td className="px-4 py-3">
                        {s.row.duration ? (
                          <span className="text-xs font-mono text-ink-secondary bg-surface-2 px-1.5 py-0.5 rounded border border-border">
                            {s.row.duration}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>

                      {/* Video ID */}
                      <td className="px-4 py-3">
                        {editIdx === i && waitingForIdx !== i ? (
                          <div className="flex gap-1 items-center">
                            <input
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && saveManual(i)}
                              placeholder="11-char ID"
                              autoFocus
                              className="input py-1 px-2 text-xs font-mono w-28"
                            />
                            <button onClick={() => saveManual(i)}
                              className="w-6 h-6 rounded bg-accent text-white text-xs flex items-center justify-center">✓</button>
                            <button onClick={() => setEditIdx(null)}
                              className="w-6 h-6 rounded border border-border text-xs flex items-center justify-center">✗</button>
                          </div>
                        ) : s.status === "searching" ? (
                          <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
                        ) : s.videoId ? (
                          <a href={`https://youtube.com/watch?v=${s.videoId}`}
                            target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-500 hover:underline"
                            onClick={e => e.stopPropagation()}>
                            {s.videoId}
                          </a>
                        ) : s.status === "notfound" ? (
                          <span className="text-xs text-red-400 italic">không tìm thấy</span>
                        ) : s.status === "multiple" ? (
                          <span className="text-xs text-amber-600 italic">↓ chọn bên dưới</span>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>

                      {/* Staff */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.row.staffNames.map(n => (
                            <span key={n} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-2 border border-border text-ink-secondary">
                              {n}
                            </span>
                          ))}
                          {s.row.staffNames.length === 0 && (
                            <span className="text-[10px] text-ink-muted italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        {s.status === "confirmed" && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Khớp{s.matchedTitle === "(manual)" ? " (tay)" : ""}
                          </span>
                        )}
                        {s.status === "multiple" && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            ⚠ {s.candidates.length} kết quả
                          </span>
                        )}
                        {s.status === "notfound" && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                            ✗ Không thấy
                          </span>
                        )}
                        {s.status === "pending" && (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                        {s.status === "skipped" && (
                          <span className="text-xs text-ink-muted">bỏ qua</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {/* Only show post-search actions when NOT in waiting expansion */}
                        {waitingForIdx !== i && (s.status === "confirmed" || s.status === "multiple" || s.status === "notfound") && (
                          <div className="flex flex-col gap-1">
                            {s.videoId && (
                              <button onClick={() => resetRow(i)}
                                className="text-[11px] px-2 py-0.5 rounded-lg bg-surface-2 text-ink-muted border border-border hover:border-border-strong">
                                Tìm lại
                              </button>
                            )}
                            <button onClick={() => { setEditIdx(i); setEditVal(""); }}
                              className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100">
                              Nhập ID
                            </button>
                            {(s.status === "notfound" || s.status === "multiple") && (
                              <button onClick={() => skipRow(i)}
                                className="text-[11px] px-2 py-0.5 rounded-lg bg-surface-2 text-ink-muted border border-border hover:border-border-strong">
                                Bỏ qua
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Inline expansion — multiple candidates */}
                    {waitingForIdx === i && s.status === "multiple" && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-5 bg-amber-50/50 border-b-2 border-amber-200">
                          {/* Context: tên người làm + thời lượng + link SẢN PHẨM */}
                          <div className="flex items-center gap-4 pt-3 pb-2 flex-wrap">
                            <p className="text-xs font-bold text-amber-700">
                              ⚠ {s.candidates.length} kết quả — chọn video đúng để tiếp tục
                            </p>
                            {s.row.duration && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-ink-muted">Thời lượng mong đợi:</span>
                                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">
                                  {s.row.duration}
                                </span>
                              </div>
                            )}
                            {s.row.staffNames.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-ink-muted">Tên Người Làm:</span>
                                {s.row.staffNames.map(n => (
                                  <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                                    {n}
                                  </span>
                                ))}
                              </div>
                            )}
                            {s.row.productLink && (
                              <a
                                href={s.row.productLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 8.5l7-7M8.5 8V1.5H2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                SẢN PHẨM
                              </a>
                            )}
                          </div>
                          <div className="space-y-2">
                            {s.candidates.map(c => (
                              <div key={c.videoId}
                                className="flex items-center gap-3 p-2.5 rounded-xl border border-amber-200 bg-white hover:border-accent hover:shadow-sm cursor-pointer transition-all"
                                onClick={() => pickCandidate(i, c)}
                              >
                                {/* Thumbnail — click mở video */}
                                <a
                                  href={`https://youtube.com/watch?v=${c.videoId}`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="relative flex-shrink-0 group/thumb"
                                >
                                  <img src={c.thumbnail} alt="" className="w-20 h-[46px] object-cover rounded-lg bg-surface-2" />
                                  <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 rounded-lg flex items-center justify-center transition-all">
                                    <svg className="opacity-0 group-hover/thumb:opacity-100 text-white transition-opacity" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6.5 5.5l8 4.5-8 4.5V5.5z"/>
                                    </svg>
                                  </div>
                                </a>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-ink leading-snug">{c.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <a
                                      href={`https://youtube.com/watch?v=${c.videoId}`}
                                      target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="font-mono text-xs text-blue-500 hover:underline"
                                    >
                                      {c.videoId}
                                    </a>
                                    {c.duration && (
                                      <span className={`text-xs font-mono font-semibold px-1.5 py-0 rounded border ${
                                        s.row.duration && c.duration === s.row.duration
                                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                          : "bg-violet-50 border-violet-200 text-violet-700"
                                      }`}>
                                        {c.duration}
                                      </span>
                                    )}
                                    {c.publishedAt && <span className="text-xs text-ink-muted">{c.publishedAt}</span>}
                                    {c.viewCount  && <span className="text-xs text-ink-muted">{c.viewCount}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <a
                                    href={`https://youtube.com/watch?v=${c.videoId}`}
                                    target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="w-7 h-7 rounded-lg border border-border bg-surface-2 flex items-center justify-center text-ink-muted hover:text-red-500 hover:border-red-200 transition-colors"
                                    title="Mở video YouTube"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                      <path d="M2 11L11 2M11 9V2H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </a>
                                  <button
                                    onClick={e => { e.stopPropagation(); pickCandidate(i, c); }}
                                    className="btn-primary btn-sm px-4 text-xs"
                                  >
                                    Chọn
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Manual input at bottom of picker */}
                          <div className="mt-3 pt-3 border-t border-amber-200 flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-ink-muted">Hoặc nhập ID tay:</span>
                            <input
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && saveManual(i)}
                              placeholder="Video ID (11 ký tự)"
                              className="input py-1 px-2 text-xs font-mono w-36"
                            />
                            <button onClick={() => saveManual(i)}
                              className="btn-primary btn-sm text-xs px-3">Lưu</button>
                            <button onClick={() => skipRow(i)}
                              className="btn-ghost btn-sm text-xs text-ink-muted">Bỏ qua</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Inline expansion — not found */}
                    {waitingForIdx === i && s.status === "notfound" && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-5 bg-red-50/40 border-b-2 border-red-200">
                          {/* Context: tên người làm + thời lượng + link SẢN PHẨM */}
                          <div className="flex items-center gap-4 pt-3 pb-2 flex-wrap">
                            <span className="text-xs font-semibold text-red-600">✗ Không tìm thấy video. Nhập Video ID:</span>
                            {s.row.duration && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-ink-muted">Thời lượng mong đợi:</span>
                                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">
                                  {s.row.duration}
                                </span>
                              </div>
                            )}
                            {s.row.staffNames.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-ink-muted">Tên Người Làm:</span>
                                {s.row.staffNames.map(n => (
                                  <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                                    {n}
                                  </span>
                                ))}
                              </div>
                            )}
                            {s.row.productLink && (
                              <a
                                href={s.row.productLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 8.5l7-7M8.5 8V1.5H2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                SẢN PHẨM
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <input
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && saveManual(i)}
                              placeholder="Video ID (11 ký tự)"
                              autoFocus
                              className="input py-1 px-2 text-xs font-mono w-36"
                            />
                            <button onClick={() => saveManual(i)}
                              className="btn-primary btn-sm text-xs px-3">Lưu</button>
                            <button onClick={() => skipRow(i)}
                              className="btn-ghost btn-sm text-xs text-ink-muted">Bỏ qua</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}
    </div>
  );
}

import * as XLSX from "xlsx";

// ── Column aliases ─────────────────────────────────────────────────────────────

export const STAFF_SHEET_COLUMNS = {
  videoId:     ["my video id", "video id", "video_id", "id"],
  staffName:   ["tên người làm", "ten nguoi lam", "người làm", "staff"],
  title:       ["tiêu đề", "tieu de", "title", "tên bài", "ten bai"],
  status:      ["trạng thái", "trang thai", "status"],
  publishedAt: ["ngày đăng", "ngay dang", "published", "publish date"],
} as const;

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StaffSheetRow {
  videoId:     string;
  title:       string;
  staffNames:  string[];
  status:      string;
  publishedAt: string;
  rowIndex:    number;
}

export interface DuplicateVideoInfo {
  videoId:    string;
  title:      string;
  rowIndices: number[];   // all row numbers where this videoId appears
  count:      number;
}

export interface StaffSheetParseSuccess {
  success:    true;
  rows:       StaffSheetRow[];
  skipped:    number;
  allStaff:   string[];
  headerRow:  number;
  duplicates: DuplicateVideoInfo[];  // videos appearing on multiple rows
}

export interface StaffSheetParseFailure {
  success: false;
  error:   string;
}

export type StaffSheetParseResult = StaffSheetParseSuccess | StaffSheetParseFailure;

// ── Helpers ────────────────────────────────────────────────────────────────────

export function parseStaffCell(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const str = String(raw).trim();
  if (!str) return [];
  return str
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function detectHeaderRow(raw: unknown[][]): number {
  for (let i = 0; i <= Math.min(4, raw.length - 1); i++) {
    const row = (raw[i] as unknown[]).map(c => String(c ?? "").toLowerCase().trim());
    const hasVideoId   = STAFF_SHEET_COLUMNS.videoId.some(a   => row.includes(a));
    const hasStaffName = STAFF_SHEET_COLUMNS.staffName.some(a => row.includes(a));
    if (hasVideoId && hasStaffName) return i;
  }
  return -1;
}

function findColIndex(headerRow: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const idx = headerRow.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Single-sheet parser (reusable) ────────────────────────────────────────────

interface SheetParseResult {
  rows:    StaffSheetRow[];
  skipped: number;
  staffSet: Set<string>;
  headerRow: number;
}

function parseSingleSheet(ws: XLSX.WorkSheet): SheetParseResult | null {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (raw.length < 2) return null;

  const headerRowIdx = detectHeaderRow(raw as unknown[][]);
  if (headerRowIdx === -1) return null;

  const headerRow = (raw[headerRowIdx] as unknown[])
    .map(c => String(c ?? "").toLowerCase().trim());

  const colVideoId   = findColIndex(headerRow, STAFF_SHEET_COLUMNS.videoId);
  const colStaffName = findColIndex(headerRow, STAFF_SHEET_COLUMNS.staffName);
  const colTitle     = findColIndex(headerRow, STAFF_SHEET_COLUMNS.title);
  const colStatus    = findColIndex(headerRow, STAFF_SHEET_COLUMNS.status);
  const colPublished = findColIndex(headerRow, STAFF_SHEET_COLUMNS.publishedAt);

  if (colVideoId === -1 || colStaffName === -1) return null;

  const rows:     StaffSheetRow[] = [];
  const staffSet  = new Set<string>();
  let   skipped   = 0;

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const rawId = String(row[colVideoId] ?? "").trim();
    if (!VIDEO_ID_REGEX.test(rawId)) { skipped++; continue; }

    const names = parseStaffCell(row[colStaffName]);
    names.forEach(n => staffSet.add(n));

    rows.push({
      videoId:     rawId,
      title:       colTitle     !== -1 ? String(row[colTitle]     ?? "").trim() : "",
      staffNames:  names,
      status:      colStatus    !== -1 ? String(row[colStatus]    ?? "").trim() : "",
      publishedAt: colPublished !== -1 ? String(row[colPublished] ?? "").trim() : "",
      rowIndex:    i + 1,
    });
  }

  if (rows.length === 0) return null;

  return { rows, skipped, staffSet, headerRow: headerRowIdx + 1 };
}

// ── Sheet filtering by mode ───────────────────────────────────────────────────

/**
 * "staff-export"  → file đã xử lý từ Lọc Video ID — chỉ đọc sheet đầu tiên.
 * "tien-do"       → file Tiến Độ Công Việc gốc — chỉ đọc sheet "Work Progress"
 *                    và "Live Stream" / "Livestream" (case-insensitive).
 */
export type StaffSheetMode = "staff-export" | "tien-do";

const TIEN_DO_SHEET_KEYWORDS = ["work progress", "live stream", "livestream"];

function isAllowedSheet(sheetName: string, index: number, mode: StaffSheetMode): boolean {
  if (mode === "staff-export") return index === 0;
  // mode === "tien-do"
  const lower = sheetName.toLowerCase().trim();
  return TIEN_DO_SHEET_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseStaffSheet(buffer: ArrayBuffer, mode: StaffSheetMode = "tien-do"): StaffSheetParseResult {
  try {
    const wb = XLSX.read(buffer, { type: "array" });

    const allRows:     StaffSheetRow[] = [];
    const allStaff     = new Set<string>();
    const existingIds  = new Set<string>();
    // Track ALL occurrences for duplicate detection (before dedup)
    const videoOccurrences = new Map<string, { title: string; rowIndices: number[] }>();
    let   totalSkipped = 0;
    let   firstHeaderRow = 1;
    let   parsedSheets = 0;

    for (let i = 0; i < wb.SheetNames.length; i++) {
      const sheetName = wb.SheetNames[i];
      if (!isAllowedSheet(sheetName, i, mode)) continue;

      const ws     = wb.Sheets[sheetName];
      const result = parseSingleSheet(ws);
      if (!result) continue;

      parsedSheets++;
      if (parsedSheets === 1) firstHeaderRow = result.headerRow;

      // Track all occurrences for duplicate detection
      for (const row of result.rows) {
        const existing = videoOccurrences.get(row.videoId);
        if (existing) {
          existing.rowIndices.push(row.rowIndex);
        } else {
          videoOccurrences.set(row.videoId, { title: row.title || row.videoId, rowIndices: [row.rowIndex] });
        }
      }

      // Merge rows, deduplicate by videoId (first sheet wins on duplicates)
      for (const row of result.rows) {
        if (!existingIds.has(row.videoId)) {
          allRows.push(row);
          existingIds.add(row.videoId);
        }
      }

      result.staffSet.forEach((n) => allStaff.add(n));
      totalSkipped += result.skipped;
    }

    // Build duplicates list — only videos appearing 2+ times
    const duplicates: DuplicateVideoInfo[] = [];
    for (const [videoId, info] of videoOccurrences) {
      if (info.rowIndices.length >= 2) {
        duplicates.push({
          videoId,
          title: info.title,
          rowIndices: info.rowIndices,
          count: info.rowIndices.length,
        });
      }
    }

    if (parsedSheets === 0) {
      return {
        success: false,
        error: mode === "tien-do"
          ? "Không tìm thấy sheet 'Work Progress' hoặc 'Live Stream'. Kiểm tra lại tên sheet trong file."
          : "Không tìm thấy hàng tiêu đề. Cần có cột 'Video ID' và 'Tên Người Làm' (hoặc tên tương đương).",
      };
    }

    if (allRows.length === 0) {
      return { success: false, error: "Không tìm thấy hàng nào có Video ID hợp lệ." };
    }

    return {
      success:    true,
      rows:       allRows,
      skipped:    totalSkipped,
      allStaff:   [...allStaff].sort(),
      headerRow:  firstHeaderRow,
      duplicates,
    };
  } catch (e) {
    return { success: false, error: `Lỗi đọc file: ${String(e)}` };
  }
}

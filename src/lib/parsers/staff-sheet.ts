import * as XLSX from "xlsx";

// ── Column aliases ─────────────────────────────────────────────────────────────

export const STAFF_SHEET_COLUMNS = {
  videoId:     ["video id", "video_id", "id"],
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

export interface StaffSheetParseSuccess {
  success:   true;
  rows:      StaffSheetRow[];
  skipped:   number;
  allStaff:  string[];
  headerRow: number;
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

// ── Main parser ────────────────────────────────────────────────────────────────

export function parseStaffSheet(buffer: ArrayBuffer): StaffSheetParseResult {
  try {
    const wb  = XLSX.read(buffer, { type: "array" });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

    if (raw.length < 2) {
      return { success: false, error: "File có ít hơn 2 hàng." };
    }

    const headerRowIdx = detectHeaderRow(raw as unknown[][]);
    if (headerRowIdx === -1) {
      return {
        success: false,
        error:   "Không tìm thấy hàng tiêu đề. Cần có cột 'Video ID' và 'Tên Người Làm' (hoặc tên tương đương).",
      };
    }

    const headerRow = (raw[headerRowIdx] as unknown[])
      .map(c => String(c ?? "").toLowerCase().trim());

    const colVideoId   = findColIndex(headerRow, STAFF_SHEET_COLUMNS.videoId);
    const colStaffName = findColIndex(headerRow, STAFF_SHEET_COLUMNS.staffName);
    const colTitle     = findColIndex(headerRow, STAFF_SHEET_COLUMNS.title);
    const colStatus    = findColIndex(headerRow, STAFF_SHEET_COLUMNS.status);
    const colPublished = findColIndex(headerRow, STAFF_SHEET_COLUMNS.publishedAt);

    if (colVideoId   === -1) return { success: false, error: "Không tìm thấy cột 'Video ID'." };
    if (colStaffName === -1) return { success: false, error: "Không tìm thấy cột 'Tên Người Làm'." };

    const rows:    StaffSheetRow[] = [];
    const staffSet = new Set<string>();
    let   skipped  = 0;

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

    if (rows.length === 0) {
      return { success: false, error: "Không tìm thấy hàng nào có Video ID hợp lệ." };
    }

    return {
      success:   true,
      rows,
      skipped,
      allStaff:  [...staffSet].sort(),
      headerRow: headerRowIdx + 1,
    };
  } catch (e) {
    return { success: false, error: `Lỗi đọc file: ${String(e)}` };
  }
}

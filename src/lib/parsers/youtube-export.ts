import * as XLSX from "xlsx";
import type { VideoRow, OptionalColumnKey } from "@/types";

// Required columns — detected by name, not index
export const REQUIRED_COLUMNS = {
  youtubeId: "nội dung",
  title: "tiêu đề video",
  views: "số lượt xem",
} as const;

export const OPTIONAL_COLUMNS: Record<OptionalColumnKey, string> = {
  publishedAt:  "thời gian xuất bản video",
  duration:     "thời lượng",
  watchTime:    "thời gian xem (giờ)",
  subscribers:  "số người đăng ký",
  revenue:      "doanh thu ước tính (usd)",
  ctr:          "tỷ lệ nhấp của số lượt hiển thị hình thu nhỏ (%)",
  impressions:  "số lượt hiển thị hình thu nhỏ",
};

export const OPTIONAL_COLUMN_LABELS: Record<OptionalColumnKey, string> = {
  publishedAt:  "Ngày xuất bản",
  duration:     "Thời lượng",
  watchTime:    "Thời gian xem (giờ)",
  subscribers:  "Số người đăng ký",
  revenue:      "Doanh thu ước tính (USD)",
  ctr:          "Tỷ lệ nhấp (%)",
  impressions:  "Số lượt hiển thị",
};

type RequiredColumnKey = keyof typeof REQUIRED_COLUMNS;

interface ColumnMap {
  required: Record<RequiredColumnKey, number>;
  optional: Partial<Record<OptionalColumnKey, number>>;
  missing: string[];
}

/** Normalize for fuzzy matching: lowercase + remove diacritics + collapse whitespace */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function detectColumns(headerRow: unknown[]): ColumnMap {
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const name = String(headerRow[i] ?? "").trim().toLowerCase();
    if (name) headerIndex.set(name, i);
  }

  const required = {} as Record<RequiredColumnKey, number>;
  const optional: Partial<Record<OptionalColumnKey, number>> = {};
  const missing: string[] = [];

  for (const [key, name] of Object.entries(REQUIRED_COLUMNS) as [RequiredColumnKey, string][]) {
    const idx = headerIndex.get(name.toLowerCase());
    if (idx !== undefined) {
      required[key] = idx;
    } else {
      // Try partial match fallback
      let found = false;
      for (const [h, i] of headerIndex.entries()) {
        if (h.includes(name.toLowerCase()) || name.toLowerCase().includes(h)) {
          required[key] = i;
          found = true;
          break;
        }
      }
      if (!found) missing.push(name);
    }
  }

  for (const [key, name] of Object.entries(OPTIONAL_COLUMNS) as [OptionalColumnKey, string][]) {
    const needle = norm(name);
    // 1. Exact match
    let idx = headerIndex.get(name.toLowerCase());
    // 2. Normalized exact match (handles Unicode NFC/NFD differences)
    if (idx === undefined) {
      for (const [h, i] of headerIndex.entries()) {
        if (norm(h) === needle) { idx = i; break; }
      }
    }
    // 3. Partial match fallback
    if (idx === undefined) {
      for (const [h, i] of headerIndex.entries()) {
        if (norm(h).includes(needle) || needle.includes(norm(h))) { idx = i; break; }
      }
    }
    if (idx !== undefined) optional[key] = idx;
  }

  return { required, optional, missing };
}

export interface ParseSuccess {
  success: true;
  rows: VideoRow[];
  detectedOptional: OptionalColumnKey[];
  skipped: number;
}

export interface ParseFailure {
  success: false;
  error: string;
  missing?: string[];
}

export type ParseResult = ParseSuccess | ParseFailure;

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** Excel serial → JS Date (days since 1899-12-30) */
function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

export function parsePublishedMonth(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";

  let d: Date;
  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === "number") {
    // Excel serial date (e.g. 46066 = Feb 18 2026)
    d = excelSerialToDate(raw);
  } else {
    // String: "Feb 18, 2026" / "18 Feb 2026" / "2026-02-18" / "18/02/2026"
    const s = String(raw).trim();
    if (!s) return "";
    d = new Date(s);
    // Try DD/MM/YYYY fallback
    if (isNaN(d.getTime())) {
      const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (parts) d = new Date(`${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
    }
  }

  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseYouTubeExport(buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    if (raw.length < 2) {
      return { success: false, error: "File không đủ dữ liệu (cần ít nhất 3 dòng)." };
    }

    const colMap = detectColumns(raw[0] as unknown[]);

    if (colMap.missing.length > 0) {
      return {
        success: false,
        error: `Không tìm thấy các cột bắt buộc: ${colMap.missing.join(", ")}`,
        missing: colMap.missing,
      };
    }

    const rows: VideoRow[] = [];
    let skipped = 0;

    // Data starts at row index 2 (skip header row 0 and totals row 1)
    for (let i = 2; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      if (!row?.length) continue;

      const candidateId = String(row[colMap.required.youtubeId] ?? "").trim();
      if (!VIDEO_ID_REGEX.test(candidateId)) {
        skipped++;
        continue;
      }

      const viewsRaw = String(row[colMap.required.views] ?? "0").replace(/,/g, "").replace(/\./g, "");
      const views = parseInt(viewsRaw, 10);

      const entry: VideoRow = {
        youtubeId: candidateId,
        title: String(row[colMap.required.title] ?? "").trim() || candidateId,
        views: isNaN(views) ? 0 : views,
      };

      if (colMap.optional.publishedAt !== undefined) {
        const raw_val = row[colMap.optional.publishedAt];
        if (raw_val !== null && raw_val !== undefined && raw_val !== "") {
          entry.publishedAt = String(raw_val).trim();
          const month = parsePublishedMonth(raw_val);
          if (month) entry.publishedMonth = month;
        }
      }
      if (colMap.optional.duration !== undefined) {
        const v = Number(row[colMap.optional.duration]);
        if (!isNaN(v)) entry.duration = v;
      }
      if (colMap.optional.watchTime !== undefined) {
        const v = parseFloat(String(row[colMap.optional.watchTime] ?? ""));
        if (!isNaN(v)) entry.watchTime = v;
      }
      if (colMap.optional.subscribers !== undefined) {
        const v = parseInt(String(row[colMap.optional.subscribers] ?? ""), 10);
        if (!isNaN(v)) entry.subscribers = v;
      }
      if (colMap.optional.revenue !== undefined) {
        const v = parseFloat(String(row[colMap.optional.revenue] ?? ""));
        if (!isNaN(v)) entry.revenue = v;
      }
      if (colMap.optional.ctr !== undefined) {
        const v = parseFloat(String(row[colMap.optional.ctr] ?? ""));
        if (!isNaN(v)) entry.ctr = v;
      }
      if (colMap.optional.impressions !== undefined) {
        const v = parseInt(String(row[colMap.optional.impressions] ?? ""), 10);
        if (!isNaN(v)) entry.impressions = v;
      }

      rows.push(entry);
    }

    if (rows.length === 0) {
      return { success: false, error: "Không tìm thấy dòng video nào từ dòng 3 trở đi." };
    }

    return {
      success: true,
      rows,
      detectedOptional: Object.keys(colMap.optional) as OptionalColumnKey[],
      skipped,
    };
  } catch {
    return {
      success: false,
      error: "Không đọc được file. Hãy đảm bảo đây là file .xlsx hoặc .csv export từ YouTube Analytics.",
    };
  }
}

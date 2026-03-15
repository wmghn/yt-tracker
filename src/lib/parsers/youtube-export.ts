import * as XLSX from "xlsx";
import type { VideoRow, OptionalColumnKey } from "@/types";

// Required columns — detected by name, not index
export const REQUIRED_COLUMNS = {
  youtubeId: "nội dung",
  title: "tiêu đề video",
  views: "số lượt xem",
} as const;

export const OPTIONAL_COLUMNS: Record<OptionalColumnKey, string> = {
  duration: "thời lượng",
  watchTime: "thời gian xem (giờ)",
  subscribers: "số người đăng ký",
  revenue: "doanh thu ước tính (usd)",
};

export const OPTIONAL_COLUMN_LABELS: Record<OptionalColumnKey, string> = {
  duration: "Thời lượng",
  watchTime: "Thời gian xem (giờ)",
  subscribers: "Số người đăng ký",
  revenue: "Doanh thu ước tính (USD)",
};

type RequiredColumnKey = keyof typeof REQUIRED_COLUMNS;

interface ColumnMap {
  required: Record<RequiredColumnKey, number>;
  optional: Partial<Record<OptionalColumnKey, number>>;
  missing: string[];
}

function detectColumns(headerRow: unknown[]): ColumnMap {
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const name = String(headerRow[i] ?? "")
      .trim()
      .toLowerCase();
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
    const idx = headerIndex.get(name.toLowerCase());
    if (idx !== undefined) {
      optional[key] = idx;
    }
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

export function parseYouTubeExport(buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
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

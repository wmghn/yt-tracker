# YouTube Views Contribution Tracker — Technical Design Document

**Version:** 5.0
**Deployment target:** Netlify (static site, fully client-side)
**Status:** Production
**Scope:** Module 1 — Upload · Column Validation · Staff Assignment · Weight Config · Attribution · Excel Export | Module 2 — Staff Analytics

---

## 1. Architecture

Runs entirely in the browser. No backend, no database, no environment variables.

```
Upload XLSX  →  Detect columns by name  →  Parse from row 3  →  React state  →  Compute  →  Export XLSX
                      ↕ validate required columns
              localStorage (survives refresh — cleared on "New session")
```

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| File read/write | SheetJS (`xlsx`) |
| Styling | Tailwind CSS |
| State | React `useState` / `useReducer` |
| Persistence | `localStorage` |
| Testing | Vitest |
| Deployment | Netlify static (`vite build → dist/`) |

---

## 3. Repository Structure

```
/
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # 2-tab (salary | match) + SalarySubTab (calc | analytics)
│   │
│   ├── components/
│   │   ├── ui/                       # Button, Input, Badge, Table, Checkbox, Modal
│   │   └── features/
│   │       ├── UploadZone.tsx        # Step 1: upload + column validation UI
│   │       ├── ColumnReport.tsx      # Shows detected vs missing columns
│   │       ├── StaffPanel.tsx        # Step 2: staff list + "Sửa file Excel" button
│   │       ├── StaffCard.tsx         # Individual staff card
│   │       ├── ResultsTable.tsx      # Step 3: attribution table (hides revenue when no data)
│   │       ├── ExportModal.tsx       # Column selector before export
│   │       └── analytics/
│   │           ├── AnalyticsDashboard.tsx  # Period filter (3m/6m/12m/all) + 4 sub-tabs
│   │           ├── OverviewTab.tsx         # KPI cards + role accordions + tỷ lệ/tổng badges
│   │           ├── RoleCompareTab.tsx      # Per-role comparison table + tỷ lệ/tổng badges
│   │           ├── RankingTab.tsx          # Top 10 videos + 5 staff leaderboards
│   │           └── TrendTab.tsx            # SVG line charts (revenue hidden if no data) + trend cards
│   │
│   ├── lib/
│   │   ├── parsers/
│   │   │   └── youtube-export.ts     # Column detection + parsing
│   │   ├── services/
│   │   │   ├── attribution.ts        # computeAttribution() + formatFormula()
│   │   │   └── analytics.ts          # computeAllPeriodMetrics() + computeTrends() + computeRankings()
│   │   ├── exporters/
│   │   │   └── excel-export.ts       # buildExport() — mandatory + optional cols
│   │   ├── validators/
│   │   │   └── video-id.ts           # parseVideoIdList()
│   │   └── storage/
│   │       └── session-storage.ts    # localStorage helpers
│   │
│   └── types/
│       └── index.ts
│
├── netlify.toml
└── vite.config.ts
```

---

## 4. File Format Specification

### 4.1 YouTube Analytics Export Structure

Based on the actual export format (screenshot provided):

```
Row 1  →  Column headers  (detect column positions by name here)
Row 2  →  "Tổng" totals row  →  skip
Row 3+ →  Individual video data  →  parse these
```

### 4.2 Column Registry

Columns are found by **header name** (case-insensitive, trimmed), never by fixed index. This makes the parser robust to column reordering and future export format changes.

```typescript
// src/lib/parsers/youtube-export.ts

// REQUIRED — parsing fails if any of these are missing
export const REQUIRED_COLUMNS = {
  youtubeId: "Nội dung",           // Column A — 11-char video ID
  title:     "Tiêu đề video",      // Column B — video title
  views:     "Số lượt xem",        // Column E — integer view count
} as const;

// OPTIONAL — detected and stored if present, used in export
export const OPTIONAL_COLUMNS = {
  duration:    "Thời lượng",                  // Column D — seconds
  watchTime:   "Thời gian xem (giờ)",         // Column F — hours
  subscribers: "Số người đăng ký",            // Column G — subscriber count change
  revenue:     "Doanh thu ước tính (USD)",    // Column H — estimated revenue
} as const;

export type RequiredColumnKey = keyof typeof REQUIRED_COLUMNS;
export type OptionalColumnKey = keyof typeof OPTIONAL_COLUMNS;
```

### 4.3 Column Detection Logic

```typescript
// src/lib/parsers/youtube-export.ts

interface ColumnMap {
  required: Record<RequiredColumnKey, number>;       // column index for each required field
  optional: Partial<Record<OptionalColumnKey, number>>; // column index for each optional field found
  missing:  string[];                                 // required column names not found
}

function detectColumns(headerRow: unknown[]): ColumnMap {
  // Build a lookup: normalised header name → column index
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const name = String(headerRow[i] ?? "").trim().toLowerCase();
    if (name) headerIndex.set(name, i);
  }

  const required  = {} as Record<RequiredColumnKey, number>;
  const optional  = {} as Partial<Record<OptionalColumnKey, number>>;
  const missing:  string[] = [];

  for (const [key, name] of Object.entries(REQUIRED_COLUMNS)) {
    const idx = headerIndex.get(name.toLowerCase());
    if (idx !== undefined) {
      required[key as RequiredColumnKey] = idx;
    } else {
      missing.push(name);
    }
  }

  for (const [key, name] of Object.entries(OPTIONAL_COLUMNS)) {
    const idx = headerIndex.get(name.toLowerCase());
    if (idx !== undefined) {
      optional[key as OptionalColumnKey] = idx;
    }
  }

  return { required, optional, missing };
}
```

### 4.4 Full Parse Function

```typescript
// src/lib/parsers/youtube-export.ts

import * as XLSX from "xlsx";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface VideoRow {
  youtubeId:   string;
  title:       string;
  views:       number;
  // Optional fields — present only if column existed in the file
  duration?:    number;   // seconds
  watchTime?:   number;   // hours (float)
  subscribers?: number;
  revenue?:     number;   // USD (float)
}

export interface ParseSuccess {
  success:         true;
  rows:            VideoRow[];
  detectedOptional: OptionalColumnKey[];  // which optional columns were found
  skipped:         number;
}

export interface ParseFailure {
  success:  false;
  error:    string;
  missing?: string[];   // required column names that were not found
}

export type ParseResult = ParseSuccess | ParseFailure;

export function parseYouTubeExport(buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const raw      = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    if (raw.length < 3) {
      return { success: false, error: "File has fewer than 3 rows. Expected header, totals, then data." };
    }

    // Row 0 is the header — detect column positions
    const colMap = detectColumns(raw[0] as unknown[]);

    if (colMap.missing.length > 0) {
      return {
        success: false,
        error:   `Required columns not found: ${colMap.missing.join(", ")}`,
        missing: colMap.missing,
      };
    }

    // Row 1 ("Tổng") is always skipped — data starts at row index 2
    const rows:    VideoRow[] = [];
    let   skipped             = 0;

    for (let i = 2; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      if (!row?.length) continue;

      const candidateId = String(row[colMap.required.youtubeId] ?? "").trim();
      if (!VIDEO_ID_REGEX.test(candidateId)) { skipped++; continue; }

      const views = parseInt(
        String(row[colMap.required.views] ?? "0").replace(/,/g, ""),
        10
      );

      const entry: VideoRow = {
        youtubeId: candidateId,
        title:     String(row[colMap.required.title] ?? "").trim() || candidateId,
        views:     isNaN(views) ? 0 : views,
      };

      // Attach optional fields if present in this file
      if (colMap.optional.duration !== undefined) {
        entry.duration = Number(row[colMap.optional.duration]) || undefined;
      }
      if (colMap.optional.watchTime !== undefined) {
        entry.watchTime = parseFloat(String(row[colMap.optional.watchTime] ?? "")) || undefined;
      }
      if (colMap.optional.subscribers !== undefined) {
        entry.subscribers = parseInt(String(row[colMap.optional.subscribers] ?? ""), 10) || undefined;
      }
      if (colMap.optional.revenue !== undefined) {
        entry.revenue = parseFloat(String(row[colMap.optional.revenue] ?? "")) || undefined;
      }

      rows.push(entry);
    }

    if (rows.length === 0) {
      return { success: false, error: "No valid video rows found from row 3 onwards." };
    }

    return {
      success:          true,
      rows,
      detectedOptional: Object.keys(colMap.optional) as OptionalColumnKey[],
      skipped,
    };

  } catch {
    return { success: false, error: "Could not read file. Ensure it is a .xlsx or .csv YouTube Analytics export." };
  }
}
```

---

## 5. Column Validation UI

When the user uploads a file, show a **column report** before proceeding. This makes any mismatch immediately obvious.

### Success state
```
✓ File loaded — 32 videos from row 3

Required columns found:
  ✓ Nội dung         (Video ID)
  ✓ Tiêu đề video    (Title)
  ✓ Số lượt xem      (Views)

Optional columns detected:
  ✓ Thời lượng
  ✓ Thời gian xem (giờ)
  ✓ Số người đăng ký
  ✓ Doanh thu ước tính (USD)

[ Continue → ]
```

### Failure state (missing required column)
```
✗ Upload failed — required columns not found

  ✓ Nội dung         found
  ✗ Tiêu đề video    NOT FOUND  ← blocks upload
  ✓ Số lượt xem      found

Fix: Ensure the file is a YouTube Analytics "Content" export with Vietnamese column names.
Expected column names: Nội dung · Tiêu đề video · Số lượt xem

[ Try again ]
```

---

## 6. Data Types

```typescript
// src/types/index.ts

export interface VideoRow {
  youtubeId:    string;
  title:        string;
  views:        number;
  duration?:    number;
  watchTime?:   number;
  subscribers?: number;
  revenue?:     number;
}

export interface GroupConfig {
  editorWeight:  number;   // 0–100
  contentWeight: number;   // must equal 100 - editorWeight
}

export const DEFAULT_CONFIG: GroupConfig = {
  editorWeight:  60,
  contentWeight: 40,
};

export type StaffRole = "EDITOR" | "CONTENT";

export interface StaffMember {
  id:       string;
  name:     string;
  role:     StaffRole;
  videoIds: string[];
}

export interface AppState {
  step:             1 | 2 | 3 | 4;
  videos:           VideoRow[];
  detectedOptional: OptionalColumnKey[];   // optional cols present in this file
  config:           GroupConfig;
  staffList:        StaffMember[];
}

// ─── Attribution output ───────────────────────────────────────────────────────

export interface VideoBreakdown {
  youtubeId:       string;
  title:           string;       // ← included in display
  totalViews:      number;
  groupWeight:     number;
  groupPool:       number;
  membersInGroup:  number;
  viewsEarned:     number;
  contributors:    string[];     // names of ALL staff on this video (both roles)
  // Optional passthrough from VideoRow (present only if column was in the file)
  duration?:       number;
  watchTime?:      number;
  subscribers?:    number;
  revenue?:        number;
}

export interface StaffAttribution {
  staffId:          string;
  staffName:        string;
  role:             StaffRole;
  videos:           VideoBreakdown[];
  totalViewsEarned: number;
}

// ─── Export config ────────────────────────────────────────────────────────────

// Mandatory columns always included in the export
// Optional columns the user can toggle on/off in ExportModal
export type ExportOptionalColumn =
  | "duration"
  | "watchTime"
  | "subscribers"
  | "revenue";

export interface ExportConfig {
  selectedOptional: ExportOptionalColumn[];
}
```

---

## 7. Core Business Logic

### 7.1 Attribution Engine

```typescript
// src/lib/services/attribution.ts

import type {
  VideoRow, GroupConfig, StaffMember,
  StaffAttribution, VideoBreakdown,
} from "@/types";

export function computeAttribution(
  videos:    VideoRow[],
  config:    GroupConfig,
  staffList: StaffMember[]
): StaffAttribution[] {

  const videoIndex = new Map<string, VideoRow>(videos.map((v) => [v.youtubeId, v]));

  const groupWeight: Record<string, number> = {
    EDITOR:  config.editorWeight  / 100,
    CONTENT: config.contentWeight / 100,
  };

  // Per video: count editors and content writers separately
  // Also collect all contributor names for display
  const groupCountByVideo  = new Map<string, Record<string, number>>();
  const contributorsByVideo = new Map<string, string[]>();

  for (const staff of staffList) {
    for (const vid of staff.videoIds) {
      if (!videoIndex.has(vid)) continue;

      const counts = groupCountByVideo.get(vid) ?? { EDITOR: 0, CONTENT: 0 };
      counts[staff.role] += 1;
      groupCountByVideo.set(vid, counts);

      const names = contributorsByVideo.get(vid) ?? [];
      names.push(staff.name);
      contributorsByVideo.set(vid, names);
    }
  }

  return staffList
    .map((staff) => {
      const breakdowns: VideoBreakdown[] = staff.videoIds
        .filter((vid) => videoIndex.has(vid))
        .map((vid) => {
          const video         = videoIndex.get(vid)!;
          const weight        = groupWeight[staff.role];
          const groupPool     = Math.round(video.views * weight);
          const membersInGroup = groupCountByVideo.get(vid)?.[staff.role] ?? 1;
          const viewsEarned   = Math.round(groupPool / membersInGroup);

          return {
            youtubeId:       video.youtubeId,
            title:           video.title,
            totalViews:      video.views,
            groupWeight:     weight,
            groupPool,
            membersInGroup,
            viewsEarned,
            contributors:    contributorsByVideo.get(vid) ?? [staff.name],
            // Optional fields — pass through only if they exist
            ...(video.duration    !== undefined && { duration:    video.duration }),
            ...(video.watchTime   !== undefined && { watchTime:   video.watchTime }),
            ...(video.subscribers !== undefined && { subscribers: video.subscribers }),
            ...(video.revenue     !== undefined && { revenue:     video.revenue }),
          };
        })
        .sort((a, b) => b.viewsEarned - a.viewsEarned);

      return {
        staffId:          staff.id,
        staffName:        staff.name,
        role:             staff.role,
        videos:           breakdowns,
        totalViewsEarned: breakdowns.reduce((s, v) => s + v.viewsEarned, 0),
      };
    })
    .sort((a, b) => b.totalViewsEarned - a.totalViewsEarned);
}

/**
 * Human-readable formula string for one video row.
 *
 * Example:
 *   "91,652 × 60% = 54,991 ÷ 2 editors = 27,496 views"
 */
export function formatFormula(v: VideoBreakdown, role: string): string {
  const label  = role === "EDITOR" ? "editor" : "content";
  const pct    = Math.round(v.groupWeight * 100);
  const plural = v.membersInGroup > 1 ? `${v.membersInGroup} ${label}s` : `1 ${label}`;

  return [
    v.totalViews.toLocaleString("vi-VN"),
    `× ${pct}%`,
    `= ${v.groupPool.toLocaleString("vi-VN")}`,
    `÷ ${plural}`,
    `= ${v.viewsEarned.toLocaleString("vi-VN")} views`,
  ].join("  →  ");
}
```

---

## 8. Results Display

### Results table — per staff member (top level)

| Tên | Vai trò | Số video | Tổng views nhận |
|---|---|---|---|
| Nguyen Van A | Editor | 12 | 47,250 |

### Expanded video breakdown (click to expand row)

Each video row shows **all** of the following:

| Field | Value | Notes |
|---|---|---|
| Tiêu đề video | "20 Secretos Extraños del Batimóvil..." | Full title from column B |
| Video ID | GI1b9_k-tN4 | Clickable → opens YouTube |
| Tổng views | 91,652 | Raw from "Số lượt xem" |
| Nhóm & tỷ trọng | Editor group · 60% | From config |
| Pool views nhóm | 54,991 | 91,652 × 60% |
| Số người trong nhóm | 2 editors | Count of editors on this video |
| **Views nhận được** | **27,496** | 54,991 ÷ 2 |
| Tất cả người làm | Nguyen Van A, Tran Thi B | All contributors (both roles) |
| Công thức | 91,652 × 60% = 54,991 ÷ 2 editors = 27,496 views | `formatFormula()` output |

---

## 9. Excel Export

### 9.1 Export Modal (shown before download)

When user clicks "Export Excel", show a modal with two sections:

```
Export Excel

Mandatory columns (always included):
  ✓ Video ID
  ✓ Tiêu đề video
  ✓ Số lượt xem (tổng)
  ✓ Số người làm video (tên)
  ✓ Views nhận được

Optional columns (available in this file):
  ☐ Thời lượng
  ☐ Thời gian xem (giờ)
  ☑ Số người đăng ký
  ☑ Doanh thu ước tính (USD)

[ Cancel ]  [ Download ]
```

Only optional columns that were actually **detected in the uploaded file** are shown in this list. If the file had no revenue column, "Doanh thu ước tính (USD)" is not offered.

### 9.2 Export Builder

```typescript
// src/lib/exporters/excel-export.ts

import * as XLSX from "xlsx";
import type { StaffAttribution, ExportConfig, ExportOptionalColumn } from "@/types";

const OPTIONAL_COLUMN_LABELS: Record<ExportOptionalColumn, string> = {
  duration:    "Thời lượng (giây)",
  watchTime:   "Thời gian xem (giờ)",
  subscribers: "Số người đăng ký",
  revenue:     "Doanh thu ước tính (USD)",
};

export function exportToExcel(
  results:      StaffAttribution[],
  exportConfig: ExportConfig,
  filename =    "views-attribution.xlsx"
): void {
  const wb = XLSX.utils.book_new();

  const optCols = exportConfig.selectedOptional;

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summaryHeaders = ["Tên nhân sự", "Vai trò", "Số video", "Tổng views nhận được"];
  const summaryRows = [
    summaryHeaders,
    ...results.map((r) => [
      r.staffName,
      r.role === "EDITOR" ? "Editor" : "Content",
      r.videos.length,
      r.totalViewsEarned,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  // ── Sheet 2: Detail ─────────────────────────────────────────────────────────
  // Mandatory columns
  const detailHeaders = [
    "Tên nhân sự",
    "Vai trò",
    "Video ID",
    "Tiêu đề video",
    "Số lượt xem (tổng)",
    "Số người làm video",
    "Danh sách người làm",
    "Views nhận được",
    "Công thức",
  ];

  // Append optional column headers (only those selected by user)
  for (const col of optCols) {
    detailHeaders.push(OPTIONAL_COLUMN_LABELS[col]);
  }

  const detailRows = [
    detailHeaders,
    ...results.flatMap((r) =>
      r.videos.map((v) => {
        const formula =
          `${v.totalViews} × ${Math.round(v.groupWeight * 100)}%` +
          ` = ${v.groupPool} ÷ ${v.membersInGroup}` +
          ` = ${v.viewsEarned}`;

        const mandatory = [
          r.staffName,
          r.role === "EDITOR" ? "Editor" : "Content",
          v.youtubeId,
          v.title,
          v.totalViews,
          v.membersInGroup,
          v.contributors.join(", "),
          v.viewsEarned,
          formula,
        ];

        // Append optional values in the same order as headers
        const optional = optCols.map((col) => v[col] ?? "");

        return [...mandatory, ...optional];
      })
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Detail");

  XLSX.writeFile(wb, filename);
}
```

---

## 10. State Management

```typescript
// src/App.tsx

type Tab = "salary" | "match";
type SalarySubTab = "calc" | "analytics";

// Tab = "salary" always visible, "match" for SheetMatcher
// SalarySubTab = "calc" for the 3-step attribution flow,
//                "analytics" for AnalyticsDashboard (gated: needs ≥ 2 publishedMonth values in videos)
//
// Step indicators in top nav bar and weight badges in header are
// shown only when tab === "salary" && salarySubTab === "calc".
//
// "Sửa file Excel" button in StaffPanel header calls onBack() → step 1.
```

```typescript
// src/lib/storage/session-storage.ts

const KEY = "yt_tracker_v4";

export const saveSession  = (s: AppState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
export const loadSession  = (): AppState | null => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
export const clearSession = () => localStorage.removeItem(KEY);
```

"New session" → `clearSession()` → reset to `INITIAL_STATE` → navigate to Step 1.

---

## 11. Netlify Deployment

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path  from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    target: "es2020",
    rollupOptions: {
      output: { manualChunks: { xlsx: ["xlsx"] } },  // SheetJS in its own chunk
    },
  },
});
```

---

## 12. Code Conventions

- Files: `kebab-case.ts`, components: `PascalCase.tsx`
- Functions: `camelCase` with descriptive verbs
- All `lib/` functions are **pure** — no I/O, no side effects, trivially testable
- Side effects (FileReader, localStorage, XLSX.writeFile) isolated to component handlers and `storage/`
- Validate inputs at boundaries with explicit checks — no silent fallbacks
- All numbers displayed in UI go through `toLocaleString("vi-VN")` — never raw floats

---

## 13. Unit Test Plan

```typescript
// parseYouTubeExport
it("detects required columns by name, not index")
it("returns failure with missing[] when a required column is absent")
it("starts parsing from row index 2 — skips header and Tổng")
it("attaches optional fields only when their column was detected")
it("handles view counts formatted with comma separators")

// parseVideoIdList
it("parses newline-separated IDs, deduplicates, trims whitespace")
it("returns invalid[] for strings that fail the 11-char regex")

// computeAttribution
it("1 editor on video → receives full editor pool")
it("2 editors on video → each receives half editor pool")
it("2 editors + 1 content, 60/40 config → correct split per role")
it("contributors[] contains names from both role groups")
it("video title is present on every VideoBreakdown")
it("staff with no matched videos has totalViewsEarned = 0")

// exportToExcel
it("mandatory columns always present regardless of exportConfig")
it("optional columns appear only when selected in exportConfig")
it("optional columns absent from file cannot be selected")
it("formula string matches computed values")
```

---

## 14. Development Checklist

```
Phase 1 — Setup
 [ ] Init Vite + React 18 + TypeScript strict
 [ ] Tailwind, path alias, netlify.toml

Phase 2 — Core logic (pure functions, no UI)
 [ ] REQUIRED_COLUMNS / OPTIONAL_COLUMNS registry
 [ ] detectColumns() — header row → ColumnMap
 [ ] parseYouTubeExport() — column-name based, starts row 3 + unit tests
 [ ] parseVideoIdList() + unit tests
 [ ] computeAttribution() — includes title + contributors[] + unit tests
 [ ] formatFormula()
 [ ] exportToExcel() — mandatory + selective optional columns

Phase 3 — Upload + Column validation UI
 [ ] UploadZone component
 [ ] ColumnReport component (success state + failure state with missing cols)
 [ ] Block progression if required columns missing

Phase 4 — Config + Staff UI
 [ ] WeightConfig (sum-to-100 validation)
 [ ] StaffCard (textarea / .txt upload, matched/unmatched feedback)
 [ ] StaffPanel (list + Add another)

Phase 5 — Results + Export UI
 [ ] ResultsTable — expandable rows, all fields per video including title
 [ ] ExportModal — only shows optional cols detected in this file
 [ ] "New session" button

Phase 6 — Polish + Deploy
 [ ] localStorage persistence
 [ ] Responsive layout
 [ ] Full error handling on all failure paths
 [ ] Deploy to Netlify, verify build
```

---

## 15. Out of Scope — Phase 2 (Salary Module)

- Base salary input per staff member
- Bonus calculation (views above threshold × rate per view)
- Payroll sheet in exported Excel
- Authentication

Phase 2 adds salary inputs to `StaffCard` and a salary computation function that consumes `StaffAttribution` from `computeAttribution()` without modifying attribution logic.


---

# Module 2 — Staff Analytics

**Version:** 1.0  
**Status:** Ready for development  
**Scope:** Multi-period performance tracking, trend analysis, quality metrics, staff ranking

---

## Overview

Staff Analytics is a read-only analytical layer built on top of Module 1 (Views Attribution).
It answers the manager's core questions:

- Who is performing well right now, and who is declining?
- Is a staff member's improvement real (sustained trend) or a lucky one-off video?
- How does each person's quality compare to peers in the same role?

**Key principle:** Analytics only appear after the user has accumulated ≥ 2 monthly sessions.
A single month has no trend to show. The UI gates access gracefully.

---

## 1. New Data Columns Used

Module 1 already parses all columns needed. Analytics uses three that were previously
collected but not surfaced:

| Column (Vietnamese) | Key | Type | Usage |
|---|---|---|---|
| `Thời gian xuất bản video` | `publishedAt` | string (e.g. "Feb 18, 2026") | Determine which month a video belongs to for time-series grouping |
| `Thời gian xem (giờ)` | `watchTime` | float | Watch time ratio = watchTime ÷ (views × durationHours) |
| `Tỷ lệ nhấp của số lượt hiển thị hình thu nhỏ (%)` | `ctr` | float | Thumbnail click-through rate |
| `Doanh thu ước tính (USD)` | `revenue` | float | Revenue per video and per staff |
| `Thời lượng` | `duration` | integer (seconds) | Needed for watch time ratio denominator |

### Parser update — add `publishedAt` and `ctr` to column registry

```typescript
// src/lib/parsers/youtube-export.ts

export const OPTIONAL_COLUMNS = {
  publishedAt:  "Thời gian xuất bản video",          // NEW — was not parsed before
  duration:     "Thời lượng",
  watchTime:    "Thời gian xem (giờ)",
  subscribers:  "Số người đăng ký",
  revenue:      "Doanh thu ước tính (USD)",
  ctr:          "Tỷ lệ nhấp của số lượt hiển thị hình thu nhỏ (%)",  // NEW
  impressions:  "Số lượt hiển thị hình thu nhỏ",     // NEW — denominator for CTR context
} as const;

export type OptionalColumnKey = keyof typeof OPTIONAL_COLUMNS;
```

### VideoRow update

```typescript
// src/types/index.ts

export interface VideoRow {
  youtubeId:    string;
  title:        string;
  views:        number;
  publishedAt?: string;    // NEW — raw string from sheet, e.g. "Feb 18, 2026"
  publishedMonth?: string; // NEW — derived: "2026-02"  (YYYY-MM, used for grouping)
  duration?:    number;    // seconds
  watchTime?:   number;    // hours
  subscribers?: number;
  revenue?:     number;    // USD
  ctr?:         number;    // percentage, e.g. 4.95
  impressions?: number;
}
```

### Parse publishedAt → publishedMonth

```typescript
// src/lib/parsers/youtube-export.ts

/**
 * Parse YouTube's date string into a YYYY-MM period key.
 * YouTube exports dates in various locale formats:
 *   "Feb 18, 2026", "18 Feb 2026", "18/02/2026", "2026-02-18"
 * Returns "YYYY-MM" or "" if unparseable.
 */
export function parsePublishedMonth(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
```

---

## 2. Multi-Period Single-File Approach

Analytics does **not** require saving separate monthly sessions. The user uploads a
**single YouTube Analytics export that spans multiple months** (the file has a
`Thời gian xuất bản video` column whose values fall across different YYYY-MM periods).
The app derives periods from `publishedMonth` on each `VideoRow`.

**Access gate:** The Analytics sub-tab is enabled only when
`getDistinctPeriods(videos).length >= 2`. Below 2 months a notice is shown.

**Period range filter:** 3m / 6m / 12m / Tất cả — slices the `allPeriods` array
(newest-first) before computing metrics.

### No history storage required

The old design proposed storing monthly sessions in `localStorage` with a
"Lưu tháng này" button. **This was not implemented.** All analytics are derived
from the currently uploaded file in real time.

### Deriving the period from videos

```typescript
// src/lib/services/analytics.ts

/**
 * Determine the dominant YYYY-MM period from a list of videos.
 * Takes the mode (most frequent) publishedMonth among all videos.
 * Falls back to the current month if no publishedAt data is present.
 */
export function derivePeriod(videos: VideoRow[]): string {
  const counts = new Map<string, number>();
  for (const v of videos) {
    if (!v.publishedMonth) continue;
    counts.set(v.publishedMonth, (counts.get(v.publishedMonth) ?? 0) + 1);
  }
  if (!counts.size) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  return `Tháng ${parseInt(month)}/${year}`;
}
```

### History management rules

- Maximum 12 sessions stored (oldest dropped when limit exceeded).
- Saving: when user completes Step 3 (Results), a "Lưu tháng này" button
  appears. Clicking saves the current session into `history[]`.
- Deduplication: if a session with the same `period` already exists in history,
  prompt the user: "Tháng 2/2026 đã có dữ liệu. Ghi đè?" → confirm → replace.
- Sessions are stored sorted newest-first.

---

## 3. Analytics Service — Pure Functions

All analytics logic lives in `src/lib/services/analytics.ts`.
Every function is pure: same inputs → same outputs. No side effects. Fully testable.

```typescript
// src/lib/services/analytics.ts

import type { MonthSession, StaffMember } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffPeriodMetrics {
  staffName:        string;
  role:             string;
  period:           string;           // "2026-02"
  label:            string;           // "Tháng 2/2026"
  videoCount:       number;
  weightedViews:    number;           // views earned after group weight
  avgViewsPerVideo: number;           // weightedViews / videoCount
  totalWatchTime:   number;           // hours — sum across their videos
  avgWatchTimeRatio: number;          // 0–1: how much of each video is watched
  avgCtr:           number;           // average CTR % across their videos
  totalRevenue:     number;           // USD
  revenuePerVideo:  number;           // USD / videoCount
  viralCount:       number;           // videos with views ≥ 2× channel avg
  underCount:       number;           // videos with views < 0.5× channel avg
}

export interface StaffTrend {
  staffName:   string;
  role:        string;
  score:       number;     // avg(last 3 periods views) / avg(prev 3 periods views)
  label:       TrendLabel;
  periods:     Array<{ period: string; label: string; weightedViews: number }>;
  bestPeriod:  string;     // period label of highest views
  worstPeriod: string;
}

export type TrendLabel =
  | "rising_strong"    // score ≥ 1.2
  | "rising"           // score 1.0–1.2
  | "stable"           // score 0.8–1.0
  | "declining"        // score 0.6–0.8
  | "declining_severe" // score < 0.6
  | "insufficient_data"; // fewer than 2 periods

export interface StaffRank {
  staffName:     string;
  role:          string;
  weightedViews: number;
  rank:          number;   // 1 = best within role group
  percentile:    number;   // 0–100 (100 = top of group)
}

// ── Channel-level baseline (needed for viral/under classification) ──────────

export function channelAvgViews(sessions: MonthSession[]): number {
  const allViews = sessions.flatMap(s => s.videos.map(v => v.views));
  if (!allViews.length) return 0;
  return allViews.reduce((a, b) => a + b, 0) / allViews.length;
}

// ── Per-staff, per-period metrics ─────────────────────────────────────────────

/**
 * Compute full metrics for every (staff, period) combination.
 * Groups videos by publishedMonth, then for each period × staff combination
 * computes weighted views, watch time, revenue, subscribers, viral/under counts.
 *
 * Revenue is proportional: v.revenue * weight / membersInRole (same ratio as views).
 * totalSubscribers is a raw sum (not weighted).
 *
 * Returns a flat array sorted by period descending, then by weightedViews descending.
 */
export function computeAllPeriodMetrics(
  videos:    VideoRow[],
  staffList: StaffMember[],
  weights:   Record<string, number>   // { "Editor": 60, "Content": 40 }
): StaffPeriodMetrics[] { /* see src/lib/services/analytics.ts */ }

// ── Trend scoring ──────────────────────────────────────────────────────────────

/**
 * Compute trend score and label for each staff member.
 * Requires at least 2 periods for any meaningful trend.
 * Uses all available periods for the moving window — not fixed at 3
 * when fewer periods are available.
 */
export function computeTrends(allMetrics: StaffPeriodMetrics[]): StaffTrend[] {
  // Group by staff name
  const byStaff = new Map<string, StaffPeriodMetrics[]>();
  for (const m of allMetrics) {
    const key = `${m.staffName}::${m.role}`;
    if (!byStaff.has(key)) byStaff.set(key, []);
    byStaff.get(key)!.push(m);
  }

  const trends: StaffTrend[] = [];

  for (const [key, periods] of byStaff) {
    // Sort oldest → newest for window calculation
    const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period));
    const [name, role] = key.split("::");

    if (sorted.length < 2) {
      trends.push({
        staffName: name, role,
        score: 1, label: "insufficient_data",
        periods: sorted.map(p => ({ period: p.period, label: p.label, weightedViews: p.weightedViews })),
        bestPeriod: sorted[0]?.label ?? "",
        worstPeriod: sorted[0]?.label ?? "",
      });
      continue;
    }

    const n         = sorted.length;
    const halfPoint = Math.floor(n / 2);
    const recentAvg = avg(sorted.slice(n - halfPoint).map(p => p.weightedViews));
    const prevAvg   = avg(sorted.slice(0, halfPoint).map(p => p.weightedViews));
    const score     = prevAvg > 0 ? recentAvg / prevAvg : 1;

    const best  = sorted.reduce((a, b) => a.weightedViews > b.weightedViews ? a : b);
    const worst = sorted.reduce((a, b) => a.weightedViews < b.weightedViews ? a : b);

    trends.push({
      staffName: name, role,
      score: Math.round(score * 100) / 100,
      label: trendLabel(score),
      periods: sorted.map(p => ({ period: p.period, label: p.label, weightedViews: p.weightedViews })),
      bestPeriod:  best.label,
      worstPeriod: worst.label,
    });
  }

  return trends.sort((a, b) => b.score - a.score);
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function trendLabel(score: number): TrendLabel {
  if (score >= 1.2) return "rising_strong";
  if (score >= 1.0) return "rising";
  if (score >= 0.8) return "stable";
  if (score >= 0.6) return "declining";
  return "declining_severe";
}

// ── Ranking within role group ─────────────────────────────────────────────────

/**
 * Rank staff within their role group for a given period.
 * Returns percentile (100 = best in group).
 */
export function computeRankings(
  metrics:   StaffPeriodMetrics[],
  period:    string
): StaffRank[] {
  const forPeriod = metrics.filter(m => m.period === period);

  // Group by role
  const byRole = new Map<string, StaffPeriodMetrics[]>();
  for (const m of forPeriod) {
    if (!byRole.has(m.role)) byRole.set(m.role, []);
    byRole.get(m.role)!.push(m);
  }

  const result: StaffRank[] = [];

  for (const [, group] of byRole) {
    const sorted = [...group].sort((a, b) => b.weightedViews - a.weightedViews);
    sorted.forEach((m, idx) => {
      const rank       = idx + 1;
      const percentile = group.length > 1
        ? Math.round(((group.length - idx - 1) / (group.length - 1)) * 100)
        : 100;
      result.push({
        staffName:     m.staffName,
        role:          m.role,
        weightedViews: m.weightedViews,
        rank,
        percentile,
      });
    });
  }

  return result;
}
```

---

## 4. UI Structure

Analytics is a **sub-tab under `📊 Tính views`**, not a top-level tab.
The sub-tab button is disabled (cursor-not-allowed + tooltip) when the uploaded
file has fewer than 2 distinct `publishedMonth` values.

### Navigation hierarchy

```
Top nav:  📊 Tính views  |  🔗 Match Sheet
                │
                └── Sub-tabs (inside Tính views content):
                      📊 Tính views   (calc: steps 1/2/3)
                      📈 Analytics    (gated: ≥ 2 months)
```

### Component tree

```
src/components/features/analytics/
├── AnalyticsDashboard.tsx    # Root — period range filter + 4 sub-tabs
├── OverviewTab.tsx           # KPI summary + role accordions (tỷ lệ/tổng badges)
├── RoleCompareTab.tsx        # Per-role comparison table (tỷ lệ/tổng badges)
├── RankingTab.tsx            # Top 10 videos + 5 staff leaderboards
└── TrendTab.tsx              # SVG line charts (revenue hidden if no data) + trend cards
```

### AnalyticsDashboard.tsx — structure

```typescript
interface Props {
  videos:    VideoRow[];
  staffList: StaffMember[];
  weights:   Record<string, number>;
}

type SubTab      = "overview" | "role" | "ranking" | "trend";
type PeriodRange = "3m" | "6m" | "12m" | "all";

// Internal state
const [subTab,      setSubTab]      = useState<SubTab>("overview");
const [periodRange, setPeriodRange] = useState<PeriodRange>("6m");

// All distinct periods newest-first from uploaded file
const allPeriods = useMemo(() => getDistinctPeriods(videos), [videos]);

// Apply period range filter → slice allPeriods → filter videos to those periods
const activePeriods  = useMemo(() => { /* slice allPeriods by n */ }, [allPeriods, periodRange]);
const filteredVideos = useMemo(() => videos.filter(v => activePeriods.has(v.publishedMonth)), [...]);

// Derived (memoised)
const allMetrics = useMemo(() => computeAllPeriodMetrics(filteredVideos, staffList, weights), [...]);
const trends     = useMemo(() => computeTrends(allMetrics), [allMetrics]);
```

### Gate condition

```typescript
if (allPeriods.length < 2) {
  return <div>Cần dữ liệu từ ít nhất 2 tháng...</div>;
}
```

---

## 5. Sub-tab Designs

### Metric badge system (used across all tabs)

Two badge types indicate how a metric is calculated:

| Badge | Style | Applied to |
|---|---|---|
| `tỷ lệ` | blue pill | Views, Doanh thu (weighted by role % ÷ members in role) |
| `tổng` | slate pill | Video count, Watch time, Lượt đăng ký (raw sum) |

Revenue formula: `v.revenue × (roleWeight / 100) / membersInRole`
Views formula: `v.views × (roleWeight / 100) / membersInRole`

### 5.1 Tổng quan tab (`OverviewTab`)

**KPI summary cards** (top row):
- Nhân sự (no badge)
- Video theo dõi `tổng`
- Tổng views `tỷ lệ`
- Tổng doanh thu `tỷ lệ` — **hidden entirely when no revenue column in file**

**Role accordions** (collapsible, first open by default):
- Header: role name + member count + total views + total revenue
- Staff table inside: `#` | Tên | Video `tổng` | Tổng views `tỷ lệ` | Watch time `tổng` | Doanh thu `tỷ lệ` | Xu hướng
- Footer row with role totals

### 5.2 Theo vai trò tab (`RoleCompareTab`)

One card per role group. Staff ranked by total views (descending).
Table columns: Tên | Video `tổng` | Watch time TB `tổng` | Tổng watch time `tổng` | Tổng views `tỷ lệ` | Tổng doanh thu `tỷ lệ` | Xu hướng

Rank badges: #1 gold · #2 silver · #3 bronze.

### 5.3 Xếp hạng tab (`RankingTab`)

**Top Video sections** (collapsible):
- 🎬 Top 10 Video — Lượt xem (open by default)
- 🎬 Top 10 Video — Doanh thu (hidden if no revenue)
- 🎬 Top 10 Video — Lượt đăng ký (hidden if no subscriber data)

Each video shows: rank · title (links to YouTube) · staff tags · value · proportional bar

**Staff leaderboard sections** (collapsible, with badge labels):
- 👁️ Số views `tỷ lệ` — open by default
- 🎬 Video đóng góp `tổng`
- 💰 Doanh thu `tỷ lệ` — hidden if no data
- 🔔 Lượt đăng ký `tổng` — hidden if no data
- ⏱️ Thời lượng xem `tổng` — hidden if no data

Medals 🥇🥈🥉 for top 3, numbered circle for the rest.

### 5.4 Xu hướng tab (`TrendTab`)

**SVG line charts** (no external library):
- Each staff = one colored polyline with a distinct `strokeDasharray` pattern
  (prevents lines from vanishing when two staff have identical values)
- Dots have a transparent r=12 hit target for stable hover; visible r=4.5 dot
  has `pointerEvents: none` to prevent flicker
- Tooltip: HTML `<div>` overlay positioned from SVG cx/cy, not an SVG element

Charts shown:
- Doanh thu theo thời gian — **hidden entirely when no revenue column in file**
- Views theo thời gian — always shown

**Trend summary cards**: one per staff — name · role · period count · trend badge · latest views

---

## 6. Export — Analytics Report

A new export option in the Analytics tab: **"Xuất báo cáo"** → downloads an Excel file
with one sheet per sub-tab.

```typescript
// src/lib/exporters/analytics-export.ts

export function exportAnalyticsReport(
  allMetrics: StaffPeriodMetrics[],
  trends:     StaffTrend[],
  rankings:   StaffRank[],
  period:     string,
  filename =  "staff-analytics-report.xlsx"
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Trend overview (one row per staff, columns = periods)
  // Sheet 2 — Period detail (all StaffPeriodMetrics fields)
  // Sheet 3 — Rankings (current period)
  // Sheet 4 — Quality metrics (CTR, watch ratio, revenue)
}
```

Sheet structure:

**Sheet 1 — Xu hướng:** Staff name | Role | Trend score | Trend label | [period 1 views] | [period 2 views] | … (dynamic columns, one per period in range)

**Sheet 2 — Chi tiết theo tháng:** All `StaffPeriodMetrics` fields as columns, one row per (staff, period)

**Sheet 3 — Xếp hạng tháng này:** Role group | Rank | Name | Views | Percentile

**Sheet 4 — Chất lượng:** Name | Role | Avg CTR | Watch ratio | Revenue total | Viral count | Under count

---

## 7. State (No History Required)

Analytics derives all data from the currently uploaded `VideoRow[]` (which already
contains `publishedMonth` per row). No `history[]` array, no "save month" button,
no `MonthSession` type. The existing `AppState` is unchanged from Module 1:

```typescript
export interface AppState {
  step:             1 | 2 | 3;
  videos:           VideoRow[];           // contains publishedMonth — multi-period source
  detectedOptional: OptionalColumnKey[];
  staffList:        StaffMember[];
  weights:          Record<string, number>;
}
```

The `localStorage` key remains `"yt_tracker_v4"` — no additional history keys.

---

## 8. Unit Test Plan — Analytics Module

```typescript
// src/lib/services/analytics.test.ts

describe("parsePublishedMonth", () => {
  it("parses 'Feb 18, 2026' → '2026-02'")
  it("parses '18 Feb 2026' → '2026-02'")
  it("returns '' for empty or invalid strings")
})

describe("derivePeriod", () => {
  it("returns the most frequent publishedMonth across videos")
  it("falls back to current month when no publishedAt data")
})

describe("computeAllPeriodMetrics", () => {
  it("weighted views match Module 1 output for same session")
  it("watch time ratio is capped at 1.0")
  it("viral count only incremented when views ≥ 2 × channelAvg")
  it("underCount only incremented when views < 0.5 × channelAvg")
  it("staff with no matched videos produces no output row")
})

describe("computeTrends", () => {
  it("score = 1.0 when all periods have equal views")
  it("rising_strong when recent avg is 40%+ above prev avg")
  it("declining_severe when recent avg is less than 60% of prev avg")
  it("insufficient_data label when only 1 period available")
  it("handles unequal number of periods in each half gracefully")
})

describe("computeRankings", () => {
  it("rank 1 is the highest views in the group")
  it("percentile 100 = rank 1, percentile 0 = last rank")
  it("single-member group always gets percentile 100")
  it("groups are separated by role — editors don't rank against content")
})

describe("addOrReplaceSession", () => {
  it("replaces session with same period")
  it("trims to maxSessions when limit exceeded")
  it("keeps history sorted newest-first")
})
```

---

## 9. Development Checklist — Module 2

```
Phase A — Data layer                                          STATUS
 [x] Add publishedAt + ctr to OPTIONAL_COLUMNS registry       DONE
 [x] parsePublishedMonth() + derivePeriod()                   DONE
 [x] VideoRow updated with publishedAt, publishedMonth, ctr   DONE
 [x] computeAllPeriodMetrics(videos, staffList, weights)       DONE
     — revenue weighted: v.revenue * weight / members
     — totalSubscribers raw sum
 [x] computeTrends() — all 6 TrendLabel cases                 DONE
 [x] computeRankings()                                        DONE
 [x] getDistinctPeriods()                                     DONE

Phase B — Analytics sub-tab (inside Tính views)               STATUS
 [x] AnalyticsDashboard — period range filter + sub-tab route  DONE
 [x] OverviewTab — KPI cards + role accordions + badges        DONE
 [x] RoleCompareTab — per-role ranked table + badges           DONE
 [x] RankingTab — Top 10 videos + 5 leaderboards              DONE
 [x] TrendTab — SVG line charts + tooltip fix + dash patterns  DONE
 [x] Analytics moved to sub-tab under Tính views              DONE
 [x] Revenue-dependent UI hidden when no revenue column       DONE
 [x] tỷ lệ/tổng badges on all metric column headers           DONE

Phase C — UX improvements                                      STATUS
 [x] "Sửa file Excel" button in StaffPanel                    DONE
 [x] ResultsTable: full-width title column (no truncation)     DONE
 [x] ResultsTable: Tổng doanh thu card hidden when no revenue  DONE
 [x] Step indicators + weight badges hidden on Analytics tab   DONE

Phase D — Analytics export                                     STATUS
 [ ] exportAnalyticsReport() — Excel export from Analytics tab TODO
```
```

---

## 10. Design Constraints and Guardrails

**Do not modify Module 1 logic.** `computeAttribution()` in `attribution.ts` must remain
untouched. Analytics services are additive consumers — they read `MonthSession[]` and
produce derived views, never writing back.

**Respect role-group separation in all comparisons.** Never rank an Editor against a
Content writer. All ranking, percentile, and comparison logic must first partition by role
and then compute within that partition.

**All computed numbers must be rounded before display.** Use `Math.round()` for views
and counts, `.toFixed(2)` for ratios and percentages. Never let raw floats reach the UI.

**Analytics tab is disabled until `history.length >= 2`.** Show a tooltip or inline callout:
"Cần ít nhất 2 tháng dữ liệu để xem phân tích xu hướng. Lưu tháng hiện tại và upload
tháng tiếp theo."

---

# Module 3 — Revenue Analytics

**Version:** 1.0  
**Scope:** Revenue attribution per staff · Revenue trends · Revenue per view (RPV) · Revenue forecasting

---

## Overview

Module 3 extends the analytics layer with revenue-specific views.
The goal is to answer the question every manager needs:

> "Which staff member is generating the most dollar value — not just the most views?"

Revenue from YouTube Analytics (`Doanh thu ước tính (USD)`) is already parsed
in Module 1 as an optional column. Module 3 surfaces it as a first-class metric
with the same attribution logic as views: revenue is split by group weight and
member count, exactly mirroring how weighted views are calculated.

---

## 1. Revenue Attribution — Core Logic

Revenue follows the same group-weight formula as views.

```
revenue_pool    = video.revenue × (groupWeight / 100)
revenue_earned  = revenue_pool ÷ membersInGroup
```

This is added to `computeAllPeriodMetrics()` as additional output fields —
no new service function needed.

### New fields on StaffPeriodMetrics

```typescript
// src/lib/services/analytics.ts  — extend StaffPeriodMetrics

export interface StaffPeriodMetrics {
  // ... existing fields ...

  // Revenue (all USD)
  totalRevenue:        number;   // sum of revenue_earned across all videos
  revenuePerVideo:     number;   // totalRevenue / videoCount
  revenuePerView:      number;   // totalRevenue / weightedViews  (RPV — Revenue Per View)
  revenueGrowthRate:   number;   // filled in by computeTrends() — revenue trend score
}
```

### RPV — Revenue Per View

RPV is the most actionable metric for a manager: it shows whether a staff member's
content is monetising well relative to its reach.

```
RPV = totalRevenue (USD) / weightedViews
```

A high-RPV video attracts a premium audience or ranks well in ad auctions.
A low-RPV video may have high views but low advertiser interest (wrong topic, wrong audience).

---

## 2. Revenue Trend

Revenue trend follows the same pattern as views trend — computed separately so
a staff member can be rising in views but flat/declining in revenue (or vice versa).

### New type

```typescript
export interface StaffRevenueTrend {
  staffName:          string;
  role:               string;
  revenueTrendScore:  number;       // same formula as views trend score, applied to revenue
  revenueTrendLabel:  TrendLabel;   // reuses existing TrendLabel enum
  periods: Array<{
    period:        string;
    label:         string;
    totalRevenue:  number;
    rpv:           number;
  }>;
  bestRevenuePeriod:  string;
  totalRevenueAllTime: number;
}
```

### Function

```typescript
// src/lib/services/analytics.ts

export function computeRevenueTrends(
  allMetrics: StaffPeriodMetrics[]
): StaffRevenueTrend[] {
  const byStaff = new Map<string, StaffPeriodMetrics[]>();
  for (const m of allMetrics) {
    const key = `${m.staffName}::${m.role}`;
    if (!byStaff.has(key)) byStaff.set(key, []);
    byStaff.get(key)!.push(m);
  }

  const results: StaffRevenueTrend[] = [];

  for (const [key, periods] of byStaff) {
    const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period));
    const [name, role] = key.split("::");

    const n         = sorted.length;
    const halfPoint = Math.floor(n / 2);
    const recentAvg = avg(sorted.slice(n - halfPoint).map(p => p.totalRevenue));
    const prevAvg   = avg(sorted.slice(0, halfPoint).map(p => p.totalRevenue));
    const score     = prevAvg > 0 ? recentAvg / prevAvg : 1;

    const best = sorted.reduce((a, b) => a.totalRevenue > b.totalRevenue ? a : b);

    results.push({
      staffName:          name,
      role,
      revenueTrendScore:  Math.round(score * 100) / 100,
      revenueTrendLabel:  n < 2 ? "insufficient_data" : trendLabel(score),
      periods: sorted.map(p => ({
        period:       p.period,
        label:        p.label,
        totalRevenue: p.totalRevenue,
        rpv:          p.weightedViews > 0
          ? Math.round((p.totalRevenue / p.weightedViews) * 10000) / 10000
          : 0,
      })),
      bestRevenuePeriod:   best.label,
      totalRevenueAllTime: Math.round(sorted.reduce((s, p) => s + p.totalRevenue, 0) * 100) / 100,
    });
  }

  return results.sort((a, b) => b.totalRevenueAllTime - a.totalRevenueAllTime);
}
```

---

## 3. Revenue UI — New Sub-tab: Doanh Thu

A fifth sub-tab added to `AnalyticsDashboard`:

```
Tổng quan  |  Xu hướng  |  Chất lượng  |  Xếp hạng  |  Doanh thu   ← NEW
```

The tab is only visible when at least one session has revenue data
(`history.some(s => s.videos.some(v => v.revenue !== undefined))`).

### Layout — RevenueTab.tsx

```
src/components/features/analytics/RevenueTab.tsx
```

#### Section 1 — Summary cards (current period)

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Tổng doanh thu │  │  Cao nhất/người │  │  RPV trung bình │  │  Tăng trưởng    │
│  $184.20        │  │  $82.10 (NA)    │  │  $0.00037/view  │  │  ↑ +28%         │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

#### Section 2 — Revenue leaderboard (current period, within role group)

Ranked table identical in structure to RankingTab but sorted by `totalRevenue`:

| # | Tên | Vai trò | Revenue tháng này | RPV | vs tháng trước |
|---|---|---|---|---|---|
| 🥇 | Nguyen Van A | Editor | $82.10 | $0.00041 | ↑ +31% |
| 2 | Le Van C | Editor | $54.80 | $0.00029 | → +2% |

`RPV` column is colour-coded: green if above role-group median, gray if at median, amber if below.

#### Section 3 — Revenue over time (line chart)

One line per staff member, X-axis = periods, Y-axis = totalRevenue (USD).
Hovering a point shows: Period · Revenue · Views · RPV for that staff × period.

#### Section 4 — RPV comparison table

Shows how efficiently each person converts views into revenue.
Sorted by RPV descending within role group.

```
Nhóm Editor
──────────────────────────────────────────────────────────
  Nguyen Van A   RPV: $0.00041   ████████████  +above avg
  Le Van C       RPV: $0.00029   ████████      avg
──────────────────────────────────────────────────────────
Nhóm Content
──────────────────────────────────────────────────────────
  Pham Thi D     RPV: $0.00035   ███████████   +above avg
  Tran Thi B     RPV: $0.00021   ██████        -below avg
```

#### Section 5 — Video-level revenue breakdown (expandable per staff)

Clicking a staff name expands a table of their videos, sorted by revenue descending:

| Video ID | Tiêu đề | Views | Revenue earned | RPV |
|---|---|---|---|---|
| GI1b9_k-tN4 | 20 Secretos... | 45,826 | $18.80 | $0.00041 |

This lets the manager see which specific videos are driving revenue — and whether
high-revenue videos correlate with the staff member's content decisions.

---

## 4. Revenue Export Sheet

The existing `exportAnalyticsReport()` function gains a fifth sheet:

**Sheet 5 — Doanh thu:**

| Tên nhân sự | Vai trò | Tháng | Revenue (USD) | RPV | Xu hướng revenue | Video count |
|---|---|---|---|---|---|---|

And a sixth sheet for video-level revenue:

**Sheet 6 — Doanh thu theo video:**

| Tên nhân sự | Video ID | Tiêu đề | Tháng | Views | Revenue earned (USD) | RPV |
|---|---|---|---|---|---|---|

```typescript
// src/lib/exporters/analytics-export.ts  — add two sheets

function buildRevenueSheets(
  allMetrics:     StaffPeriodMetrics[],
  revenueTrends:  StaffRevenueTrend[],
  history:        MonthSession[],
  weights:        Record<string, number>
): { summary: unknown[][]; detail: unknown[][] } {
  // Sheet 5: one row per (staff, period)
  const summaryHeaders = [
    "Tên nhân sự", "Vai trò", "Tháng", "Revenue (USD)",
    "RPV", "Xu hướng revenue", "Số video",
  ];
  const summaryRows = allMetrics
    .filter(m => m.totalRevenue > 0)
    .map(m => {
      const trend = revenueTrends.find(t => t.staffName === m.staffName);
      return [
        m.staffName, m.role, m.label,
        m.totalRevenue.toFixed(2),
        m.revenuePerView.toFixed(5),
        trend?.revenueTrendLabel ?? "",
        m.videoCount,
      ];
    });

  // Sheet 6: one row per (staff, video) — video-level revenue attribution
  const detailHeaders = [
    "Tên nhân sự", "Video ID", "Tiêu đề", "Tháng",
    "Views nhận được", "Revenue earned (USD)", "RPV",
  ];
  const detailRows: unknown[][] = [];
  // ... iterate history → sessions → staffList → videoIds → compute per-video revenue
  // Same attribution logic as computeAllPeriodMetrics but kept at video granularity

  return {
    summary: [summaryHeaders, ...summaryRows],
    detail:  [detailHeaders, ...detailRows],
  };
}
```

---

## 5. Important Note on Revenue Data Availability

YouTube revenue data (`Doanh thu ước tính (USD)`) is only available in exports
from channels that are monetised and meet the YouTube Partner Program requirements.
Non-monetised channels will not have this column.

The app handles this gracefully:
- Revenue columns are always `optional` — the parser never fails without them.
- The Revenue sub-tab is hidden when no session has revenue data.
- All revenue fields default to `0` when the column is absent — they never appear
  as `undefined` in `StaffPeriodMetrics`.
- Export sheets 5 and 6 are omitted from the Excel file when all revenue values are 0.

---

## 6. Unit Tests — Revenue Module

```typescript
describe("computeAllPeriodMetrics — revenue fields", () => {
  it("revenuePerView = 0 when views = 0 (no division by zero)")
  it("revenue is split by group weight then by member count")
  it("totalRevenue = 0 when video.revenue is undefined")
  it("revenuePerVideo rounds to 2 decimal places")
})

describe("computeRevenueTrends", () => {
  it("revenueTrendScore = 1 when revenue is flat across all periods")
  it("rising_strong when recent revenue avg is 40%+ above previous")
  it("insufficient_data when fewer than 2 periods available")
  it("totalRevenueAllTime is sum of all periods")
  it("bestRevenuePeriod matches the period with highest totalRevenue")
})
```

---

## 7. Development Checklist — Module 3

```
Phase A — Data layer
 [ ] Confirm revenue column already parsed in Module 1 (it is — optional)
 [ ] Add revenuePerView + revenueGrowthRate to StaffPeriodMetrics type
 [ ] Update computeAllPeriodMetrics() to populate revenue fields
 [ ] Add computeRevenueTrends() with unit tests

Phase B — UI
 [ ] RevenueTab.tsx — 5 sections as specified above
 [ ] Conditionally show/hide Revenue tab based on data availability
 [ ] RPV colour-coding (above/at/below group median)
 [ ] Expandable video-level breakdown per staff

Phase C — Export
 [ ] Add Sheet 5 (revenue summary) to exportAnalyticsReport()
 [ ] Add Sheet 6 (video-level revenue) to exportAnalyticsReport()
 [ ] Omit both sheets gracefully when all revenue = 0
```
---

# Module 4 — Staff Video ID Filter

**Version:** 1.0  
**Status:** Ready for development  
**Scope:** Upload staff assignment sheet → parse staff–video mappings → filter by person → copy or export

---

## Overview

This module answers a specific operational need:

> "Given our internal production sheet (which tracks who made what),
> extract the list of video IDs for each person so they can be pasted
> into the Views Calculator staff cards."

The user maintains a Google Sheet / Excel file that assigns staff to videos.
Each row is one video. The staff column contains multiple names (e.g. colorful
tag chips like "CT Minh Anh", "ED Tuân 95"). This module parses that sheet,
groups video IDs by staff member, and produces copy-ready ID lists.

---

## 1. Input File Specification

### Observed format (from screenshot)
```
Row 1  →  empty or decorative
Row 2  →  Column headers
Row 3+ →  Data rows
```

| Column | Header | Content |
|---|---|---|
| B | LINK GỐC | Original source URL |
| C | Video ID | 11-character YouTube video ID (may be empty) |
| D | TIÊU ĐỀ | Video title |
| E | TÊN BÀI | Internal working title |
| F | LINK | YouTube link |
| G | TRẠNG THÁI | Status (e.g. "Đã Đăng") |
| K | Tên Người Làm | Staff names — **multiple per cell**, newline or space separated |
| T | NGÀY ĐĂNG | Publish date |

### Multi-sheet support & parse modes

The parser accepts a `mode` parameter (`StaffSheetMode`) that controls which sheets are read:

| Mode | Description | Sheets read |
|---|---|---|
| `"tien-do"` (default) | File Tiến Độ Công Việc gốc từ Google Sheet | Only sheets whose name contains **"work progress"** or **"live stream"** / **"livestream"** (case-insensitive). Other sheets are ignored. |
| `"staff-export"` | File đã export từ Lọc Video ID | Only the **first sheet**. |

All matching sheets must have the same column format (Video ID + Tên Người Làm).
Rows are merged across sheets with **videoId deduplication** (first sheet wins on duplicates).

### StaffPanel import UI

The import zone in StaffPanel (Step 2) has **two tabs**:

- **📋 File Tiến Độ Công Việc** — uses mode `"tien-do"`, reads Work Progress + Live Stream sheets
- **📄 Staff Video IDs** — uses mode `"staff-export"`, reads first sheet only (tries export format first, then raw format as fallback)

When importing, if a staff member with the same name already exists, their video IDs are **overridden** with the new data from the import file.

### Key characteristics

- **Video ID column (C or D):** May be empty for some rows — those rows are skipped.
- **Staff column (K or L):** Contains multiple names in one cell. Names are separated by
  newlines (`\n`), commas, or semicolons, and each name may have a role prefix like `CT `, `ED `.
  Example cell value: `"CT Minh Anh\nED Tuân 95"` or `"CT Tuyên\nED Hoàng"`.
- **Header row:** Detected automatically in the first 5 rows by scanning for both
  "Video ID" and "Tên Người Làm" column aliases. Data starts from the row after headers.

### Column detection strategy

Columns are detected **by header name** (case-insensitive, trimmed), not by fixed
index. This makes the parser robust to column reordering.
```typescript
// src/lib/parsers/staff-sheet.ts

export const STAFF_SHEET_COLUMNS = {
  videoId:   ["video id", "video_id", "id"],
  staffName: ["tên người làm", "ten nguoi lam", "người làm", "staff"],
  title:     ["tiêu đề", "tieu de", "title", "tên bài", "ten bai"],
  status:    ["trạng thái", "trang thai", "status"],
  publishedAt: ["ngày đăng", "ngay dang", "published", "publish date"],
} as const;
```

---

## 2. Parser
```typescript
// src/lib/parsers/staff-sheet.ts

import * as XLSX from "xlsx";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface StaffSheetRow {
  videoId:      string;
  title:        string;
  staffNames:   string[];
  status:       string;
  publishedAt:  string;
  rowIndex:     number;
}

export interface StaffSheetParseSuccess {
  success:    true;
  rows:       StaffSheetRow[];
  skipped:    number;
  allStaff:   string[];
  headerRow:  number;
}

export interface StaffSheetParseFailure {
  success: false;
  error:   string;
}

export type StaffSheetParseResult = StaffSheetParseSuccess | StaffSheetParseFailure;

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

// ── Sheet filtering by mode ───────────────────────────────────────────────────

export type StaffSheetMode = "staff-export" | "tien-do";

const TIEN_DO_SHEET_KEYWORDS = ["work progress", "live stream", "livestream"];

function isAllowedSheet(sheetName: string, index: number, mode: StaffSheetMode): boolean {
  if (mode === "staff-export") return index === 0;
  // mode === "tien-do": only sheets matching keywords
  const lower = sheetName.toLowerCase().trim();
  return TIEN_DO_SHEET_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Multi-sheet parser ────────────────────────────────────────────────────────

export function parseStaffSheet(
  buffer: ArrayBuffer,
  mode: StaffSheetMode = "tien-do"
): StaffSheetParseResult {
  try {
    const wb = XLSX.read(buffer, { type: "array" });

    const allRows:     StaffSheetRow[] = [];
    const allStaff     = new Set<string>();
    const existingIds  = new Set<string>();
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

      for (const row of result.rows) {
        if (!existingIds.has(row.videoId)) {
          allRows.push(row);
          existingIds.add(row.videoId);
        }
      }

      result.staffSet.forEach((n) => allStaff.add(n));
      totalSkipped += result.skipped;
    }

    if (parsedSheets === 0) {
      return {
        success: false,
        error: mode === "tien-do"
          ? "Không tìm thấy sheet 'Work Progress' hoặc 'Live Stream'."
          : "Could not detect header row.",
      };
    }

    if (allRows.length === 0) {
      return { success: false, error: "No rows with valid Video IDs found." };
    }

    return {
      success:   true,
      rows:      allRows,
      skipped:   totalSkipped,
      allStaff:  [...allStaff].sort(),
      headerRow: firstHeaderRow,
    };
  } catch (e) {
    return { success: false, error: `Parse error: ${String(e)}` };
  }
}
```

---

## 3. Grouping Service
```typescript
// src/lib/services/staff-video-filter.ts

import type { StaffSheetRow } from "@/lib/parsers/staff-sheet";

export interface StaffVideoGroup {
  staffName:  string;
  videoIds:   string[];
  videoCount: number;
  videos:     Array<{
    videoId:     string;
    title:       string;
    status:      string;
    publishedAt: string;
  }>;
}

export function groupVideosByStaff(rows: StaffSheetRow[]): StaffVideoGroup[] {
  const map = new Map<string, StaffVideoGroup>();

  for (const row of rows) {
    for (const name of row.staffNames) {
      if (!map.has(name)) {
        map.set(name, { staffName: name, videoIds: [], videoCount: 0, videos: [] });
      }
      const group = map.get(name)!;
      if (!group.videoIds.includes(row.videoId)) {
        group.videoIds.push(row.videoId);
        group.videos.push({
          videoId: row.videoId, title: row.title,
          status: row.status, publishedAt: row.publishedAt,
        });
      }
    }
  }

  // Collect unassigned videos
  const unassigned: StaffVideoGroup = {
    staffName: "— Chưa phân công", videoIds: [], videoCount: 0, videos: [],
  };
  for (const row of rows) {
    if (row.staffNames.length === 0) {
      unassigned.videoIds.push(row.videoId);
      unassigned.videos.push({
        videoId: row.videoId, title: row.title,
        status: row.status, publishedAt: row.publishedAt,
      });
    }
  }

  const result = [...map.values()]
    .map(g => ({ ...g, videoCount: g.videoIds.length }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));

  if (unassigned.videoIds.length > 0) {
    result.push({ ...unassigned, videoCount: unassigned.videoIds.length });
  }

  return result;
}

export function formatVideoIdList(videoIds: string[]): string {
  return videoIds.join("\n");
}
```

---

## 4. Component Structure
```
src/components/features/
└── StaffFilter.tsx     # Main component — the full feature UI
```

---

## 5. UI Design

### Step 1 — Upload zone (empty state)
```
┌────────────────────────────────────────────────────────────────┐
│              ↑  Upload file Excel                              │
│  File .xlsx hoặc .csv từ Google Sheet                          │
│  Cần có cột: Video ID  +  Tên Người Làm                        │
└────────────────────────────────────────────────────────────────┘
```

### Step 2 — Loaded state
```
Lọc Video ID           [↺ Đổi file]
4 nhân sự  ·  127 video  ·  12 không có ID

[🔍 Tìm kiếm nhân sự...]   [Chọn tất cả]   [↓ Export Excel]

☑  CT Minh Anh   32 videos   [Copy IDs]  [Xem]  ▼
☑  CT Tuyên      28 videos   [Copy IDs]  [Xem]  ▼
☑  ED Hoàng      45 videos   [Copy IDs]  [Xem]  ▼
☑  ED Tuân 95    22 videos   [Copy IDs]  [Xem]  ▼

[↓ Export Excel — 4 nhân sự đã chọn]
```

### Expanded row
```
☑  CT Minh Anh   32 videos   [Copy IDs]  [Xem]  ▲
   ┌──────────────────────────────────────────────┐
   │ GI1b9_k-tN4  TOP 12 DEADLIEST...  Đã Đăng   │
   │ XI0hV24RLEQ  20 Los Autos...      Đã Đăng   │
   └──────────────────────────────────────────────┘
   [Copy tất cả IDs — 32 dòng]
```

### Copy behaviour

[Copy IDs] copies newline-separated IDs to clipboard.
Button shows "✓ Đã copy" for 1.5s as feedback.

---

## 6. Component Implementation Skeleton
```typescript
// src/components/features/StaffFilter.tsx

import { useRef, useState, useMemo } from "react";
import { parseStaffSheet } from "@/lib/parsers/staff-sheet";
import { groupVideosByStaff, formatVideoIdList } from "@/lib/services/staff-video-filter";
import * as XLSX from "xlsx";
import type { StaffVideoGroup } from "@/lib/services/staff-video-filter";
import type { StaffSheetParseSuccess } from "@/lib/parsers/staff-sheet";

export default function StaffFilter() {
  const [parseResult, setParseResult] = useState<StaffSheetParseSuccess | null>(null);
  const [groups,      setGroups]      = useState<StaffVideoGroup[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedName,  setCopiedName]  = useState<string | null>(null);
  const [parseError,  setParseError]  = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseStaffSheet(ev.target!.result as ArrayBuffer);
      if (!result.success) { setParseError(result.error); return; }
      const grouped = groupVideosByStaff(result.rows);
      setParseResult(result);
      setGroups(grouped);
      setSelected(new Set(grouped.map(g => g.staffName)));
      setExpanded(new Set());
      setSearchQuery("");
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g => g.staffName.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const toggleSelect  = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const copyIds = async (group: StaffVideoGroup) => {
    await navigator.clipboard.writeText(formatVideoIdList(group.videoIds));
    setCopiedName(group.staffName);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const toggleExpand = (name: string) => {
    const next = new Set(expanded);
    next.has(name) ? next.delete(name) : next.add(name);
    setExpanded(next);
  };

  const exportExcel = () => {
    const sel = groups.filter(g => selected.has(g.staffName));
    const wb  = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([
      ["Tên nhân sự", "Số video", "Video IDs (paste vào yt-tracker)"],
      ...sel.map(g => [g.staffName, g.videoCount, g.videoIds.join("\n")]),
    ]);
    ws1["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Staff → Video IDs");

    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Tên nhân sự", "Video ID", "Tiêu đề", "Trạng thái", "Ngày đăng"],
      ...sel.flatMap(g => g.videos.map(v =>
        [g.staffName, v.videoId, v.title, v.status, v.publishedAt]
      )),
    ]);
    ws2["!cols"] = [{ wch: 25 }, { wch: 14 }, { wch: 60 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết");

    XLSX.writeFile(wb, "staff-video-ids.xlsx");
  };
}
```

---

## 7. Export File Format

**Sheet 1 — "Staff → Video IDs":** One row per staff, IDs newline-separated in one cell (paste-ready).

**Sheet 2 — "Chi tiết":** One row per (staff × video) — filterable in Excel.

---

## 8. Edge Cases

| Case | Behaviour |
|---|---|
| Video ID cell empty | Row skipped, counted in `skipped` |
| Video ID invalid format | Row skipped |
| Staff cell empty | Video goes to "Chưa phân công" group |
| Same video ID twice | Deduplicated within each group |
| No Video ID column | Parse fails with clear error |
| No Tên Người Làm column | Parse fails with clear error |

---

## 9. Navigation Integration
```typescript
type Tab = "salary" | "transcript" | "match" | "filter";  // "filter" is NEW
// Tab label: 🔍 Lọc Video ID
```

Tab is always accessible — no dependency on other modules.

---

## 10. Unit Tests
```typescript
describe("parseStaffCell", () => {
  it("splits newline-separated names")
  it("splits comma-separated names")
  it("returns [] for empty/null input")
  it("preserves role prefixes: 'CT Minh Anh' stays 'CT Minh Anh'")
})

describe("parseStaffSheet", () => {
  it("finds header in row 2 when row 1 is empty")
  it("returns failure when Video ID column not found")
  it("returns failure when Tên Người Làm column not found")
  it("skips rows with empty or invalid Video IDs")
  it("collects all unique staff names into allStaff[]")
})

describe("groupVideosByStaff", () => {
  it("one video with 2 staff → appears in both groups")
  it("deduplicates video ID within a group")
  it("video with no staff → goes to Chưa phân công group")
  it("groups sorted alphabetically")
})

describe("formatVideoIdList", () => {
  it("joins IDs with newlines, no trailing newline")
  it("returns empty string for empty array")
})
```

---

## 11. Development Checklist
```
Phase A — Parser
 [ ] parseStaffCell() — handles \n, comma, semicolon
 [ ] detectHeaderRow() — scans rows 0–4, alias matching
 [ ] parseStaffSheet() — all edge cases + unit tests

Phase B — Service
 [ ] groupVideosByStaff() — multi-staff, dedup, unassigned group
 [ ] formatVideoIdList()

Phase C — UI
 [ ] Upload zone
 [ ] Summary bar (N nhân sự · N video · N không có ID)
 [ ] Staff rows — checkbox, count, Copy IDs, expand
 [ ] Expanded video detail table
 [ ] Search by staff name
 [ ] Select all / deselect all
 [ ] Copy with ✓ feedback (1.5s)

Phase D — Export
 [ ] Sheet 1 summary + Sheet 2 detail
 [ ] Export only selected staff

Phase E — Integration
 [ ] Add 🔍 Lọc Video ID tab to App.tsx
```
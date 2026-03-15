import * as XLSX from "xlsx";
import type { StaffAttribution, ExportConfig, ExportOptionalColumn } from "@/types";
import { OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";

export function exportToExcel(
  results: StaffAttribution[],
  exportConfig: ExportConfig,
  filename = "views-attribution.xlsx"
): void {
  const wb = XLSX.utils.book_new();
  const optCols = exportConfig.selectedOptional;

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summaryData = [
    ["Tên nhân sự", "Vai trò", "Số video", "Tổng views nhận được"],
    ...results.map((r) => [
      r.staffName,
      r.role === "EDITOR" ? "Editor" : "Content",
      r.videos.length,
      r.totalViewsEarned,
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  // Style header row
  wsSummary["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Detail ───────────────────────────────────────────────────────
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
    ...optCols.map((col: ExportOptionalColumn) => OPTIONAL_COLUMN_LABELS[col]),
  ];

  const detailRows = results.flatMap((r) =>
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

      const optional = optCols.map((col: ExportOptionalColumn) => {
        const val = v[col as keyof typeof v];
        return val !== undefined ? val : "";
      });

      return [...mandatory, ...optional];
    })
  );

  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  wsDetail["!cols"] = [
    { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 50 },
    { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 18 }, { wch: 40 },
    ...optCols.map(() => ({ wch: 22 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detail");

  XLSX.writeFile(wb, filename);
}

import * as XLSX from "xlsx";
import type { StaffAttribution, ExportConfig, ExportOptionalColumn } from "@/types";
import { OPTIONAL_COLUMN_LABELS } from "@/lib/parsers/youtube-export";
import { GROUPS } from "@/config/groups";

function getRoleLabel(role: string): string {
  return GROUPS.find((g) => g.key === role)?.label ?? role;
}

export function exportToExcel(
  allResults:   StaffAttribution[],
  exportConfig: ExportConfig,
  filename?:    string
): void {
  const { selectedOptional: optCols, staffFilter } = exportConfig;

  // Apply staff filter
  const results = staffFilter === "all"
    ? allResults
    : allResults.filter((r) => r.staffId === staffFilter);

  const exportName = filename
    ?? (staffFilter === "all"
        ? "views-attribution.xlsx"
        : `views-${results[0]?.staffName ?? "staff"}.xlsx`);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const summaryData = [
    ["Tên nhân sự", "Vai trò", "Số video", "Tổng views nhận được"],
    ...results.map((r) => [
      r.staffName,
      getRoleLabel(r.role),
      r.videos.length,
      r.totalViewsEarned,
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Detail ────────────────────────────────────────────────────────
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
        getRoleLabel(r.role),
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
    { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 50 },
    { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 18 }, { wch: 40 },
    ...optCols.map(() => ({ wch: 22 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detail");

  XLSX.writeFile(wb, exportName);
}

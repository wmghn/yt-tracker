import * as XLSX from "xlsx";
import type { StaffPeriodMetrics, StaffTrend, StaffRank } from "@/lib/services/analytics";
import { periodLabel } from "@/lib/services/analytics";

export function exportAnalyticsReport(
  allMetrics: StaffPeriodMetrics[],
  trends:     StaffTrend[],
  rankings:   StaffRank[],
  filename =  "staff-analytics-report.xlsx"
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Xu hướng (one row per staff, period columns dynamic) ──────────
  const periods = [...new Set(allMetrics.map(m => m.period))].sort();
  const staffKeys = [...new Set(allMetrics.map(m => `${m.staffName}::${m.role}`))];

  const trendHeaders = [
    "Tên nhân sự", "Vai trò", "Score xu hướng", "Nhận định",
    "Tháng tốt nhất", "Tháng kém nhất",
    ...periods.map(p => periodLabel(p)),
  ];

  const trendRows = staffKeys.map(key => {
    const [staffName, role] = key.split("::");
    const trend = trends.find(t => t.staffName === staffName && t.role === role);
    const trendLabelMap: Record<string, string> = {
      rising_strong:     "Tăng mạnh",
      rising:            "Tăng",
      stable:            "Ổn định",
      declining:         "Giảm",
      declining_severe:  "Giảm mạnh",
      insufficient_data: "Chưa đủ data",
    };
    const base = [
      staffName,
      role,
      trend ? trend.score.toFixed(2) : "",
      trend ? (trendLabelMap[trend.label] ?? trend.label) : "",
      trend ? trend.bestPeriod : "",
      trend ? trend.worstPeriod : "",
    ];
    const periodViews = periods.map(p => {
      const m = allMetrics.find(m => m.staffName === staffName && m.role === role && m.period === p);
      return m ? m.weightedViews : "";
    });
    return [...base, ...periodViews];
  });

  const wsTrend = XLSX.utils.aoa_to_sheet([trendHeaders, ...trendRows]);
  wsTrend["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ...periods.map(() => ({ wch: 16 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsTrend, "Xu hướng");

  // ── Sheet 2: Chi tiết theo tháng ──────────────────────────────────────────
  const detailHeaders = [
    "Tên nhân sự", "Vai trò", "Tháng", "Nhãn tháng",
    "Số video", "Views tính",
    "Avg views/video", "Tổng watch time (h)", "Avg watch time/video (h)",
    "CTR TB (%)", "Doanh thu ($)", "Revenue/video ($)",
    "Viral", "Underperform",
  ];
  const detailRows = allMetrics.map(m => [
    m.staffName,
    m.role,
    m.period,
    m.label,
    m.videoCount,
    m.weightedViews,
    Math.round(m.avgViewsPerVideo),
    m.totalWatchTime.toFixed(2),
    m.avgWatchTimeRatio.toFixed(2),
    m.avgCtr.toFixed(2),
    m.totalRevenue.toFixed(2),
    m.revenuePerVideo.toFixed(2),
    m.viralCount,
    m.underCount,
  ]);
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  wsDetail["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 18 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 20 },
    { wch: 10 }, { wch: 14 }, { wch: 16 },
    { wch: 8  }, { wch: 14  },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Chi tiết theo tháng");

  // ── Sheet 3: Xếp hạng ─────────────────────────────────────────────────────
  const rankHeaders = ["Vai trò", "Tên nhân sự", "Hạng", "Views tính", "Percentile"];
  const rankRows = [...rankings]
    .sort((a, b) => a.role.localeCompare(b.role) || a.rank - b.rank)
    .map(r => [r.role, r.staffName, r.rank, r.weightedViews, r.percentile]);
  const wsRank = XLSX.utils.aoa_to_sheet([rankHeaders, ...rankRows]);
  wsRank["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsRank, "Xếp hạng");

  // ── Sheet 4: Chất lượng ───────────────────────────────────────────────────
  const qualityHeaders = [
    "Tên nhân sự", "Vai trò", "Tháng",
    "CTR TB (%)", "Watch time TB (h)", "Doanh thu ($)",
    "Viral", "Underperform", "Tổng video",
    "% Viral", "% Underperform",
  ];
  const qualityRows = allMetrics.map(m => [
    m.staffName,
    m.role,
    m.period,
    m.avgCtr.toFixed(2),
    m.avgWatchTimeRatio.toFixed(2),
    m.totalRevenue.toFixed(2),
    m.viralCount,
    m.underCount,
    m.videoCount,
    m.videoCount > 0 ? ((m.viralCount / m.videoCount) * 100).toFixed(1) : "0",
    m.videoCount > 0 ? ((m.underCount / m.videoCount) * 100).toFixed(1) : "0",
  ]);
  const wsQuality = XLSX.utils.aoa_to_sheet([qualityHeaders, ...qualityRows]);
  wsQuality["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }, { wch: 14 },
    { wch: 8  }, { wch: 14  }, { wch: 12 },
    { wch: 10 }, { wch: 16  },
  ];
  XLSX.utils.book_append_sheet(wb, wsQuality, "Chất lượng");

  XLSX.writeFile(wb, filename);
}

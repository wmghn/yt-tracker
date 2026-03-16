import type { VideoRow, StaffMember } from "@/types";

export interface StaffPeriodMetrics {
  staffName:         string;
  role:              string;
  period:            string;
  label:             string;
  videoCount:        number;
  weightedViews:     number;
  avgViewsPerVideo:  number;
  totalWatchTime:    number;
  avgWatchTimeRatio: number;
  avgCtr:            number;
  totalRevenue:      number;
  revenuePerVideo:   number;
  totalSubscribers:  number;
  viralCount:        number;
  underCount:        number;
}

export type TrendLabel =
  | "rising_strong" | "rising" | "stable"
  | "declining" | "declining_severe" | "insufficient_data";

export interface StaffTrend {
  staffName:   string;
  role:        string;
  score:       number;
  label:       TrendLabel;
  periods:     Array<{ period: string; label: string; weightedViews: number }>;
  bestPeriod:  string;
  worstPeriod: string;
}

export interface StaffRank {
  staffName:     string;
  role:          string;
  weightedViews: number;
  rank:          number;
  percentile:    number;
}

export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  return `Tháng ${parseInt(month)}/${year}`;
}

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

/** Distinct sorted periods (newest first) found in the video list */
export function getDistinctPeriods(videos: VideoRow[]): string[] {
  const set = new Set<string>();
  for (const v of videos) {
    if (v.publishedMonth) set.add(v.publishedMonth);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export function channelAvgViews(videos: VideoRow[]): number {
  if (!videos.length) return 0;
  return videos.reduce((s, v) => s + v.views, 0) / videos.length;
}

/**
 * Group videos by publishedMonth and compute per-staff metrics for each period.
 * Videos without publishedMonth are ignored.
 */
export function computeAllPeriodMetrics(
  videos:    VideoRow[],
  staffList: StaffMember[],
  weights:   Record<string, number>,
): StaffPeriodMetrics[] {
  const videoIndex = new Map<string, VideoRow>(videos.map(v => [v.youtubeId, v]));
  const channelAvg = channelAvgViews(videos);

  // Build per-video role contributor counts (across all periods)
  const groupCount = new Map<string, Record<string, number>>();
  for (const staff of staffList) {
    for (const vid of staff.videoIds) {
      if (!videoIndex.has(vid)) continue;
      const counts = groupCount.get(vid) ?? {};
      counts[staff.role] = (counts[staff.role] ?? 0) + 1;
      groupCount.set(vid, counts);
    }
  }

  // Group video IDs by publishedMonth
  const periodVideos = new Map<string, Set<string>>();
  for (const v of videos) {
    if (!v.publishedMonth) continue;
    if (!periodVideos.has(v.publishedMonth)) periodVideos.set(v.publishedMonth, new Set());
    periodVideos.get(v.publishedMonth)!.add(v.youtubeId);
  }

  const result: StaffPeriodMetrics[] = [];

  for (const [period, periodVideoIds] of periodVideos) {
    for (const staff of staffList) {
      const staffPeriodVids = staff.videoIds.filter(id => periodVideoIds.has(id));
      if (staffPeriodVids.length === 0) continue;

      const weight = (weights[staff.role] ?? 0) / 100;
      let weightedViews     = 0;
      let totalWatchTime    = 0;
      let watchRatioSum     = 0;
      let watchRatioCount   = 0;
      let totalCtr          = 0;
      let ctrCount          = 0;
      let totalRevenue      = 0;
      let totalSubscribers  = 0;
      let viralCount        = 0;
      let underCount        = 0;

      for (const vid of staffPeriodVids) {
        const v = videoIndex.get(vid)!;
        const members = groupCount.get(vid)?.[staff.role] ?? 1;
        const pool    = Math.round(v.views * weight);
        const earned  = Math.round(pool / members);
        weightedViews += earned;

        if (v.watchTime !== undefined) {
          totalWatchTime += v.watchTime;
          if (v.duration && v.duration > 0 && v.views > 0) {
            const durationHours = v.duration / 3600;
            const ratio = v.watchTime / (v.views * durationHours);
            watchRatioSum += Math.min(ratio, 1);
            watchRatioCount++;
          }
        }

        if (v.ctr !== undefined) { totalCtr += v.ctr; ctrCount++; }
        // Revenue is proportional: same ratio as views (role weight / members in role)
        if (v.revenue     !== undefined) totalRevenue     += v.revenue * weight / members;
        if (v.subscribers !== undefined) totalSubscribers += v.subscribers;

        if (channelAvg > 0) {
          if (v.views >= channelAvg * 2) viralCount++;
          else if (v.views < channelAvg * 0.5) underCount++;
        }
      }

      const videoCount = staffPeriodVids.length;
      result.push({
        staffName:         staff.name,
        role:              staff.role,
        period,
        label:             periodLabel(period),
        videoCount,
        weightedViews,
        avgViewsPerVideo:  videoCount ? Math.round(weightedViews / videoCount) : 0,
        totalWatchTime:    Math.round(totalWatchTime * 10) / 10,
        avgWatchTimeRatio: watchRatioCount ? Math.round((watchRatioSum / watchRatioCount) * 100) / 100 : 0,
        avgCtr:            ctrCount ? Math.round((totalCtr / ctrCount) * 100) / 100 : 0,
        totalRevenue:      Math.round(totalRevenue * 100) / 100,
        revenuePerVideo:   videoCount ? Math.round((totalRevenue / videoCount) * 100) / 100 : 0,
        totalSubscribers,
        viralCount,
        underCount,
      });
    }
  }

  return result.sort((a, b) => b.period.localeCompare(a.period) || b.weightedViews - a.weightedViews);
}

export function computeTrends(allMetrics: StaffPeriodMetrics[]): StaffTrend[] {
  const groups = new Map<string, StaffPeriodMetrics[]>();
  for (const m of allMetrics) {
    const key = `${m.staffName}::${m.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const trends: StaffTrend[] = [];

  for (const [key, metrics] of groups) {
    const [staffName, role] = key.split("::");
    const sorted = [...metrics].sort((a, b) => a.period.localeCompare(b.period));
    const periods = sorted.map(m => ({ period: m.period, label: m.label, weightedViews: m.weightedViews }));

    if (sorted.length < 2) {
      const best = sorted[0]?.label ?? "";
      trends.push({ staffName, role, score: 1, label: "insufficient_data", periods, bestPeriod: best, worstPeriod: best });
      continue;
    }

    const half      = Math.floor(sorted.length / 2);
    const prevAvg   = avg(sorted.slice(0, half).map(m => m.weightedViews));
    const recentAvg = avg(sorted.slice(sorted.length - half).map(m => m.weightedViews));
    const score     = prevAvg > 0 ? recentAvg / prevAvg : 1;
    const best      = sorted.reduce((a, b) => a.weightedViews > b.weightedViews ? a : b);
    const worst     = sorted.reduce((a, b) => a.weightedViews < b.weightedViews ? a : b);

    trends.push({
      staffName, role,
      score:       Math.round(score * 100) / 100,
      label:       trendLabel(score),
      periods,
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

export function computeRankings(metrics: StaffPeriodMetrics[], period: string): StaffRank[] {
  const byRole = new Map<string, StaffPeriodMetrics[]>();
  for (const m of metrics.filter(m => m.period === period)) {
    if (!byRole.has(m.role)) byRole.set(m.role, []);
    byRole.get(m.role)!.push(m);
  }

  const result: StaffRank[] = [];
  for (const [role, members] of byRole) {
    const sorted = [...members].sort((a, b) => b.weightedViews - a.weightedViews);
    const n = sorted.length;
    sorted.forEach((m, idx) => {
      result.push({
        staffName:     m.staffName,
        role,
        weightedViews: m.weightedViews,
        rank:          idx + 1,
        percentile:    n === 1 ? 100 : Math.round(((n - idx - 1) / (n - 1)) * 100),
      });
    });
  }
  return result;
}

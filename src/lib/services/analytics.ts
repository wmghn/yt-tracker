import type { VideoRow, StaffMember, MonthSession } from "@/types";

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

/**
 * Try to parse a YYYY-MM period string from a human-readable session name.
 * Handles: "Tháng 2/2026", "T2/2026", "2/2026", "2026-02"
 */
export function parsePeriodFromName(name: string): string {
  const m1 = name.match(/(?:tháng\s*|t)(\d{1,2})[\/\-](\d{4})/i);
  if (m1) {
    const mo = parseInt(m1[1]), yr = parseInt(m1[2]);
    if (mo >= 1 && mo <= 12 && yr >= 2000) return `${yr}-${String(mo).padStart(2, "0")}`;
  }
  const m2 = name.match(/(\d{1,2})[\/\-](\d{4})/);
  if (m2) {
    const mo = parseInt(m2[1]), yr = parseInt(m2[2]);
    if (mo >= 1 && mo <= 12 && yr >= 2000) return `${yr}-${String(mo).padStart(2, "0")}`;
  }
  const m3 = name.match(/(\d{4})[\/\-](\d{2})/);
  if (m3) return `${m3[1]}-${m3[2]}`;
  return "";
}

/**
 * Compute StaffPeriodMetrics for one session, treating the whole session as a
 * single data point. Does NOT use publishedMonth at all — sums all videos the
 * staff member is assigned to in that session.
 *
 * @param sortKey  A unique, chronologically-sortable string used as the internal
 *                 period key (e.g. zero-padded index "000002"). Alphabetical sort
 *                 of sortKeys gives correct chronological order on the chart.
 */
function computeSingleSessionMetrics(session: MonthSession, sortKey: string): StaffPeriodMetrics[] {
  const { videos, staffList, weights, name } = session;
  const period = sortKey; // internal key — NOT the YYYY-MM period
  const videoIndex = new Map<string, VideoRow>(videos.map(v => [v.youtubeId, v]));
  const channelAvg = videos.length > 0 ? videos.reduce((s, v) => s + v.views, 0) / videos.length : 0;

  // Per-video: count members per role
  const groupCount = new Map<string, Record<string, number>>();
  for (const staff of staffList) {
    for (const vid of staff.videoIds) {
      if (!videoIndex.has(vid)) continue;
      const counts = groupCount.get(vid) ?? {};
      counts[staff.role] = (counts[staff.role] ?? 0) + 1;
      groupCount.set(vid, counts);
    }
  }

  const result: StaffPeriodMetrics[] = [];

  for (const staff of staffList) {
    const staffVids = staff.videoIds.filter(id => videoIndex.has(id));
    if (staffVids.length === 0) continue;

    const weight = (weights[staff.role] ?? 0) / 100;
    let weightedViews = 0, totalWatchTime = 0, watchRatioSum = 0, watchRatioCount = 0;
    let totalCtr = 0, ctrCount = 0, totalRevenue = 0, totalSubscribers = 0;
    let viralCount = 0, underCount = 0;

    for (const vid of staffVids) {
      const v = videoIndex.get(vid)!;
      const members = groupCount.get(vid)?.[staff.role] ?? 1;
      const earned  = Math.round(v.views * weight / members);
      weightedViews += earned;

      if (v.watchTime !== undefined) {
        totalWatchTime += v.watchTime;
        if (v.duration && v.duration > 0 && v.views > 0) {
          const ratio = v.watchTime / (v.views * (v.duration / 3600));
          watchRatioSum += Math.min(ratio, 1);
          watchRatioCount++;
        }
      }
      if (v.ctr !== undefined) { totalCtr += v.ctr; ctrCount++; }
      if (v.revenue     !== undefined) totalRevenue     += v.revenue * weight / members;
      if (v.subscribers !== undefined) totalSubscribers += v.subscribers;

      if (channelAvg > 0) {
        if (v.views >= channelAvg * 2) viralCount++;
        else if (v.views < channelAvg * 0.5) underCount++;
      }
    }

    const videoCount = staffVids.length;
    result.push({
      staffName:         staff.name,
      role:              staff.role,
      period,
      label:             name,   // ← session name, not derived from period
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

  return result.sort((a, b) => b.weightedViews - a.weightedViews);
}

/**
 * Compute metrics from a list of saved sessions.
 * Each session = exactly one X-axis data point.
 * Sessions must be passed sorted oldest→newest (ascending displayOrder).
 * Uses a zero-padded index as the internal period key to guarantee uniqueness
 * and correct chronological ordering on the chart.
 */
export function computeMetricsFromSessions(sessions: MonthSession[]): StaffPeriodMetrics[] {
  return sessions.flatMap((s, i) => {
    // sortKey: zero-padded index → alphabetical sort = chronological order
    const sortKey = String(i).padStart(6, "0");
    return computeSingleSessionMetrics(s, sortKey);
  });
}

/** Count of distinct sessions — used to gate Analytics tab (needs ≥ 1). */
export function getDistinctPeriodsFromSessions(sessions: MonthSession[]): string[] {
  // Return one entry per session (by id) so the count equals session count,
  // not the number of unique YYYY-MM periods (which can collide).
  return sessions.map(s => s.id);
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

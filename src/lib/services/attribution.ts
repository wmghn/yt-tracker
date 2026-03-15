import type {
  VideoRow, StaffMember,
  StaffAttribution, VideoBreakdown, StaffRole,
} from "@/types";

export function computeAttribution(
  videos:    VideoRow[],
  staffList: StaffMember[],
  weights:   Record<string, number>   // { "EDITOR": 60, "CONTENT": 40 } — percentage integers
): StaffAttribution[] {
  const videoIndex = new Map<string, VideoRow>(videos.map((v) => [v.youtubeId, v]));

  const groupCountByVideo   = new Map<string, Record<string, number>>();
  const contributorsByVideo = new Map<string, string[]>();

  for (const staff of staffList) {
    for (const vid of staff.videoIds) {
      if (!videoIndex.has(vid)) continue;
      const counts = groupCountByVideo.get(vid) ?? {};
      counts[staff.role] = (counts[staff.role] ?? 0) + 1;
      groupCountByVideo.set(vid, counts);
      const names = contributorsByVideo.get(vid) ?? [];
      if (!names.includes(staff.name)) names.push(staff.name);
      contributorsByVideo.set(vid, names);
    }
  }

  return staffList
    .map((staff) => {
      const weightPct = weights[staff.role] ?? 0;
      const weight    = weightPct / 100;

      const breakdowns: VideoBreakdown[] = staff.videoIds
        .filter((vid) => videoIndex.has(vid))
        .map((vid) => {
          const video          = videoIndex.get(vid)!;
          const groupPool      = Math.round(video.views * weight);
          const membersInGroup = groupCountByVideo.get(vid)?.[staff.role] ?? 1;
          const viewsEarned    = Math.round(groupPool / membersInGroup);

          const bd: VideoBreakdown = {
            youtubeId:      video.youtubeId,
            title:          video.title,
            totalViews:     video.views,
            groupWeight:    weight,
            groupPool,
            membersInGroup,
            viewsEarned,
            contributors:   contributorsByVideo.get(vid) ?? [staff.name],
          };

          if (video.duration    !== undefined) bd.duration    = video.duration;
          if (video.watchTime   !== undefined) bd.watchTime   = video.watchTime;
          if (video.subscribers !== undefined) bd.subscribers = video.subscribers;
          if (video.revenue     !== undefined) bd.revenue     = video.revenue;

          return bd;
        })
        .sort((a, b) => b.viewsEarned - a.viewsEarned);

      return {
        staffId:          staff.id,
        staffName:        staff.name,
        role:             staff.role as StaffRole,
        videos:           breakdowns,
        totalViewsEarned: breakdowns.reduce((s, v) => s + v.viewsEarned, 0),
      };
    })
    .sort((a, b) => b.totalViewsEarned - a.totalViewsEarned);
}

export function formatFormula(v: VideoBreakdown, groupLabel: string): string {
  const pct    = Math.round(v.groupWeight * 100);
  const plural = v.membersInGroup > 1
    ? `${v.membersInGroup} ${groupLabel.toLowerCase()}s`
    : `1 ${groupLabel.toLowerCase()}`;

  return [
    v.totalViews.toLocaleString("vi-VN"),
    `× ${pct}%`,
    `= ${v.groupPool.toLocaleString("vi-VN")}`,
    `÷ ${plural}`,
    `= ${v.viewsEarned.toLocaleString("vi-VN")} views`,
  ].join("  →  ");
}

import type {
  VideoRow,
  GroupConfig,
  StaffMember,
  StaffAttribution,
  VideoBreakdown,
  StaffRole,
} from "@/types";

export function computeAttribution(
  videos: VideoRow[],
  config: GroupConfig,
  staffList: StaffMember[]
): StaffAttribution[] {
  const videoIndex = new Map<string, VideoRow>(videos.map((v) => [v.youtubeId, v]));

  const groupWeight: Record<string, number> = {
    EDITOR: config.editorWeight / 100,
    CONTENT: config.contentWeight / 100,
  };

  // Count per-role contributors for each video
  const groupCountByVideo = new Map<string, Record<string, number>>();
  const contributorsByVideo = new Map<string, string[]>();

  for (const staff of staffList) {
    for (const vid of staff.videoIds) {
      if (!videoIndex.has(vid)) continue;
      const counts = groupCountByVideo.get(vid) ?? { EDITOR: 0, CONTENT: 0 };
      counts[staff.role] += 1;
      groupCountByVideo.set(vid, counts);
      const names = contributorsByVideo.get(vid) ?? [];
      if (!names.includes(staff.name)) names.push(staff.name);
      contributorsByVideo.set(vid, names);
    }
  }

  return staffList
    .map((staff) => {
      const breakdowns: VideoBreakdown[] = staff.videoIds
        .filter((vid) => videoIndex.has(vid))
        .map((vid) => {
          const video = videoIndex.get(vid)!;
          const weight = groupWeight[staff.role];
          const groupPool = Math.round(video.views * weight);
          const membersInGroup = groupCountByVideo.get(vid)?.[staff.role] ?? 1;
          const viewsEarned = Math.round(groupPool / membersInGroup);

          const breakdown: VideoBreakdown = {
            youtubeId: video.youtubeId,
            title: video.title,
            totalViews: video.views,
            groupWeight: weight,
            groupPool,
            membersInGroup,
            viewsEarned,
            contributors: contributorsByVideo.get(vid) ?? [staff.name],
          };

          if (video.duration !== undefined) breakdown.duration = video.duration;
          if (video.watchTime !== undefined) breakdown.watchTime = video.watchTime;
          if (video.subscribers !== undefined) breakdown.subscribers = video.subscribers;
          if (video.revenue !== undefined) breakdown.revenue = video.revenue;

          return breakdown;
        })
        .sort((a, b) => b.viewsEarned - a.viewsEarned);

      return {
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role as StaffRole,
        videos: breakdowns,
        totalViewsEarned: breakdowns.reduce((s, v) => s + v.viewsEarned, 0),
      };
    })
    .sort((a, b) => b.totalViewsEarned - a.totalViewsEarned);
}

export function formatFormula(v: VideoBreakdown, role: string): string {
  const label = role === "EDITOR" ? "editor" : "content";
  const pct = Math.round(v.groupWeight * 100);
  const plural = v.membersInGroup > 1 ? `${v.membersInGroup} ${label}s` : `1 ${label}`;

  return [
    v.totalViews.toLocaleString("vi-VN"),
    `× ${pct}%`,
    `= ${v.groupPool.toLocaleString("vi-VN")}`,
    `÷ ${plural}`,
    `= ${v.viewsEarned.toLocaleString("vi-VN")} views`,
  ].join("  →  ");
}

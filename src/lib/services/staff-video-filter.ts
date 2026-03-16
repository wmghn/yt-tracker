import type { StaffSheetRow } from "@/lib/parsers/staff-sheet";

export interface VideoDetail {
  videoId:     string;
  title:       string;
  status:      string;
  publishedAt: string;
}

export interface StaffVideoGroup {
  staffName:  string;
  videoIds:   string[];
  videoCount: number;
  videos:     VideoDetail[];
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
          videoId:     row.videoId,
          title:       row.title,
          status:      row.status,
          publishedAt: row.publishedAt,
        });
      }
    }
  }

  const result = [...map.values()]
    .map(g => ({ ...g, videoCount: g.videoIds.length }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "vi"));

  // Collect unassigned videos
  const unassigned: VideoDetail[] = [];
  for (const row of rows) {
    if (row.staffNames.length === 0) {
      unassigned.push({ videoId: row.videoId, title: row.title, status: row.status, publishedAt: row.publishedAt });
    }
  }
  if (unassigned.length > 0) {
    result.push({
      staffName:  "— Chưa phân công",
      videoIds:   unassigned.map(v => v.videoId),
      videoCount: unassigned.length,
      videos:     unassigned,
    });
  }

  return result;
}

export function formatVideoIdList(videoIds: string[]): string {
  return videoIds.join("\n");
}

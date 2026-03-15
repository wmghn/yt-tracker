export interface VideoRow {
  youtubeId: string;
  title: string;
  views: number;
  duration?: number;
  watchTime?: number;
  subscribers?: number;
  revenue?: number;
}

export interface GroupConfig {
  editorWeight: number;
  contentWeight: number;
}

export const DEFAULT_CONFIG: GroupConfig = {
  editorWeight: 60,
  contentWeight: 40,
};

export type StaffRole = "EDITOR" | "CONTENT";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  videoIds: string[];
}

export type OptionalColumnKey = "duration" | "watchTime" | "subscribers" | "revenue";
export type ExportOptionalColumn = OptionalColumnKey;

export interface AppState {
  step: 1 | 2 | 3 | 4;
  videos: VideoRow[];
  detectedOptional: OptionalColumnKey[];
  config: GroupConfig;
  staffList: StaffMember[];
}

export const INITIAL_STATE: AppState = {
  step: 1,
  videos: [],
  detectedOptional: [],
  config: DEFAULT_CONFIG,
  staffList: [],
};

export interface VideoBreakdown {
  youtubeId: string;
  title: string;
  totalViews: number;
  groupWeight: number;
  groupPool: number;
  membersInGroup: number;
  viewsEarned: number;
  contributors: string[];
  duration?: number;
  watchTime?: number;
  subscribers?: number;
  revenue?: number;
}

export interface StaffAttribution {
  staffId: string;
  staffName: string;
  role: StaffRole;
  videos: VideoBreakdown[];
  totalViewsEarned: number;
}

export interface ExportConfig {
  selectedOptional: ExportOptionalColumn[];
}

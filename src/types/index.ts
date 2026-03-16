import type { GroupDefinition } from "@/config/groups";

export type { GroupDefinition };

export interface VideoRow {
  youtubeId:       string;
  title:           string;
  views:           number;
  publishedAt?:    string;
  publishedMonth?: string;
  duration?:       number;
  watchTime?:      number;
  subscribers?:    number;
  revenue?:        number;
  ctr?:            number;
  impressions?:    number;
}

export type StaffRole = string;

export interface StaffMember {
  id:       string;
  name:     string;
  role:     StaffRole;
  videoIds: string[];
}

export type OptionalColumnKey = "publishedAt" | "duration" | "watchTime" | "subscribers" | "revenue" | "ctr" | "impressions";
export type ExportOptionalColumn = OptionalColumnKey;

export interface MonthSession {
  period:    string;
  label:     string;
  videos:    VideoRow[];
  staffList: StaffMember[];
  weights:   Record<string, number>;
  savedAt:   number;
}

// weights: runtime overrides of GROUPS config, { "EDITOR": 60, "CONTENT": 40 }
export interface AppState {
  step:             1 | 2 | 3;
  videos:           VideoRow[];
  detectedOptional: OptionalColumnKey[];
  staffList:        StaffMember[];
  weights:          Record<string, number>;
  history:          MonthSession[];
}

export const INITIAL_STATE: AppState = {
  step:             1,
  videos:           [],
  detectedOptional: [],
  staffList:        [],
  weights:          {},   // populated on upload from GROUPS defaults
  history:          [],
};

export interface VideoBreakdown {
  youtubeId:       string;
  title:           string;
  totalViews:      number;
  groupWeight:     number;
  groupPool:       number;
  membersInGroup:  number;
  viewsEarned:     number;
  contributors:    string[];
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

export interface ExportConfig {
  selectedOptional: ExportOptionalColumn[];
  staffFilter: "all" | string;   // "all" or a staffId
}

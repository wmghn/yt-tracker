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

/** A YouTube channel managed by the user */
export interface Channel {
  id:        string;
  name:      string;
  createdAt: number;
}

/** A saved monthly data snapshot for one channel */
export interface MonthSession {
  id:               string;         // UUID
  channelId:        string;         // which channel this belongs to
  name:             string;         // user-editable label, e.g. "Tháng 3/2026"
  period:           string;         // "2026-03" — derived from data (may be inaccurate for old sessions)
  label:            string;         // "Tháng 3/2026" — derived from period
  videos:           VideoRow[];
  staffList:        StaffMember[];
  weights:          Record<string, number>;
  detectedOptional: OptionalColumnKey[];
  savedAt:          number;
  displayOrder?:    number;         // user-defined sort order (ascending = oldest first on chart); defaults to savedAt
}

// weights: runtime overrides of GROUPS config, { "EDITOR": 60, "CONTENT": 40 }
export interface AppState {
  step:             1 | 2 | 3;
  activeChannelId:  string | null;
  videos:           VideoRow[];
  detectedOptional: OptionalColumnKey[];
  staffList:        StaffMember[];
  weights:          Record<string, number>;
}

export const INITIAL_STATE: AppState = {
  step:             1,
  activeChannelId:  null,
  videos:           [],
  detectedOptional: [],
  staffList:        [],
  weights:          {},   // populated on upload from GROUPS defaults
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

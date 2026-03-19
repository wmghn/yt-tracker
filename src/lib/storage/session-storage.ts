import type { AppState, Channel, MonthSession } from "@/types";
import { periodLabel } from "@/lib/services/analytics";

const KEY_APP      = "yt_tracker_v4";
const KEY_CHANNELS = "yt_tracker_channels_v1";
const KEY_SESSIONS = "yt_tracker_sessions_v2";

// ── App state (current working session) ──────────────────────────────────────

export function saveSession(state: AppState): void {
  try { localStorage.setItem(KEY_APP, JSON.stringify(state)); } catch { /**/ }
}

export function loadSession(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY_APP);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch { return null; }
}

export function clearSession(): void {
  localStorage.removeItem(KEY_APP);
}

// ── Channels ──────────────────────────────────────────────────────────────────

export function saveChannels(channels: Channel[]): void {
  try { localStorage.setItem(KEY_CHANNELS, JSON.stringify(channels)); } catch { /**/ }
}

export function loadChannels(): Channel[] {
  try {
    const raw = localStorage.getItem(KEY_CHANNELS);
    return raw ? (JSON.parse(raw) as Channel[]) : [];
  } catch { return []; }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function saveSessions(sessions: MonthSession[]): void {
  try { localStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions)); } catch { /**/ }
}

export function loadSessions(): MonthSession[] {
  try {
    const raw = localStorage.getItem(KEY_SESSIONS);
    return raw ? (JSON.parse(raw) as MonthSession[]) : [];
  } catch { return []; }
}

/** Returns sessions for a channel sorted by displayOrder ascending (oldest first). */
export function getChannelSessions(sessions: MonthSession[], channelId: string): MonthSession[] {
  return sessions
    .filter(s => s.channelId === channelId)
    .map(s => ({ ...s, displayOrder: s.displayOrder ?? s.savedAt }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function upsertSession(sessions: MonthSession[], next: MonthSession): MonthSession[] {
  const filtered = sessions.filter(s => s.id !== next.id);
  // Assign displayOrder = max existing + 1 for new sessions
  if (next.displayOrder === undefined) {
    const maxOrder = filtered.reduce((m, s) => Math.max(m, s.displayOrder ?? s.savedAt), 0);
    next = { ...next, displayOrder: maxOrder + 1 };
  }
  return [...filtered, next].sort((a, b) => (a.displayOrder ?? a.savedAt) - (b.displayOrder ?? b.savedAt));
}

/** Reorder sessions for a channel by replacing the displayOrder values. */
export function reorderSessions(
  sessions: MonthSession[],
  channelId: string,
  orderedIds: string[],
): MonthSession[] {
  const channelSessions = sessions.filter(s => s.channelId === channelId);
  const others = sessions.filter(s => s.channelId !== channelId);
  const updated = channelSessions.map(s => {
    const idx = orderedIds.indexOf(s.id);
    return { ...s, displayOrder: idx >= 0 ? idx : s.displayOrder ?? s.savedAt };
  });
  return [...others, ...updated].sort((a, b) => (a.displayOrder ?? a.savedAt) - (b.displayOrder ?? b.savedAt));
}

export function deleteSession(sessions: MonthSession[], sessionId: string): MonthSession[] {
  return sessions.filter(s => s.id !== sessionId);
}

// ── Migration from old format ─────────────────────────────────────────────────

interface OldAppState extends AppState {
  history?: Array<{
    period:    string;
    label:     string;
    videos:    MonthSession["videos"];
    staffList: MonthSession["staffList"];
    weights:   MonthSession["weights"];
    savedAt:   number;
  }>;
}

/**
 * Migrate old AppState.history[] into the new sessions store.
 * Creates a "Kênh mặc định" channel if none exists.
 * Returns updated channels + sessions arrays.
 */
export function migrateFromOldState(
  old: OldAppState,
  existingChannels: Channel[],
  existingSessions: MonthSession[],
): { channels: Channel[]; sessions: MonthSession[]; activeChannelId: string } {
  let channels = [...existingChannels];
  let sessions = [...existingSessions];

  // Ensure at least one channel exists
  let defaultChannel = channels[0];
  if (!defaultChannel) {
    defaultChannel = { id: crypto.randomUUID(), name: "Kênh mặc định", createdAt: Date.now() };
    channels = [defaultChannel];
  }

  const channelId = defaultChannel.id;

  // Migrate old history entries
  if (old.history && old.history.length > 0) {
    for (const h of old.history) {
      const alreadyMigrated = sessions.some(s => s.channelId === channelId && s.period === h.period);
      if (alreadyMigrated) continue;

      const label = h.label ?? periodLabel(h.period);
      sessions = upsertSession(sessions, {
        id:               crypto.randomUUID(),
        channelId,
        name:             label,
        period:           h.period,
        label,
        videos:           h.videos,
        staffList:        h.staffList,
        weights:          h.weights,
        detectedOptional: [],
        savedAt:          h.savedAt ?? Date.now(),
      });
    }
  }

  return { channels, sessions, activeChannelId: channelId };
}

import type { AppState, MonthSession } from "@/types";

const KEY = "yt_tracker_v4";
const KEY_HISTORY = "yt_tracker_history_v1";

export function saveSession(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota or private mode — fail silently
  }
}

export function loadSession(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function saveHistory(history: MonthSession[]): void {
  try { localStorage.setItem(KEY_HISTORY, JSON.stringify(history)); } catch { /**/ }
}

export function loadHistory(): MonthSession[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addOrReplaceSession(
  history: MonthSession[], newSession: MonthSession, maxSessions = 12
): MonthSession[] {
  const filtered = history.filter(s => s.period !== newSession.period);
  return [newSession, ...filtered]
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, maxSessions);
}

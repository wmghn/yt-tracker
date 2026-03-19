import { useState, useEffect, useCallback, useMemo } from "react";
import type { AppState, Channel, MonthSession, StaffMember, OptionalColumnKey, VideoRow } from "@/types";
import { INITIAL_STATE } from "@/types";
import { GROUPS } from "@/config/groups";
import {
  saveSession, loadSession, clearSession,
  saveChannels, loadChannels,
  saveSessions, loadSessions,
  getChannelSessions, upsertSession, deleteSession, reorderSessions,
  migrateFromOldState,
} from "@/lib/storage/session-storage";
import { computeAttribution } from "@/lib/services/attribution";
import { derivePeriod, periodLabel, parsePeriodFromName } from "@/lib/services/analytics";

import UploadZone        from "@/components/features/UploadZone";
import StaffPanel        from "@/components/features/StaffPanel";
import ResultsTable      from "@/components/features/ResultsTable";
import SheetMatcher      from "@/components/features/SheetMatcher";
import StaffFilter       from "@/components/features/StaffFilter";
import AnalyticsDashboard from "@/components/features/analytics/AnalyticsDashboard";
import ChannelSelector   from "@/components/features/ChannelSelector";
import SessionsPanel     from "@/components/features/SessionsPanel";

const SALARY_STEPS = [
  { n: 1, label: "Upload file" },
  { n: 2, label: "Nhân sự" },
  { n: 3, label: "Kết quả" },
];

type Tab = "salary" | "match" | "filter";
type SalarySubTab = "calc" | "history" | "analytics";

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g.weight])
);

// ── Save-session modal ────────────────────────────────────────────────────────

function SaveSessionModal({
  defaultName,
  onConfirm,
  onClose,
}: {
  defaultName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-1 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink mb-1">Lưu tháng này</h2>
        <p className="text-sm text-ink-muted mb-4">
          Đặt tên cho dữ liệu tháng này để dễ nhận biết sau.
        </p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
          placeholder="Tên tháng..."
          className="input w-full mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="btn-primary disabled:opacity-40"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,          setTab]          = useState<Tab>("salary");
  const [salarySubTab, setSalarySubTab] = useState<SalarySubTab>("calc");
  const [showSaveModal, setShowSaveModal] = useState(false);

  // ── Channels & sessions (stored separately) ─────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>(() => loadChannels());
  const [sessions, setSessions] = useState<MonthSession[]>(() => loadSessions());

  // ── Working session (current upload / 3-step flow) ───────────────────────────
  const [state, setState] = useState<AppState>(() => {
    const saved = loadSession() as (AppState & { history?: unknown[] }) | null;
    if (!saved) return { ...INITIAL_STATE, weights: DEFAULT_WEIGHTS };

    // Migrate old history if present
    if (saved.history && saved.history.length > 0) {
      const existing = loadSessions();
      const existingChannels = loadChannels();
      const { channels: migratedChannels, sessions: migratedSessions, activeChannelId } =
        migrateFromOldState(saved as Parameters<typeof migrateFromOldState>[0], existingChannels, existing);
      saveChannels(migratedChannels);
      saveSessions(migratedSessions);
      setChannels(migratedChannels);
      setSessions(migratedSessions);
      const withChannel: AppState = {
        ...saved,
        activeChannelId: saved.activeChannelId ?? activeChannelId,
        weights: { ...DEFAULT_WEIGHTS, ...saved.weights },
      };
      delete (withChannel as AppState & { history?: unknown }).history;
      return withChannel;
    }

    return {
      ...saved,
      activeChannelId: saved.activeChannelId ?? null,
      weights: { ...DEFAULT_WEIGHTS, ...saved.weights },
    };
  });

  // Auto-save AppState on change
  useEffect(() => { saveSession(state); }, [state]);
  // Auto-save channels/sessions on change
  useEffect(() => { saveChannels(channels); }, [channels]);
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  // Ensure at least one channel exists on first run
  useEffect(() => {
    if (channels.length === 0) {
      const defaultChannel: Channel = {
        id: crypto.randomUUID(),
        name: "Kênh mặc định",
        createdAt: Date.now(),
      };
      setChannels([defaultChannel]);
      if (!state.activeChannelId) {
        setState(prev => ({ ...prev, activeChannelId: defaultChannel.id }));
      }
    } else if (!state.activeChannelId) {
      setState(prev => ({ ...prev, activeChannelId: channels[0].id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Channel management ───────────────────────────────────────────────────────

  const handleCreateChannel = (name: string) => {
    const channel: Channel = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    setChannels(prev => [...prev, channel]);
    setState(prev => ({ ...prev, activeChannelId: channel.id }));
  };

  const handleRenameChannel = (id: string, name: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  };

  const handleDeleteChannel = (id: string) => {
    setSessions(prev => prev.filter(s => s.channelId !== id));
    setChannels(prev => {
      const next = prev.filter(c => c.id !== id);
      if (state.activeChannelId === id) {
        const fallback = next[0]?.id ?? null;
        setState(p => ({ ...p, activeChannelId: fallback }));
      }
      return next;
    });
  };

  const handleSelectChannel = (id: string) => {
    setState(prev => ({ ...prev, activeChannelId: id }));
  };

  // ── Session management ───────────────────────────────────────────────────────

  const activeChannel = channels.find(c => c.id === state.activeChannelId) ?? null;
  const channelSessions = useMemo(
    () => state.activeChannelId ? getChannelSessions(sessions, state.activeChannelId) : [],
    [sessions, state.activeChannelId],
  );

  const handleSaveSession = (name: string) => {
    if (!state.activeChannelId) return;
    // Parse period from session name first; fall back to derivePeriod; fall back to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const period = parsePeriodFromName(name) || derivePeriod(state.videos) || currentMonth;
    const label  = periodLabel(period);
    // displayOrder = max existing + 1 so new sessions appear newest (rightmost on chart)
    const maxOrder = channelSessions.reduce((m, s) => Math.max(m, s.displayOrder ?? s.savedAt), 0);
    const newSession: MonthSession = {
      id:               crypto.randomUUID(),
      channelId:        state.activeChannelId,
      name,
      period,
      label,
      videos:           state.videos,
      staffList:        state.staffList,
      weights:          state.weights,
      detectedOptional: state.detectedOptional,
      savedAt:          Date.now(),
      displayOrder:     maxOrder + 1,
    };
    setSessions(prev => upsertSession(prev, newSession));
    setShowSaveModal(false);
    setSalarySubTab("history");
  };

  const handleDeleteSession = (id: string) => {
    setSessions(prev => deleteSession(prev, id));
  };

  const handleReorderSessions = (orderedIds: string[]) => {
    if (!state.activeChannelId) return;
    setSessions(prev => reorderSessions(prev, state.activeChannelId!, orderedIds));
  };

  const handleRenameSession = (id: string, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const handleLoadSession = (session: MonthSession) => {
    setState(prev => ({
      ...INITIAL_STATE,
      activeChannelId:  prev.activeChannelId,
      step:             3,
      videos:           session.videos,
      staffList:        session.staffList,
      weights:          session.weights,
      detectedOptional: session.detectedOptional,
    }));
    setSalarySubTab("calc");
  };

  // ── Upload flow ───────────────────────────────────────────────────────────────

  const handleUpload = (videos: VideoRow[], detectedOptional: OptionalColumnKey[]) => {
    clearSession();
    setState(prev => ({
      ...INITIAL_STATE,
      activeChannelId: prev.activeChannelId,
      step: 2,
      videos,
      detectedOptional,
      staffList: [],
      weights: DEFAULT_WEIGHTS,
    }));
  };

  const handleNewSession = () => {
    clearSession();
    setState(prev => ({ ...INITIAL_STATE, activeChannelId: prev.activeChannelId, weights: DEFAULT_WEIGHTS }));
  };

  // ── Analytics ─────────────────────────────────────────────────────────────────

  // Analytics available as soon as 1 session is saved (Trend will warn internally if < 2)
  const analyticsAvailable = channelSessions.length >= 1;

  // ── Results ───────────────────────────────────────────────────────────────────

  const results = state.step === 3
    ? computeAttribution(state.videos, state.staffList, state.weights)
    : [];

  const totalWeight = Object.values(state.weights).reduce((s, v) => s + v, 0);

  // ── Default save-session name ─────────────────────────────────────────────────

  const defaultSaveName = useMemo(() => {
    const p = derivePeriod(state.videos);
    return periodLabel(p);
  }, [state.videos]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-surface-1 border-b border-border px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 11.5L6 4.5L9 9L11.5 6L14 11.5H2Z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className="text-lg font-bold text-ink">Views Tracker</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Channel selector */}
          <ChannelSelector
            channels={channels}
            activeChannelId={state.activeChannelId}
            onSelect={handleSelectChannel}
            onCreate={handleCreateChannel}
            onRename={handleRenameChannel}
            onDelete={handleDeleteChannel}
          />

          {tab === "salary" && salarySubTab === "calc" && (
            <div className="flex items-center gap-2">
              {GROUPS.map((g) => {
                const w = state.weights[g.key] ?? g.weight;
                return (
                  <span key={g.key}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${g.color.bg} ${g.color.text} ${g.color.border}`}>
                    {g.label} {w}%
                  </span>
                );
              })}
              {totalWeight !== 100 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                  Tổng = {totalWeight}% ≠ 100
                </span>
              )}
            </div>
          )}
          {state.step > 1 && tab === "salary" && salarySubTab === "calc" && (
            <button onClick={handleNewSession} className="btn-ghost btn-sm text-ink-tertiary">
              ↺ Session mới
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-surface-1 border-b border-border px-8">
        <div className="flex max-w-7xl mx-auto">
          {/* Tab: Salary */}
          <button
            onClick={() => setTab("salary")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all mr-1 ${
              tab === "salary" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            📊 Tính views
          </button>

          {/* Tab: Match */}
          <button
            onClick={() => setTab("match")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all mr-1 ${
              tab === "match" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            🔍 Tìm My Video ID
          </button>

          {/* Tab: Staff Filter */}
          <button
            onClick={() => setTab("filter")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all mr-1 ${
              tab === "filter" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            🔍 Lọc Video ID
          </button>

          {/* Hướng dẫn link */}
          <a
            href="/huong-dan.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 py-3.5 px-4 text-sm font-semibold border-b-2 border-transparent text-ink-tertiary hover:text-ink transition-all ml-auto"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
            </svg>
            Hướng dẫn
          </a>

          {/* Salary step indicators */}
          {tab === "salary" && salarySubTab === "calc" && (
            <div className="flex items-center gap-1 ml-2 border-l border-border pl-4">
              {SALARY_STEPS.map((s, i) => {
                const active = s.n === state.step;
                const done   = s.n < state.step;
                return (
                  <div key={s.n} className="flex items-center">
                    <button
                      onClick={() => { if (done) patch({ step: s.n as AppState["step"] }); }}
                      disabled={s.n > state.step}
                      className={`flex items-center gap-2 py-3.5 px-2 text-xs font-medium border-b-2 transition-all ${
                        active ? "border-accent text-accent"
                        : done  ? "border-transparent text-ink-tertiary hover:text-ink cursor-pointer"
                        : "border-transparent text-ink-muted cursor-default"
                      }`}>
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        active ? "bg-accent text-white"
                        : done  ? "bg-emerald-100 text-emerald-700"
                        : "bg-surface-2 text-ink-muted border border-border"
                      }`}>
                        {done ? "✓" : s.n}
                      </span>
                      {s.label}
                    </button>
                    {i < SALARY_STEPS.length - 1 && <span className="text-border-strong text-xs px-0.5">›</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-10 animate-in">
        {tab === "match"  && <SheetMatcher />}
        {tab === "filter" && <StaffFilter />}

        {tab === "salary" && (
          <>
            {/* Sub-tab bar */}
            <div className="flex gap-1 mb-8 border-b border-border -mt-4">
              <button
                onClick={() => setSalarySubTab("calc")}
                className={`flex items-center gap-2 py-2.5 px-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                  salarySubTab === "calc" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
                }`}
              >
                📊 Tính views
              </button>

              <button
                onClick={() => setSalarySubTab("history")}
                className={`flex items-center gap-2 py-2.5 px-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                  salarySubTab === "history" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
                }`}
              >
                📋 Lịch sử
                {channelSessions.length > 0 && (
                  <span className="text-xs bg-surface-2 text-ink-muted px-1.5 py-0.5 rounded-full">
                    {channelSessions.length}
                  </span>
                )}
              </button>

              <div className="relative group">
                <button
                  onClick={() => analyticsAvailable && setSalarySubTab("analytics")}
                  className={`flex items-center gap-2 py-2.5 px-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                    salarySubTab === "analytics"
                      ? "border-accent text-accent"
                      : analyticsAvailable
                      ? "border-transparent text-ink-tertiary hover:text-ink"
                      : "border-transparent text-ink-muted cursor-not-allowed"
                  }`}
                >
                  📈 Analytics
                  {channelSessions.length > 0 && (
                    <span className="text-xs bg-surface-2 text-ink-muted px-1.5 py-0.5 rounded-full">
                      {channelSessions.length}T
                    </span>
                  )}
                </button>
                {!analyticsAvailable && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:block z-20 w-60 bg-ink text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
                    Cần ít nhất 1 tháng đã lưu trong tab Lịch sử.
                  </div>
                )}
              </div>
            </div>

            {/* Calc sub-tab */}
            {salarySubTab === "calc" && (
              <>
                {state.step === 1 && (
                  !activeChannel ? (
                    <div className="card p-12 text-center max-w-md mx-auto">
                      <p className="text-3xl mb-3">📺</p>
                      <h3 className="text-lg font-bold text-ink mb-2">Chọn kênh trước</h3>
                      <p className="text-sm text-ink-muted">
                        Tạo hoặc chọn kênh YouTube bằng dropdown ở góc trên bên phải.
                      </p>
                    </div>
                  ) : (
                    <UploadZone onSuccess={handleUpload} />
                  )
                )}
                {state.step === 2 && (
                  <StaffPanel
                    staffList={state.staffList} videos={state.videos} weights={state.weights}
                    onChange={(staffList: StaffMember[]) => patch({ staffList })}
                    onWeightsChange={(weights: Record<string, number>) => patch({ weights })}
                    onNext={() => patch({ step: 3 })}
                    onBack={() => patch({ step: 1 })}
                  />
                )}
                {state.step === 3 && (
                  <ResultsTable
                    results={results}
                    videos={state.videos}
                    weights={state.weights}
                    detectedOptional={state.detectedOptional}
                    onBack={() => patch({ step: 2 })}
                    onNewSession={handleNewSession}
                    onSaveSession={activeChannel ? () => setShowSaveModal(true) : undefined}
                  />
                )}
              </>
            )}

            {/* History sub-tab */}
            {salarySubTab === "history" && activeChannel && (
              <SessionsPanel
                channel={activeChannel}
                sessions={channelSessions}
                onLoad={handleLoadSession}
                onRename={handleRenameSession}
                onDelete={handleDeleteSession}
                onReorder={handleReorderSessions}
                onStartNewUpload={() => {
                  handleNewSession();
                  setSalarySubTab("calc");
                }}
              />
            )}
            {salarySubTab === "history" && !activeChannel && (
              <div className="card p-12 text-center max-w-md mx-auto">
                <p className="text-sm text-ink-muted">Chọn kênh để xem lịch sử.</p>
              </div>
            )}

            {/* Analytics sub-tab */}
            {salarySubTab === "analytics" && (
              <AnalyticsDashboard sessions={channelSessions} />
            )}
          </>
        )}
      </main>

      {/* Save session modal */}
      {showSaveModal && (
        <SaveSessionModal
          defaultName={defaultSaveName}
          onConfirm={handleSaveSession}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

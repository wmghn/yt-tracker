import { useState, useEffect, useCallback } from "react";
import type { AppState, StaffMember, OptionalColumnKey, VideoRow } from "@/types";
import { INITIAL_STATE } from "@/types";
import { GROUPS } from "@/config/groups";
import { saveSession, loadSession, clearSession } from "@/lib/storage/session-storage";
import { computeAttribution } from "@/lib/services/attribution";

import UploadZone            from "@/components/features/UploadZone";
import StaffPanel            from "@/components/features/StaffPanel";
import ResultsTable          from "@/components/features/ResultsTable";
import TranscriptDownloader  from "@/components/features/TranscriptDownloader";
import SheetMatcher           from "@/components/features/SheetMatcher";

const SALARY_STEPS = [
  { n: 1, label: "Upload file" },
  { n: 2, label: "Nhân sự" },
  { n: 3, label: "Kết quả" },
];

type Tab = "salary" | "transcript" | "match";

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g.weight])
);

export default function App() {
  const [tab,   setTab]   = useState<Tab>("salary");
  const [state, setState] = useState<AppState>(() => {
    const saved = loadSession();
    if (saved) return { ...saved, weights: { ...DEFAULT_WEIGHTS, ...saved.weights } };
    return { ...INITIAL_STATE, weights: DEFAULT_WEIGHTS };
  });

  useEffect(() => { saveSession(state); }, [state]);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleUpload = (videos: VideoRow[], detectedOptional: OptionalColumnKey[]) => {
    setState({ ...INITIAL_STATE, step: 2, videos, detectedOptional, staffList: [], weights: DEFAULT_WEIGHTS });
  };

  const handleNewSession = () => { clearSession(); setState({ ...INITIAL_STATE, weights: DEFAULT_WEIGHTS }); };

  const results = state.step === 3
    ? computeAttribution(state.videos, state.staffList, state.weights)
    : [];

  const totalWeight = Object.values(state.weights).reduce((s, v) => s + v, 0);

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

        <div className="flex items-center gap-4">
          {tab === "salary" && (
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
          {state.step > 1 && tab === "salary" && (
            <button onClick={handleNewSession} className="btn-ghost btn-sm text-ink-tertiary">
              ↺ Session mới
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-surface-1 border-b border-border px-8">
        <div className="flex max-w-5xl mx-auto">
          {/* Tab: Salary */}
          <button
            onClick={() => setTab("salary")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all mr-1 ${
              tab === "salary" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            📊 Tính views
          </button>

          {/* Tab: Transcript */}
          {/* <button
            onClick={() => setTab("transcript")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all ${
              tab === "transcript" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            📝 Transcript
          </button> */}

          {/* Tab: Match Sheet */}
          <button
            onClick={() => setTab("match")}
            className={`flex items-center gap-2 py-3.5 px-4 text-sm font-semibold border-b-2 transition-all mr-4 ${
              tab === "match" ? "border-accent text-accent" : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
          >
            🔗 Match Sheet
          </button>

          {/* Salary step indicators (only when on salary tab) */}
          {tab === "salary" && (
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
      <main className="max-w-5xl mx-auto px-6 py-10 animate-in">
        {/* {tab === "transcript" && <TranscriptDownloader />} */}
        {tab === "match" && <SheetMatcher />}

        {tab === "salary" && (
          <>
            {state.step === 1 && <UploadZone onSuccess={handleUpload} />}
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
                results={results} weights={state.weights}
                detectedOptional={state.detectedOptional}
                onBack={() => patch({ step: 2 })}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

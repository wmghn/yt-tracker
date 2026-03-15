import { useState, useEffect, useCallback } from "react";
import type { AppState, StaffMember, OptionalColumnKey, VideoRow } from "@/types";
import { INITIAL_STATE } from "@/types";
import { GROUPS } from "@/config/groups";
import { saveSession, loadSession, clearSession } from "@/lib/storage/session-storage";
import { computeAttribution } from "@/lib/services/attribution";

import UploadZone   from "@/components/features/UploadZone";
import StaffPanel   from "@/components/features/StaffPanel";
import ResultsTable from "@/components/features/ResultsTable";

const STEPS = [
  { n: 1, label: "Upload file" },
  { n: 2, label: "Nhân sự" },
  { n: 3, label: "Kết quả" },
];

// Default weights from config file
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g.weight])
);

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const saved = loadSession();
    // Ensure weights always has all group keys (handles adding new groups after old session)
    if (saved) {
      const merged = { ...DEFAULT_WEIGHTS, ...saved.weights };
      return { ...saved, weights: merged };
    }
    return { ...INITIAL_STATE, weights: DEFAULT_WEIGHTS };
  });

  useEffect(() => { saveSession(state); }, [state]);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleUpload = (videos: VideoRow[], detectedOptional: OptionalColumnKey[]) => {
    setState({
      ...INITIAL_STATE,
      step: 2,
      videos,
      detectedOptional,
      staffList: [],
      weights: DEFAULT_WEIGHTS,
    });
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
          {/* Live weight pills */}
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
          {state.step > 1 && (
            <button onClick={handleNewSession} className="btn-ghost btn-sm text-ink-tertiary">
              ↺ Session mới
            </button>
          )}
        </div>
      </header>

      {/* Step bar */}
      <div className="bg-surface-1 border-b border-border px-8">
        <div className="flex gap-1 max-w-5xl mx-auto">
          {STEPS.map((s, i) => {
            const active = s.n === state.step;
            const done   = s.n < state.step;
            return (
              <div key={s.n} className="flex items-center">
                <button
                  onClick={() => { if (done) patch({ step: s.n as AppState["step"] }); }}
                  disabled={s.n > state.step}
                  className={`flex items-center gap-2.5 py-4 px-3 text-sm font-medium border-b-2 transition-all ${
                    active ? "border-accent text-accent"
                    : done  ? "border-transparent text-ink-tertiary hover:text-ink cursor-pointer"
                    : "border-transparent text-ink-muted cursor-default"
                  }`}>
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold transition-all ${
                    active ? "bg-accent text-white"
                    : done  ? "bg-emerald-100 text-emerald-700"
                    : "bg-surface-2 text-ink-muted border border-border"
                  }`}>
                    {done ? "✓" : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <span className="text-border-strong text-base px-1">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10 animate-in">
        {state.step === 1 && <UploadZone onSuccess={handleUpload} />}
        {state.step === 2 && (
          <StaffPanel
            staffList={state.staffList}
            videos={state.videos}
            weights={state.weights}
            onChange={(staffList: StaffMember[]) => patch({ staffList })}
            onWeightsChange={(weights: Record<string, number>) => patch({ weights })}
            onNext={() => patch({ step: 3 })}
            onBack={() => patch({ step: 1 })}
          />
        )}
        {state.step === 3 && (
          <ResultsTable
            results={results}
            weights={state.weights}
            detectedOptional={state.detectedOptional}
            onBack={() => patch({ step: 2 })}
          />
        )}
      </main>
    </div>
  );
}

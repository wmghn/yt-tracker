import { useState, useEffect, useCallback } from "react";
import type { AppState, StaffMember, GroupConfig, OptionalColumnKey, VideoRow } from "@/types";
import { INITIAL_STATE, DEFAULT_CONFIG } from "@/types";
import { saveSession, loadSession, clearSession } from "@/lib/storage/session-storage";
import { computeAttribution } from "@/lib/services/attribution";

import UploadZone from "@/components/features/UploadZone";
import WeightConfig from "@/components/features/WeightConfig";
import StaffPanel from "@/components/features/StaffPanel";
import ResultsTable from "@/components/features/ResultsTable";

const STEPS = [
  { n: 1, label: "Upload file" },
  { n: 2, label: "Cấu hình" },
  { n: 3, label: "Nhân sự" },
  { n: 4, label: "Kết quả" },
];

export default function App() {
  const [state, setState] = useState<AppState>(() => loadSession() ?? INITIAL_STATE);

  // Persist on every change
  useEffect(() => {
    saveSession(state);
  }, [state]);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleUpload = (
    videos: VideoRow[],
    detectedOptional: OptionalColumnKey[]
  ) => {
    setState({
      ...INITIAL_STATE,
      step: 2,
      videos,
      detectedOptional,
      config: DEFAULT_CONFIG,
      staffList: [],
    });
  };

  const handleNewSession = () => {
    clearSession();
    setState(INITIAL_STATE);
  };

  const results =
    state.step === 4
      ? computeAttribution(state.videos, state.config, state.staffList)
      : [];

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L5.5 4L8 7.5L10 5.5L12 10H2Z" fill="#00d084" />
            </svg>
          </div>
          <span className="text-sm font-medium text-white">Views Tracker</span>
        </div>
        {state.step > 1 && (
          <button onClick={handleNewSession} className="btn-ghost text-xs py-1.5 px-3">
            ↺ Session mới
          </button>
        )}
      </header>

      {/* Step indicator */}
      <div className="border-b border-border px-6 py-0">
        <div className="flex">
          {STEPS.map((s, i) => {
            const active = s.n === state.step;
            const done = s.n < state.step;
            return (
              <div key={s.n} className="flex items-center">
                <button
                  onClick={() => {
                    if (done) patch({ step: s.n as AppState["step"] });
                  }}
                  disabled={s.n > state.step}
                  className={`
                    flex items-center gap-2 py-3.5 px-4 text-xs font-medium border-b-2 transition-colors
                    ${active ? "border-accent text-accent" : "border-transparent"}
                    ${done ? "text-slate-400 hover:text-white cursor-pointer" : ""}
                    ${!active && !done ? "text-slate-600 cursor-default" : ""}
                  `}
                >
                  <span className={`
                    w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-medium
                    ${active ? "bg-accent text-surface" : ""}
                    ${done ? "bg-surface-3 text-slate-400" : ""}
                    ${!active && !done ? "bg-surface-2 text-slate-600 border border-border" : ""}
                  `}>
                    {done ? "✓" : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <span className="text-slate-700 text-xs px-1">›</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 animate-in">
        {state.step === 1 && (
          <UploadZone onSuccess={handleUpload} />
        )}
        {state.step === 2 && (
          <WeightConfig
            config={state.config}
            onChange={(config: GroupConfig) => patch({ config })}
            onNext={() => patch({ step: 3 })}
          />
        )}
        {state.step === 3 && (
          <StaffPanel
            staffList={state.staffList}
            videos={state.videos}
            onChange={(staffList: StaffMember[]) => patch({ staffList })}
            onNext={() => patch({ step: 4 })}
            onBack={() => patch({ step: 2 })}
          />
        )}
        {state.step === 4 && (
          <ResultsTable
            results={results}
            config={state.config}
            detectedOptional={state.detectedOptional}
            onBack={() => patch({ step: 3 })}
          />
        )}
      </main>
    </div>
  );
}

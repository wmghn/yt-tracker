import { useState } from "react";
import type { StaffMember, VideoRow } from "@/types";
import { GROUPS } from "@/config/groups";
import StaffCard from "./StaffCard";

interface Props {
  staffList:        StaffMember[];
  videos:           VideoRow[];
  weights:          Record<string, number>;
  onChange:         (s: StaffMember[]) => void;
  onWeightsChange:  (w: Record<string, number>) => void;
  onNext:           () => void;
  onBack:           () => void;
}

export default function StaffPanel({
  staffList, videos, weights,
  onChange, onWeightsChange, onNext, onBack,
}: Props) {
  const [showNew, setShowNew] = useState(staffList.length === 0);

  const handleSave = (staff: StaffMember) => {
    const exists = staffList.find((s) => s.id === staff.id);
    onChange(exists ? staffList.map((s) => (s.id === staff.id ? staff : s)) : [...staffList, staff]);
    setShowNew(false);
  };

  const handleWeightChange = (key: string, val: string) => {
    const n = Math.max(0, Math.min(100, parseInt(val) || 0));
    onWeightsChange({ ...weights, [key]: n });
  };

  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);
  const weightValid = totalWeight === 100;

  const totalVideos = staffList.reduce((s, x) => s + x.videoIds.length, 0);
  const canProceed  = staffList.length > 0 && totalVideos > 0 && weightValid;

  // Visual split bar percentages
  const barWidths = GROUPS.map((g) => weights[g.key] ?? 0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-2">Nhân sự & Video IDs</h1>
          <p className="text-base text-ink-tertiary">Thêm nhân sự, dán video ID, và điều chỉnh tỷ trọng.</p>
        </div>
        <button onClick={onBack} className="btn-ghost btn-sm flex items-center gap-1.5 mt-1 text-ink-tertiary">
          ✎ Sửa file Excel
        </button>
      </div>

      {/* --- Inline weight editor --- */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-ink">Tỷ trọng đóng góp</p>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            weightValid
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-600 border border-red-200"
          }`}>
            Tổng: {totalWeight}% {weightValid ? "✓" : `≠ 100`}
          </span>
        </div>

        {/* Split bar */}
        <div className="flex rounded-xl overflow-hidden h-8 mb-4 border border-border">
          {GROUPS.map((g, i) => {
            const w = barWidths[i];
            return (
              <div key={g.key}
                className={`flex items-center justify-center text-xs font-bold text-white transition-all duration-200 ${
                  i === 0 ? "bg-blue-500" : i === 1 ? "bg-violet-500" : "bg-orange-500"
                }`}
                style={{ width: `${w}%`, minWidth: w > 5 ? undefined : 0 }}>
                {w > 10 && `${w}%`}
              </div>
            );
          })}
        </div>

        {/* Per-group inputs */}
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${GROUPS.length}, 1fr)` }}>
          {GROUPS.map((g) => {
            const val = weights[g.key] ?? g.weight;
            return (
              <div key={g.key}>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-sm inline-block ${
                    g.key === "EDITOR" ? "bg-blue-500" : g.key === "CONTENT" ? "bg-violet-500" : "bg-orange-500"
                  }`} />
                  {g.label}
                </label>
                <div className="relative">
                  <input
                    type="number" min="0" max="100"
                    value={val}
                    onChange={(e) => handleWeightChange(g.key, e.target.value)}
                    className={`input text-xl font-bold pr-8 text-center ${
                      !weightValid ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary font-medium text-sm pointer-events-none">%</span>
                </div>
                {/* Slider */}
                <input
                  type="range" min="0" max="100"
                  value={val}
                  onChange={(e) => handleWeightChange(g.key, e.target.value)}
                  className="w-full mt-1.5 accent-blue-500 h-1.5"
                />
              </div>
            );
          })}
        </div>

        {/* Live example */}
        {weightValid && (
          <div className="mt-4 p-3 rounded-xl bg-surface-2 text-xs font-mono text-ink-tertiary space-y-1">
            <p className="font-semibold text-ink-secondary not-italic font-sans text-xs mb-1">Ví dụ · 1.000 views · 2 editors · 1 content</p>
            {GROUPS.map((g, i) => {
              const membersEx = i === 0 ? 2 : 1;
              const pool  = Math.round(1000 * (weights[g.key] ?? 0) / 100);
              const each  = Math.round(pool / membersEx);
              return (
                <p key={g.key} className={
                  g.key === "EDITOR" ? "text-blue-600" : g.key === "CONTENT" ? "text-violet-600" : "text-orange-600"
                }>
                  {g.label}: 1.000 × {weights[g.key]}% = {pool.toLocaleString("vi-VN")}
                  {membersEx > 1 ? ` ÷ ${membersEx} = ` : " = "}
                  <span className="font-bold">{each.toLocaleString("vi-VN")} views</span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* Staff list */}
      <div className="space-y-3 mb-3">
        {staffList.map((s) => (
          <StaffCard key={s.id} staff={s} videos={videos} weights={weights}
            onSave={handleSave}
            onDelete={() => onChange(staffList.filter((x) => x.id !== s.id))} />
        ))}
      </div>

      {showNew ? (
        <StaffCard videos={videos} weights={weights} onSave={handleSave} isNew />
      ) : (
        <button onClick={() => setShowNew(true)}
          className="w-full border-2 border-dashed border-border hover:border-accent rounded-2xl py-4 text-base text-ink-muted hover:text-accent font-medium transition-all flex items-center justify-center gap-2">
          <span className="text-xl leading-none">+</span> Thêm nhân sự
        </button>
      )}

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="btn-ghost">← Quay lại</button>
        <button onClick={onNext} disabled={!canProceed} className="btn-primary flex-1 text-base">
          Tính kết quả →
        </button>
      </div>

      {!weightValid && (
        <p className="text-sm text-red-600 text-center mt-3">
          Tổng tỷ trọng phải bằng 100% trước khi tính kết quả
        </p>
      )}
      {weightValid && !canProceed && staffList.length > 0 && (
        <p className="text-sm text-amber-600 text-center mt-3">
          Cần ít nhất 1 nhân sự có video ID khớp với file upload
        </p>
      )}
    </div>
  );
}

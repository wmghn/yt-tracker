import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { v4 as uuid } from "uuid";
import type { StaffMember, VideoRow } from "@/types";
import { GROUPS } from "@/config/groups";
import { parseStaffSheet, type StaffSheetMode } from "@/lib/parsers/staff-sheet";
import { groupVideosByStaff } from "@/lib/services/staff-video-filter";
import StaffCard from "./StaffCard";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function inferRoleFromName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.startsWith("ED ") || upper.startsWith("ED_")) return "EDITOR";
  if (upper.startsWith("CT ") || upper.startsWith("CT_")) return "CONTENT";
  return GROUPS[0].key;
}

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
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg,    setImportMsg]    = useState<{ ok: boolean; text: string } | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [importMode,   setImportMode]   = useState<StaffSheetMode>("tien-do");

  // ── Parse helpers ──────────────────────────────────────────────────────────

  /**
   * Parse file as a raw staff sheet (Google Sheet with "Video ID" + "Tên Người Làm").
   * Uses the mode to decide which sheets to read.
   */
  const parseRawStaffFile = (buffer: ArrayBuffer, mode: StaffSheetMode): StaffMember[] | null => {
    const result = parseStaffSheet(buffer, mode);
    if (!result.success) return null;

    const groups = groupVideosByStaff(result.rows);
    const imported: StaffMember[] = [];

    for (const group of groups) {
      if (group.staffName === "— Chưa phân công") continue;
      imported.push({
        id:       uuid(),
        name:     group.staffName,
        role:     inferRoleFromName(group.staffName),
        videoIds: group.videoIds,
      });
    }

    return imported.length > 0 ? imported : null;
  };

  /**
   * Parse file as a StaffFilter export (with "Tên nhân sự" + "Vai trò" + "Video IDs" columns).
   * Only reads the first sheet.
   */
  const parseExportFile = (buffer: ArrayBuffer): StaffMember[] | null => {
    try {
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("staff")) ?? wb.SheetNames[0];
      const ws  = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      if (raw.length < 2) return null;

      const header = (raw[0] as unknown[]).map((c) => String(c ?? "").toLowerCase().trim());
      const colName    = header.findIndex((h) => h.includes("tên nhân sự") || h === "tên");
      const colRole    = header.findIndex((h) => h.includes("vai trò") || h === "role");
      const colIds     = header.findIndex((h) => h.includes("video id"));
      const nameIdx  = colName  !== -1 ? colName  : 0;
      const roleIdx  = colRole  !== -1 ? colRole  : -1;
      const idsIdx   = colIds   !== -1 ? colIds   : (colRole !== -1 ? 3 : 2);

      const roleLabelToKey = new Map(GROUPS.map((g) => [g.label.toLowerCase(), g.key]));

      const imported: StaffMember[] = [];
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        if (!row?.length) continue;
        const name = String(row[nameIdx] ?? "").trim();
        if (!name) continue;

        let role = inferRoleFromName(name);
        if (roleIdx !== -1) {
          const label = String(row[roleIdx] ?? "").toLowerCase().trim();
          role = roleLabelToKey.get(label) ?? inferRoleFromName(name);
        }

        const rawIds = String(row[idsIdx] ?? "").trim();
        const videoIds = rawIds
          .split(/[\n\r]+/)
          .map((s) => s.trim())
          .filter((s) => VIDEO_ID_REGEX.test(s));
        imported.push({ id: uuid(), name, role, videoIds });
      }

      return imported.length > 0 ? imported : null;
    } catch {
      return null;
    }
  };

  // ── Import logic ───────────────────────────────────────────────────────────

  const processImportFile = (file: File, mode: StaffSheetMode) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target!.result as ArrayBuffer;

      const imported = mode === "staff-export"
        ? (parseExportFile(buffer) ?? parseRawStaffFile(buffer, "staff-export"))
        : parseRawStaffFile(buffer, "tien-do");

      if (!imported || imported.length === 0) {
        setImportMsg({
          ok: false,
          text: mode === "tien-do"
            ? "Không tìm thấy sheet 'Work Progress' hoặc 'Live Stream' với cột hợp lệ."
            : "Không tìm thấy dữ liệu nhân sự trong file.",
        });
        setTimeout(() => setImportMsg(null), 5000);
        return;
      }

      // Build lookup of imported staff by name
      const importedByName = new Map(imported.map((s) => [s.name, s]));

      // Override existing staff with new video IDs, keep their existing id
      let overridden = 0;
      const updated = staffList.map((existing) => {
        const match = importedByName.get(existing.name);
        if (match) {
          overridden++;
          importedByName.delete(existing.name);
          return { ...existing, videoIds: match.videoIds, role: match.role };
        }
        return existing;
      });

      const newStaff = [...importedByName.values()];
      onChange([...updated, ...newStaff]);
      setShowNew(false);

      const parts: string[] = [];
      if (newStaff.length > 0)  parts.push(`${newStaff.length} mới`);
      if (overridden > 0)       parts.push(`${overridden} cập nhật`);
      setImportMsg({
        ok: true,
        text: `Đã import ${imported.length} nhân sự${parts.length > 0 ? ` (${parts.join(" · ")})` : ""}.`,
      });
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    processImportFile(file, importMode);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImportFile(file, importMode);
  };

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-2">Nhân sự & Video IDs</h1>
          <p className="text-base text-ink-tertiary">Thêm nhân sự, dán video ID, và điều chỉnh tỷ trọng.</p>
        </div>
        <button onClick={onBack} className="btn-ghost btn-sm flex items-center gap-1.5 mt-1 text-ink-tertiary">
          ✎ Sửa file Excel
        </button>
      </div>

      {/* --- Import zone --- */}
      <div className="mb-6 card overflow-hidden">
        {/* Mode selector tabs */}
        <div className="flex border-b border-border">
          {([
            { key: "tien-do"      as StaffSheetMode, label: "📋 File Tiến Độ Công Việc", desc: "Sheet Work Progress + Live Stream" },
            { key: "staff-export" as StaffSheetMode, label: "📄 Staff Video IDs",        desc: "File export từ Lọc Video ID" },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={(e) => { e.stopPropagation(); setImportMode(opt.key); }}
              className={`flex-1 px-4 py-3 text-left transition-all relative ${
                importMode === opt.key
                  ? "bg-white"
                  : "bg-surface-2/60 hover:bg-surface-2 text-ink-muted"
              }`}
            >
              <p className={`text-sm font-semibold ${importMode === opt.key ? "text-ink" : "text-ink-tertiary"}`}>{opt.label}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{opt.desc}</p>
              {importMode === opt.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Upload area */}
        <div
          onClick={() => importRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex items-center gap-3 px-5 py-4 cursor-pointer transition-all select-none ${
            isDragging
              ? "bg-blue-50 text-blue-600"
              : "bg-white hover:bg-surface-2/40 text-ink-muted hover:text-blue-600"
          }`}
        >
          <span className="text-lg">↑</span>
          <span className="text-sm font-medium flex-1">
            {isDragging
              ? "Thả file vào đây..."
              : importMode === "tien-do"
                ? "Upload file .xlsx — đọc sheet Work Progress + Live Stream"
                : "Upload file .xlsx — đọc sheet đầu tiên"
            }
          </span>
          {importMsg && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              importMsg.ok
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {importMsg.ok ? "✓" : "✗"} {importMsg.text}
            </span>
          )}
        </div>
      </div>
      <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />

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

      {/* --- Staff list header with clear all --- */}
      {staffList.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink-secondary">{staffList.length} nhân sự · {totalVideos} video IDs</p>
          <button
            onClick={() => { onChange([]); setShowNew(true); }}
            className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            🗑 Xoá hết
          </button>
        </div>
      )}

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

import { useState, useRef } from "react";
import type { StaffMember, StaffRole, VideoRow } from "@/types";
import { GROUPS } from "@/config/groups";
import { parseVideoIdList } from "@/lib/validators/video-id";
import { v4 as uuid } from "uuid";

interface Props {
  staff?:   StaffMember;
  videos:   VideoRow[];
  weights:  Record<string, number>;
  onSave:   (s: StaffMember) => void;
  onDelete?: () => void;
  isNew?:   boolean;
}

export default function StaffCard({ staff, videos, weights, onSave, onDelete, isNew = false }: Props) {
  const [editing, setEditing] = useState(isNew);
  const [name,    setName]    = useState(staff?.name ?? "");
  const [role,    setRole]    = useState<StaffRole>(staff?.role ?? GROUPS[0].key);
  const [rawIds,  setRawIds]  = useState(staff?.videoIds.join("\n") ?? "");
  const [nameErr, setNameErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const videoIndex = new Set(videos.map((v) => v.youtubeId));
  const { valid, invalid } = parseVideoIdList(rawIds);
  const matched   = valid.filter((id) =>  videoIndex.has(id));
  const unmatched = valid.filter((id) => !videoIndex.has(id));

  const currentGroup = GROUPS.find((g) => g.key === role) ?? GROUPS[0];

  const handleSave = () => {
    if (!name.trim()) { setNameErr("Vui lòng nhập tên"); return; }
    setNameErr("");
    onSave({ id: staff?.id ?? uuid(), name: name.trim(), role, videoIds: matched });
    setEditing(false);
  };

  const handleFileTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawIds((prev) => prev ? `${prev}\n${text.trim()}` : text.trim());
    };
    reader.readAsText(file); e.target.value = "";
  };

  // ── View mode ────────────────────────────────────────────────────────────
  if (!editing && staff) {
    const g  = GROUPS.find((x) => x.key === staff.role) ?? GROUPS[0];
    const w  = weights[staff.role] ?? g.weight;
    return (
      <div className="card p-5 animate-in">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-base font-bold ${g.color.bg} ${g.color.text} ${g.color.border}`}>
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-ink text-base">{staff.name}</p>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${g.color.bg} ${g.color.text} ${g.color.border}`}>
                {g.label} · {w}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)}
              className="text-sm text-ink-tertiary hover:text-ink font-medium px-2 py-1 hover:bg-surface-2 rounded-lg transition-colors">Sửa</button>
            {onDelete && (
              <button onClick={onDelete}
                className="text-sm text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">Xoá</button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="badge-success">{staff.videoIds.length} videos</span>
          {unmatched.length > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠ {unmatched.length} không tìm thấy</span>}
          {invalid.length   > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">✗ {invalid.length} sai định dạng</span>}
        </div>

        {staff.videoIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {staff.videoIds.slice(0, 5).map((id) => {
              const v = videos.find((x) => x.youtubeId === id);
              return <span key={id} className="tag-mono" title={v?.title}>{id}</span>;
            })}
            {staff.videoIds.length > 5 && <span className="text-xs text-ink-muted self-center">+{staff.videoIds.length - 5} thêm</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <div className={`card p-6 border-2 animate-in ${currentGroup.color.border}`}>
      <p className="text-base font-bold text-ink mb-5">{isNew ? "Thêm nhân sự mới" : "Chỉnh sửa"}</p>

      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Name */}
        <div>
          <label className="label">Tên nhân sự *</label>
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); setNameErr(""); }}
            placeholder="Nguyễn Văn A"
            className={`input ${nameErr ? "border-red-400 focus:border-red-400" : ""}`} />
          {nameErr && <p className="text-red-500 text-sm mt-1">{nameErr}</p>}
        </div>

        {/* Role — shows live % from weights */}
        <div>
          <label className="label">Vai trò</label>
          <div className="grid gap-2 mt-1"
            style={{ gridTemplateColumns: `repeat(${GROUPS.length}, 1fr)` }}>
            {GROUPS.map((g) => {
              const liveWeight = weights[g.key] ?? g.weight;
              return (
                <button key={g.key} onClick={() => setRole(g.key)}
                  className={`py-2.5 px-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    role === g.key
                      ? `${g.color.border} ${g.color.bg} ${g.color.text}`
                      : "border-border bg-white text-ink-tertiary hover:border-border-strong"
                  }`}>
                  <span className="block">{g.label}</span>
                  <span className={`text-base font-bold ${role === g.key ? "" : "text-ink-muted"}`}>
                    {liveWeight}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Video IDs */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Video IDs (mỗi ID 1 dòng)</label>
          <button onClick={() => fileRef.current?.click()}
            className="text-sm text-accent hover:text-accent-dim font-medium transition-colors">
            + Upload .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFileTxt} />
        </div>
        <textarea value={rawIds} onChange={(e) => setRawIds(e.target.value)} rows={6}
          placeholder={"GI1b9_k-tN4\nXI0hV24RLEQ\nFLI10v3FSJw\n..."} className="textarea text-sm" />
      </div>

      {/* Match feedback */}
      {rawIds.trim() && (
        <div className="mb-5 space-y-2">
          {matched.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
              <span className="font-bold text-emerald-700">✓</span>
              <span className="text-emerald-700 font-medium">{matched.length} videos khớp trong file</span>
            </div>
          )}
          {unmatched.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
              <span className="text-amber-700 font-medium">⚠ {unmatched.length} không có trong file upload: </span>
              <span className="font-mono text-amber-600 text-xs">{unmatched.join(", ")}</span>
            </div>
          )}
          {invalid.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm">
              <span className="text-red-600 font-medium">✗ {invalid.length} sai định dạng: </span>
              <span className="font-mono text-red-500 text-xs">{invalid.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSave} className="btn-primary flex-1">
          {isNew ? "Thêm nhân sự" : "Lưu thay đổi"}
        </button>
        {!isNew && (
          <button onClick={() => setEditing(false)} className="btn-ghost px-4">Huỷ</button>
        )}
        {onDelete && !isNew && (
          <button onClick={onDelete} className="px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors">Xoá</button>
        )}
      </div>
    </div>
  );
}

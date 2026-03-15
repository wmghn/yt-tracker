import { useState, useRef } from "react";
import type { StaffMember, StaffRole, VideoRow } from "@/types";
import { parseVideoIdList } from "@/lib/validators/video-id";
import { v4 as uuid } from "uuid";

interface Props {
  staff?: StaffMember;
  videos: VideoRow[];
  onSave: (staff: StaffMember) => void;
  onDelete?: () => void;
  isNew?: boolean;
}

export default function StaffCard({ staff, videos, onSave, onDelete, isNew = false }: Props) {
  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(staff?.name ?? "");
  const [role, setRole] = useState<StaffRole>(staff?.role ?? "EDITOR");
  const [rawIds, setRawIds] = useState(staff?.videoIds.join("\n") ?? "");
  const [nameErr, setNameErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const videoIndex = new Set(videos.map((v) => v.youtubeId));

  const { valid, invalid } = parseVideoIdList(rawIds);
  const matched = valid.filter((id) => videoIndex.has(id));
  const unmatched = valid.filter((id) => !videoIndex.has(id));

  const handleSave = () => {
    if (!name.trim()) { setNameErr("Nhập tên nhân sự"); return; }
    setNameErr("");
    onSave({
      id: staff?.id ?? uuid(),
      name: name.trim(),
      role,
      videoIds: matched,
    });
    setEditing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawIds((prev) => (prev ? prev + "\n" + text.trim() : text.trim()));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Display mode (saved card)
  if (!editing && staff) {
    return (
      <div className="card p-4 animate-in">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-3 border border-border flex items-center justify-center text-xs font-medium text-slate-300">
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-white text-sm">{staff.name}</div>
              <span className={role === "EDITOR" ? "badge-editor" : "badge-content"}>
                {role === "EDITOR" ? "Editor" : "Content"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-white transition-colors px-2 py-1">
              Sửa
            </button>
            {onDelete && (
              <button onClick={onDelete} className="text-xs text-red-500/60 hover:text-red-400 transition-colors px-2 py-1">
                Xoá
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-accent">✓</span>
            <span className="text-slate-300">{staff.videoIds.length} videos matched</span>
          </div>
          {unmatched.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400">⚠</span>
              <span className="text-amber-400/80">{unmatched.length} không tìm thấy trong file</span>
            </div>
          )}
          {invalid.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-red-400">✗</span>
              <span className="text-red-400/80">{invalid.length} ID không hợp lệ</span>
            </div>
          )}
        </div>

        {staff.videoIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {staff.videoIds.slice(0, 6).map((id) => {
              const video = videos.find((v) => v.youtubeId === id);
              return (
                <span key={id} className="text-[10px] font-mono px-2 py-0.5 bg-surface-2 border border-border rounded text-slate-400" title={video?.title}>
                  {id}
                </span>
              );
            })}
            {staff.videoIds.length > 6 && (
              <span className="text-[10px] px-2 py-0.5 text-slate-600">+{staff.videoIds.length - 6} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="card p-5 border-accent/20 animate-in">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-white">{isNew ? "Thêm nhân sự" : "Chỉnh sửa"}</p>
        {!isNew && (
          <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-white">
            Huỷ
          </button>
        )}
      </div>

      {/* Name + Role */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Tên nhân sự *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameErr(""); }}
            placeholder="Nguyễn Văn A"
            className={`input ${nameErr ? "border-red-500/50" : ""}`}
          />
          {nameErr && <p className="text-red-400 text-xs mt-1">{nameErr}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Vai trò</label>
          <div className="grid grid-cols-2 gap-2">
            {(["EDITOR", "CONTENT"] as StaffRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                  role === r
                    ? r === "EDITOR"
                      ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
                      : "border-purple-500/50 bg-purple-500/15 text-purple-400"
                    : "border-border text-slate-500 hover:border-white/20"
                }`}
              >
                {r === "EDITOR" ? "Editor" : "Content"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Video IDs */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-slate-500">Video IDs (mỗi ID 1 dòng)</label>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-accent hover:text-accent-dim transition-colors"
          >
            + Upload .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
        </div>
        <textarea
          value={rawIds}
          onChange={(e) => setRawIds(e.target.value)}
          rows={6}
          placeholder={"GI1b9_k-tN4\nXI0hV24RLEQ\nFLI10v3FSJw\n..."}
          className="textarea"
        />
      </div>

      {/* Preview matches */}
      {rawIds.trim() && (
        <div className="mb-4 space-y-1.5 text-xs">
          {matched.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/15">
              <span className="text-accent mt-0.5">✓</span>
              <span className="text-slate-300">{matched.length} videos khớp trong file</span>
            </div>
          )}
          {unmatched.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <span className="text-amber-400 mt-0.5">⚠</span>
              <div>
                <span className="text-amber-400/80">{unmatched.length} ID không có trong file upload</span>
                <div className="mt-1 font-mono text-slate-500">{unmatched.join(", ")}</div>
              </div>
            </div>
          )}
          {invalid.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/15">
              <span className="text-red-400 mt-0.5">✗</span>
              <div>
                <span className="text-red-400/80">{invalid.length} ID sai định dạng (cần 11 ký tự)</span>
                <div className="mt-1 font-mono text-slate-500">{invalid.join(", ")}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} className="btn-primary flex-1">
          {isNew ? "Thêm nhân sự" : "Lưu thay đổi"}
        </button>
        {onDelete && !isNew && (
          <button onClick={onDelete} className="btn-ghost text-red-400 border-red-500/20 hover:border-red-500/40 px-3">
            Xoá
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import type { Channel } from "@/types";

interface Props {
  channels:        Channel[];
  activeChannelId: string | null;
  onSelect:        (id: string) => void;
  onCreate:        (name: string) => void;
  onRename:        (id: string, name: string) => void;
  onDelete:        (id: string) => void;
}

export default function ChannelSelector({
  channels, activeChannelId, onSelect, onCreate, onRename, onDelete,
}: Props) {
  const [open,       setOpen]       = useState(false);
  const [newName,    setNewName]     = useState("");
  const [editingId,  setEditingId]   = useState<string | null>(null);
  const [editName,   setEditName]    = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const active = channels.find(c => c.id === activeChannelId);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  };

  const handleRename = (id: string) => {
    const name = editName.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Xóa kênh này sẽ xóa toàn bộ lịch sử của kênh. Tiếp tục?")) return;
    onDelete(id);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 transition-all text-sm font-semibold text-ink"
      >
        <span className="text-base">📺</span>
        <span className="max-w-[160px] truncate">
          {active ? active.name : "Chọn kênh"}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-ink-muted flex-shrink-0">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-surface-1 border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Channel list */}
          <div className="max-h-60 overflow-y-auto">
            {channels.length === 0 && (
              <p className="text-xs text-ink-muted px-4 py-3">Chưa có kênh nào. Tạo kênh đầu tiên bên dưới.</p>
            )}
            {channels.map(ch => (
              <div
                key={ch.id}
                className={`flex items-center gap-2 px-3 py-2.5 hover:bg-surface-2 transition-all group ${
                  ch.id === activeChannelId ? "bg-accent/5" : ""
                }`}
              >
                {editingId === ch.id ? (
                  <div className="flex-1 flex gap-1.5">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(ch.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 input input-sm text-sm"
                    />
                    <button
                      onClick={() => handleRename(ch.id)}
                      className="btn-ghost btn-sm text-xs text-accent font-semibold"
                    >Lưu</button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-ghost btn-sm text-xs text-ink-muted"
                    >✕</button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { onSelect(ch.id); setOpen(false); }}
                      className="flex-1 text-left text-sm font-medium text-ink flex items-center gap-2"
                    >
                      {ch.id === activeChannelId && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      )}
                      <span className="truncate">{ch.name}</span>
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(ch.id); setEditName(ch.name); }}
                        className="p-1 rounded hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors"
                        title="Đổi tên"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086z"/>
                        </svg>
                      </button>
                      {channels.length > 1 && (
                        <button
                          onClick={() => handleDelete(ch.id)}
                          className="p-1 rounded hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors"
                          title="Xóa kênh"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create new channel */}
          <div className="border-t border-border px-3 py-2.5">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Thêm kênh mới</p>
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="Tên kênh..."
                className="flex-1 input input-sm text-sm"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="btn-primary btn-sm text-sm font-semibold disabled:opacity-40"
              >
                Tạo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

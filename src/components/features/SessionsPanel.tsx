import { useState } from "react";
import type { MonthSession, Channel } from "@/types";

interface Props {
  channel:          Channel;
  sessions:         MonthSession[];       // sorted ascending (oldest first) by displayOrder
  onLoad:           (session: MonthSession) => void;
  onRename:         (id: string, period: string) => void;
  onDelete:         (id: string) => void;
  onReorder:        (orderedIds: string[]) => void;
  onStartNewUpload: () => void;
}

/** Derive month/year badge from session.period (authoritative YYYY-MM). */
function parseBadge(s: MonthSession): { month: string; year: string } {
  const [yr, mo] = (s.period || "").split("-");
  const month = mo ? `T${parseInt(mo)}` : "—";
  const year  = yr ? yr.slice(2) : "";
  return { month, year };
}

export default function SessionsPanel({
  channel, sessions, onLoad, onRename, onDelete, onReorder, onStartNewUpload,
}: Props) {
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editPeriod,   setEditPeriod]   = useState("");

  // Display newest → oldest (reverse of chart order)
  const displayed = [...sessions].reverse();

  const handleRename = (id: string) => {
    if (/^\d{4}-\d{2}$/.test(editPeriod)) onRename(id, editPeriod);
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Xóa "${name}"? Hành động này không thể hoàn tác.`)) return;
    onDelete(id);
  };

  // Move session up in the displayed list = move it later in chart order (more recent)
  const move = (id: string, direction: "up" | "down") => {
    const idx = displayed.findIndex(s => s.id === id);
    const newDisplayed = [...displayed];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newDisplayed.length) return;
    [newDisplayed[idx], newDisplayed[swapIdx]] = [newDisplayed[swapIdx], newDisplayed[idx]];
    // orderedIds for the chart = oldest first (reverse of displayed)
    onReorder([...newDisplayed].reverse().map(s => s.id));
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-ink mb-1">Lịch sử tháng</h2>
          <p className="text-sm text-ink-muted">
            Kênh: <span className="font-semibold text-ink">{channel.name}</span>
            {" · "}{sessions.length} tháng đã lưu
          </p>
        </div>
        <button onClick={onStartNewUpload} className="btn-primary flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.75 1.75a.75.75 0 0 0-1.5 0V7H2.75a.75.75 0 0 0 0 1.5H7.25v5.25a.75.75 0 0 0 1.5 0V8.5h4.5a.75.75 0 0 0 0-1.5H8.75V1.75Z"/>
          </svg>
          Upload tháng mới
        </button>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="card p-16 text-center">
          <p className="text-4xl mb-4">📅</p>
          <h3 className="text-lg font-bold text-ink mb-2">Chưa có dữ liệu nào</h3>
          <p className="text-sm text-ink-muted mb-6">
            Upload file YouTube Analytics và lưu lại để theo dõi hiệu suất theo tháng.
          </p>
          <button onClick={onStartNewUpload} className="btn-primary">Upload tháng đầu tiên</button>
        </div>
      )}

      {/* Sessions list — newest first */}
      {sessions.length > 0 && (
        <div className="space-y-3">
          {displayed.map((s, visibleIdx) => {
            const { month, year } = parseBadge(s);
            const isFirst = visibleIdx === 0;
            const isLast  = visibleIdx === displayed.length - 1;

            return (
              <div
                key={s.id}
                className="card p-4 flex items-center gap-3 hover:border-accent/30 transition-all group"
              >
                {/* Re-order handles */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => move(s.id, "up")}
                    disabled={isFirst}
                    title="Di chuyển lên (tháng mới hơn)"
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.22 9.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 0 1-1.06 0Z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => move(s.id, "down")}
                    disabled={isLast}
                    title="Di chuyển xuống (tháng cũ hơn)"
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"/>
                    </svg>
                  </button>
                </div>

                {/* Period badge */}
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-accent/70 uppercase tracking-wide leading-none">
                    {month}
                  </span>
                  <span className="text-xs font-bold text-accent leading-none mt-0.5">
                    {year}
                  </span>
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  {editingId === s.id ? (
                    <div className="flex gap-1.5 items-center">
                      <input
                        autoFocus
                        type="month"
                        value={editPeriod}
                        onChange={e => setEditPeriod(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRename(s.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="input input-sm text-sm flex-1"
                      />
                      <button onClick={() => handleRename(s.id)}
                        className="btn-ghost btn-sm text-xs text-accent font-semibold">Lưu</button>
                      <button onClick={() => setEditingId(null)}
                        className="btn-ghost btn-sm text-xs text-ink-muted">✕</button>
                    </div>
                  ) : (
                    <p className="font-semibold text-ink text-sm truncate">{s.name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-ink-muted">{s.videos.length} video</span>
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">{s.staffList.length} nhân sự</span>
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">
                      Lưu {new Date(s.savedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onLoad(s)} className="btn-primary btn-sm text-xs" title="Xem kết quả">
                    Xem
                  </button>
                  {editingId !== s.id && (
                    <button
                      onClick={() => { setEditingId(s.id); setEditPeriod(s.period || ""); }}
                      className="btn-ghost btn-sm p-1.5 text-ink-muted hover:text-ink"
                      title="Đổi tháng"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086z"/>
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id, s.name)}
                    className="btn-ghost btn-sm p-1.5 text-ink-muted hover:text-red-500"
                    title="Xóa"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15z"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart order hint */}
      {sessions.length >= 2 && (
        <p className="text-xs text-ink-muted mt-4 text-center">
          Thứ tự trong danh sách = thứ tự trên biểu đồ (mới nhất ở trên = bên phải chart)
        </p>
      )}

      {sessions.length === 1 && (
        <div className="mt-6 card p-4 bg-accent/5 border-accent/20">
          <p className="text-sm text-accent font-medium">
            💡 Lưu thêm 1 tháng nữa để mở khóa tab Analytics và xem xu hướng hiệu suất.
          </p>
        </div>
      )}
    </div>
  );
}

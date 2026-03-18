import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { parseStaffSheet } from "@/lib/parsers/staff-sheet";
import { groupVideosByStaff, formatVideoIdList } from "@/lib/services/staff-video-filter";
import { GROUPS } from "@/config/groups";
import type { StaffVideoGroup } from "@/lib/services/staff-video-filter";
import type { StaffSheetParseSuccess } from "@/lib/parsers/staff-sheet";

function inferRole(name: string): string {
  const u = name.toUpperCase();
  if (u.startsWith("ED ") || u.startsWith("ED_")) return "EDITOR";
  if (u.startsWith("CT ") || u.startsWith("CT_")) return "CONTENT";
  return GROUPS[0].key;
}

export default function StaffFilter() {
  const [parseResult, setParseResult] = useState<StaffSheetParseSuccess | null>(null);
  const [groups,      setGroups]      = useState<StaffVideoGroup[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [search,      setSearch]      = useState("");
  const [copiedName,  setCopiedName]  = useState<string | null>(null);
  const [parseError,  setParseError]  = useState("");
  const [dragging,    setDragging]    = useState(false);
  const [roles,       setRoles]       = useState<Map<string, string>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);

  const setRole = (staffName: string, role: string) =>
    setRoles(prev => new Map(prev).set(staffName, role));

  const cycleRole = (staffName: string) => {
    const current = roles.get(staffName) ?? GROUPS[0].key;
    const idx = GROUPS.findIndex(g => g.key === current);
    const next = GROUPS[(idx + 1) % GROUPS.length].key;
    setRole(staffName, next);
  };

  const loadFile = (file: File) => {
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseStaffSheet(ev.target!.result as ArrayBuffer);
      if (!result.success) { setParseError(result.error); return; }
      const grouped = groupVideosByStaff(result.rows);
      setParseResult(result);
      setGroups(grouped);
      setSelected(new Set(grouped.map(g => g.staffName)));
      setExpanded(new Set());
      setSearch("");
      setRoles(new Map(grouped.map(g => [g.staffName, inferRole(g.staffName)])));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const reset = () => {
    setParseResult(null);
    setGroups([]);
    setSelected(new Set());
    setExpanded(new Set());
    setSearch("");
    setParseError("");
    setRoles(new Map());
  };

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.staffName.toLowerCase().includes(q));
  }, [groups, search]);

  const toggleSelect = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const selectAll   = () => setSelected(new Set(groups.map(g => g.staffName)));
  const deselectAll = () => setSelected(new Set());
  const allSelected = groups.length > 0 && groups.every(g => selected.has(g.staffName));

  const copyIds = async (group: StaffVideoGroup) => {
    await navigator.clipboard.writeText(formatVideoIdList(group.videoIds));
    setCopiedName(group.staffName);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const toggleExpand = (name: string) => {
    const next = new Set(expanded);
    next.has(name) ? next.delete(name) : next.add(name);
    setExpanded(next);
  };

  const exportExcel = () => {
    const sel = groups.filter(g => selected.has(g.staffName));
    const wb  = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([
      ["Tên nhân sự", "Vai trò", "Số video", "Video IDs (paste vào yt-tracker)"],
      ...sel.map(g => {
        const roleKey   = roles.get(g.staffName) ?? GROUPS[0].key;
        const roleLabel = GROUPS.find(r => r.key === roleKey)?.label ?? roleKey;
        return [g.staffName, roleLabel, g.videoCount, g.videoIds.join("\n")];
      }),
    ]);
    ws1["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Staff → Video IDs");

    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Tên nhân sự", "Vai trò", "Video ID", "Tiêu đề", "Trạng thái", "Ngày đăng"],
      ...sel.flatMap(g => {
        const roleKey   = roles.get(g.staffName) ?? GROUPS[0].key;
        const roleLabel = GROUPS.find(r => r.key === roleKey)?.label ?? roleKey;
        return g.videos.map(v => [g.staffName, roleLabel, v.videoId, v.title, v.status, v.publishedAt]);
      }),
    ]);
    ws2["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 60 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết");

    XLSX.writeFile(wb, "staff-video-ids.xlsx");
  };

  // ── Empty / upload state ───────────────────────────────────────────────────
  if (!parseResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink mb-2">Lọc Video ID</h1>
          <p className="text-base text-ink-tertiary">
            Upload file Excel từ Google Sheet để nhóm Video ID theo từng nhân sự.
          </p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
            dragging
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent hover:bg-surface-2/50"
          }`}
        >
          <p className="text-4xl mb-4">📋</p>
          <p className="text-base font-semibold text-ink mb-1">Upload file Excel</p>
          <p className="text-sm text-ink-muted mb-4">File .xlsx hoặc .csv từ Google Sheet</p>
          <p className="text-xs text-ink-tertiary">
            Cần có cột: <strong>Video ID</strong> + <strong>Tên Người Làm</strong>
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />
        </div>

        {parseError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        )}
      </div>
    );
  }

  // ── Loaded state ───────────────────────────────────────────────────────────
  const selectedCount = groups.filter(g => selected.has(g.staffName)).length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Lọc Video ID</h1>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{groups.filter(g => g.staffName !== "— Chưa phân công").length} nhân sự</span>
            {" · "}
            <span className="font-semibold text-ink">{parseResult.rows.length} video</span>
            {parseResult.skipped > 0 && (
              <> · <span className="text-amber-600">{parseResult.skipped} không có ID</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2 mt-1">
          <button onClick={reset} className="btn-ghost btn-sm text-ink-tertiary">
            ↺ Đổi file
          </button>
          <button
            onClick={exportExcel}
            disabled={selectedCount === 0}
            className="btn-primary btn-sm px-4 disabled:opacity-40"
          >
            ↓ Export Excel {selectedCount > 0 && `(${selectedCount})`}
          </button>
        </div>
      </div>

      {/* Search + select all */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm kiếm nhân sự..."
          className="flex-1 rounded-xl border border-border bg-white px-4 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={allSelected ? deselectAll : selectAll}
          className="btn-ghost btn-sm whitespace-nowrap"
        >
          {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </button>
      </div>

      {/* Staff list */}
      <div className="space-y-2">
        {filteredGroups.length === 0 && (
          <p className="text-center text-sm text-ink-muted py-8">Không tìm thấy nhân sự nào.</p>
        )}

        {filteredGroups.map(group => {
          const isSelected   = selected.has(group.staffName);
          const isExpanded   = expanded.has(group.staffName);
          const isCopied     = copiedName === group.staffName;
          const isUnassigned = group.staffName === "— Chưa phân công";
          const roleKey      = roles.get(group.staffName) ?? GROUPS[0].key;
          const roleGroup    = GROUPS.find(g => g.key === roleKey) ?? GROUPS[0];

          return (
            <div key={group.staffName} className="card overflow-hidden">
              {/* Row header */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelect(group.staffName)}
                  className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-accent border-accent"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {isSelected && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                </button>

                {/* Name + count */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className={`font-semibold text-sm truncate ${isUnassigned ? "text-ink-muted italic" : "text-ink"}`}>
                    {group.staffName}
                  </span>
                  <span className="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full border border-border flex-shrink-0">
                    {group.videoCount} video
                  </span>
                  {!isUnassigned && (
                    <button
                      onClick={() => cycleRole(group.staffName)}
                      title="Click để đổi vai trò"
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 transition-all ${roleGroup.color.bg} ${roleGroup.color.text} ${roleGroup.color.border}`}
                    >
                      {roleGroup.label}
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyIds(group)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      isCopied
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-surface-2 text-ink-secondary border-border hover:border-accent hover:text-accent"
                    }`}
                  >
                    {isCopied ? "✓ Đã copy" : "Copy IDs"}
                  </button>
                  <button
                    onClick={() => toggleExpand(group.staffName)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-ink-secondary hover:border-accent hover:text-accent transition-all"
                  >
                    {isExpanded ? "Ẩn ▲" : "Xem ▼"}
                  </button>
                </div>
              </div>

              {/* Expanded video list */}
              {isExpanded && (
                <div className="border-t border-border animate-in">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-2">
                          <th className="pl-5 px-3 py-2 text-left font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">Video ID</th>
                          <th className="px-3 py-2 text-left font-bold text-ink-tertiary uppercase tracking-wide">Tiêu đề</th>
                          {group.videos.some(v => v.status) && (
                            <th className="px-3 py-2 text-left font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">Trạng thái</th>
                          )}
                          {group.videos.some(v => v.publishedAt) && (
                            <th className="px-3 pr-5 py-2 text-left font-bold text-ink-tertiary uppercase tracking-wide whitespace-nowrap">Ngày đăng</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.videos.map(v => (
                          <tr key={v.videoId} className="hover:bg-surface-2/40">
                            <td className="pl-5 px-3 py-2">
                              <a
                                href={`https://youtube.com/watch?v=${v.videoId}`}
                                target="_blank" rel="noopener noreferrer"
                                className="font-mono text-blue-500 hover:underline"
                                onClick={e => e.stopPropagation()}
                              >
                                {v.videoId}
                              </a>
                            </td>
                            <td className="px-3 py-2 text-ink max-w-xs truncate" title={v.title}>
                              {v.title || <span className="text-ink-muted italic">—</span>}
                            </td>
                            {group.videos.some(v => v.status) && (
                              <td className="px-3 py-2 text-ink-secondary whitespace-nowrap">{v.status || "—"}</td>
                            )}
                            {group.videos.some(v => v.publishedAt) && (
                              <td className="px-3 pr-5 py-2 text-ink-secondary whitespace-nowrap">{v.publishedAt || "—"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 border-t border-border flex justify-end">
                    <button
                      onClick={() => copyIds(group)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                        isCopied
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "btn-ghost"
                      }`}
                    >
                      {isCopied ? "✓ Đã copy" : `Copy tất cả IDs — ${group.videoCount} dòng`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

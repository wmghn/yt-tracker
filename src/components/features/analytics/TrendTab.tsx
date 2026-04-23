import { useState, useMemo } from "react";
import type { StaffPeriodMetrics, StaffTrend, TrendLabel } from "@/lib/services/analytics";

interface Props {
  allMetrics: StaffPeriodMetrics[];
  trends:     StaffTrend[];
}

// ── Color palette ─────────────────────────────────────────────────────────────
const LINE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#8b5cf6", "#06b6d4", "#f97316",
  "#ec4899", "#84cc16", "#14b8a6", "#f43f5e",
];
const LINE_DASHES = ["", "7 3", "2 3", "9 3 2 3", "14 4", "3 2 10 2"];

// ── Trend config ──────────────────────────────────────────────────────────────
const TREND_CONFIG: Record<TrendLabel, { label: string; badge: string; icon: string }> = {
  rising_strong:     { label: "Tăng mạnh",   badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "↑↑" },
  rising:            { label: "Tăng",         badge: "bg-green-50 text-green-600 border-green-200",        icon: "↑"  },
  stable:            { label: "Ổn định",      badge: "bg-slate-100 text-slate-600 border-slate-200",       icon: "→"  },
  declining:         { label: "Giảm",         badge: "bg-amber-50 text-amber-600 border-amber-200",        icon: "↓"  },
  declining_severe:  { label: "Giảm mạnh",    badge: "bg-red-50 text-red-600 border-red-200",              icon: "↓↓" },
  insufficient_data: { label: "Chưa đủ data", badge: "bg-slate-50 text-slate-400 border-slate-200",        icon: "–"  },
};

function formatPeriod(p: string) {
  const [y, m] = p.split("-");
  return `T${parseInt(m)}/${y.slice(2)}`;
}
function fmtRevenue(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
function fmtViews(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString("vi-VN");
}
function fmtWatchTime(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}Mh`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}Kh`;
  if (v >= 10)        return `${v.toFixed(0)}h`;
  return `${v.toFixed(1)}h`;
}

// ── Series & slice types ──────────────────────────────────────────────────────
interface Series {
  key:   string;
  label: string;
  color: string;
  dash:  string;
  data:  number[];
}
interface PieSlice {
  key:     string;
  label:   string;
  color:   string;
  value:   number;
  percent: number;
}
interface TooltipState {
  svgX: number;
  svgY: number;
  text: string;
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────
const W = 680, H = 240;
const PAD = { top: 20, right: 20, bottom: 44, left: 64 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

function LineChart({
  title, subtitle, periods, periodLabels, series, hiddenKeys, formatY,
}: {
  title:         string;
  subtitle?:     string;
  periods:       string[];
  periodLabels?: Map<string, string>;
  series:        Series[];
  hiddenKeys:    Set<string>;
  formatY:       (v: number) => string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const activeSeries = series.filter(s => !hiddenKeys.has(s.key) && s.data.some(v => v > 0));

  if (activeSeries.length === 0 || periods.length < 2) {
    return (
      <div>
        <h2 className="text-base font-bold text-ink mb-1">{title}</h2>
        {subtitle && <p className="text-xs text-ink-muted mb-3">{subtitle}</p>}
        <p className="text-sm text-ink-muted py-6 text-center bg-surface-2 rounded-xl">
          {periods.length < 2 ? "Chưa đủ dữ liệu (cần ≥ 2 tháng)." : "Tất cả nhân sự đang bị ẩn."}
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...activeSeries.flatMap(s => s.data), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    frac: f, val: Math.round(maxVal * f * 100) / 100, y: PAD.top + chartH * (1 - f),
  }));
  const xStep = periods.length > 1 ? chartW / (periods.length - 1) : chartW;
  const px = (i: number) => PAD.left + i * xStep;
  const py = (v: number) => PAD.top + chartH * (1 - v / maxVal);

  return (
    <div>
      <h2 className="text-base font-bold text-ink mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-ink-muted mb-3">{subtitle}</p>}
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: W, minWidth: 400 }}>
          <svg width={W} height={H} style={{ display: "block" }}>
            {/* Y gridlines + labels */}
            {yTicks.map(t => (
              <g key={t.frac}>
                <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
                  stroke="#e5e7eb" strokeWidth={1} strokeDasharray={t.frac === 0 ? undefined : "4 3"} />
                <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
                  {formatY(t.val)}
                </text>
              </g>
            ))}
            {/* X axis */}
            {periods.map((p, i) => {
              const xLabel = periodLabels?.get(p) ?? formatPeriod(p);
              const short  = xLabel.replace(/^tháng\s*/i, "T").replace(/\/20/, "/");
              return (
                <g key={p}>
                  <line x1={px(i)} y1={PAD.top + chartH} x2={px(i)} y2={PAD.top + chartH + 4}
                    stroke="#d1d5db" strokeWidth={1} />
                  <text x={px(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#6b7280">
                    {short}
                  </text>
                </g>
              );
            })}
            {/* Lines */}
            {activeSeries.map(s => {
              const pts = s.data.map((v, i) => ({ x: px(i), y: py(v), v, i }));
              const segments: typeof pts[] = [];
              let seg: typeof pts = [];
              for (const pt of pts) {
                if (pt.v > 0) seg.push(pt);
                else { if (seg.length) { segments.push(seg); seg = []; } }
              }
              if (seg.length) segments.push(seg);
              return (
                <g key={s.key}>
                  {segments.filter(sg => sg.length >= 2).map((sg, si) => (
                    <polyline key={si}
                      points={sg.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke={s.color} strokeWidth={2.5}
                      strokeDasharray={s.dash || undefined}
                      strokeLinejoin="round" strokeLinecap="round" opacity={0.9}
                    />
                  ))}
                </g>
              );
            })}
            {/* Dots */}
            {activeSeries.map((s, si) => (
              <g key={`d-${s.key}`}>
                {s.data.map((v, i) => v > 0 && (
                  <g key={i}>
                    <circle cx={px(i)} cy={py(v)} r={12} fill="transparent" style={{ cursor: "pointer" }}
                      onMouseEnter={() => setTooltip({
                        svgX: px(i), svgY: py(v),
                        text: `${s.label} · ${periodLabels?.get(periods[i]) ?? formatPeriod(periods[i])}: ${formatY(v)}`,
                      })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    <circle cx={px(i)} cy={py(v)} r={si === 0 ? 4.5 : 4}
                      fill={s.color} stroke="white" strokeWidth={2} style={{ pointerEvents: "none" }} />
                  </g>
                ))}
              </g>
            ))}
          </svg>
          {/* HTML tooltip */}
          {tooltip && (() => {
            const above = tooltip.svgY > PAD.top + 44;
            return (
              <div className="absolute pointer-events-none z-20 bg-gray-900 text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap"
                style={{ left: tooltip.svgX, top: above ? tooltip.svgY - 38 : tooltip.svgY + 14, transform: "translateX(-50%)" }}>
                {tooltip.text}
                <span className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
                  style={above ? { top: "100%", borderTopColor: "#111827" } : { bottom: "100%", borderBottomColor: "#111827" }} />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── SVG Pie Chart ─────────────────────────────────────────────────────────────
function PieChart({
  slices, title, subtitle, formatValue, stacked = false,
}: {
  slices:       PieSlice[];
  title:        string;
  subtitle?:    string;
  formatValue?: (v: number) => string;
  stacked?:     boolean; // true = SVG centered on top, legend below (for 3-col grid)
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const activeSlices = slices.filter(s => s.value > 0);
  if (activeSlices.length === 0) return null;

  // Smaller donut in stacked mode to leave more room for legend
  const sz = stacked ? 160 : 200;
  const CX = sz / 2, CY = sz / 2;
  const R       = stacked ? 62 : 78;
  const INNER_R = stacked ? 34 : 42;

  let angle = -Math.PI / 2;
  const arcs = activeSlices.map(s => {
    const sweep = (s.percent / 100) * 2 * Math.PI;
    const start = angle;
    const end   = angle + sweep;
    angle = end;

    const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end),   y2 = CY + R * Math.sin(end);
    const xi1 = CX + INNER_R * Math.cos(start), yi1 = CY + INNER_R * Math.sin(start);
    const xi2 = CX + INNER_R * Math.cos(end),   yi2 = CY + INNER_R * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M ${xi1} ${yi1} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${INNER_R} ${INNER_R} 0 ${large} 0 ${xi1} ${yi1} Z`;

    return { ...s, path };
  });

  const hovered = arcs.find(a => a.key === hoveredKey);
  const sorted  = arcs.slice().sort((a, b) => b.percent - a.percent);

  const donut = (
    <svg width={sz} height={sz} className={stacked ? "mx-auto" : "flex-shrink-0"}>
      {arcs.map(a => (
        <path key={a.key} d={a.path} fill={a.color} stroke="white" strokeWidth={2}
          opacity={hoveredKey && a.key !== hoveredKey ? 0.55 : 1}
          style={{
            cursor: "pointer",
            transformOrigin: `${CX}px ${CY}px`,
            transform: a.key === hoveredKey ? "scale(1.04)" : "scale(1)",
            transition: "transform 0.15s, opacity 0.15s",
          }}
          onMouseEnter={() => setHoveredKey(a.key)}
          onMouseLeave={() => setHoveredKey(null)}
        />
      ))}
      {hovered ? (
        <>
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize={stacked ? 9 : 10} fontWeight="600" fill="#374151">
            {hovered.label.length > 12 ? hovered.label.slice(0, 11) + "…" : hovered.label}
          </text>
          <text x={CX} y={CY + 8} textAnchor="middle" fontSize={stacked ? 12 : 13} fontWeight="700" fill="#111827">
            {hovered.percent.toFixed(1)}%
          </text>
          {formatValue && (
            <text x={CX} y={CY + 22} textAnchor="middle" fontSize={9} fill="#6b7280">
              {formatValue(hovered.value)}
            </text>
          )}
        </>
      ) : (
        <>
          <text x={CX} y={CY - 5} textAnchor="middle" fontSize={stacked ? 9 : 10} fill="#9ca3af">Tổng</text>
          <text x={CX} y={CY + 11} textAnchor="middle" fontSize={stacked ? 10 : 11} fontWeight="600" fill="#374151">
            {activeSlices.length} nhân sự
          </text>
        </>
      )}
    </svg>
  );

  const legend = (
    <div className={stacked ? "space-y-0.5" : "flex-1 min-w-0 space-y-1 pt-1"}>
      {sorted.map((a, rank) => (
        <div key={a.key}
          className={`flex items-center gap-1.5 rounded-lg cursor-pointer transition-all ${
            stacked ? "px-1.5 py-1" : "px-2 py-1.5"
          } ${a.key === hoveredKey ? "bg-surface-2" : "hover:bg-surface-2"}`}
          onMouseEnter={() => setHoveredKey(a.key)}
          onMouseLeave={() => setHoveredKey(null)}
        >
          <span className="text-[10px] text-ink-muted w-4 text-right flex-shrink-0">{rank + 1}</span>
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: a.color }} />
          <span className="flex-1 text-xs text-ink font-medium truncate">{a.label}</span>
          <span className="text-xs font-bold text-ink flex-shrink-0">{a.percent.toFixed(1)}%</span>
          {formatValue && (
            <span className="text-[11px] text-ink-muted flex-shrink-0 min-w-[36px] text-right">
              {formatValue(a.value)}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h2 className="text-sm font-bold text-ink mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-ink-muted mb-2">{subtitle}</p>}
      {stacked ? (
        <div className="space-y-3">
          {donut}
          {legend}
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {donut}
          {legend}
        </div>
      )}
    </div>
  );
}

// ── Shared interactive legend ──────────────────────────────────────────────────
function SeriesLegend({
  series,
  hiddenKeys,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  series:     Series[];
  hiddenKeys: Set<string>;
  onToggle:   (key: string) => void;
  onShowAll:  () => void;
  onHideAll:  () => void;
}) {
  const anyHidden = hiddenKeys.size > 0;
  const allHidden = hiddenKeys.size === series.length;

  return (
    <div className="card p-4 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-ink uppercase tracking-wide">Màu nhân sự</p>
          <p className="text-[10px] text-ink-muted mt-0.5">
            Dùng chung cho tất cả biểu đồ · Click để ẩn/hiện trên biểu đồ <span className="font-semibold">đường</span>
          </p>
        </div>
        <div className="flex gap-2">
          {anyHidden && (
            <button onClick={onShowAll}
              className="text-xs font-semibold text-accent hover:underline">
              Hiện tất cả
            </button>
          )}
          {!allHidden && series.length > 1 && (
            <button onClick={onHideAll}
              className="text-xs font-semibold text-ink-muted hover:text-ink hover:underline">
              Ẩn tất cả
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {series.map(s => {
          const hidden = hiddenKeys.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => onToggle(s.key)}
              title={hidden ? "Click để hiện trên biểu đồ đường" : "Click để ẩn trên biểu đồ đường"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                hidden
                  ? "border-border bg-surface-2 text-ink-muted opacity-50"
                  : "border-border bg-white text-ink hover:bg-surface-2"
              }`}
            >
              {/* Line preview (for line chart reference) + dot */}
              <svg width={20} height={10} className="flex-shrink-0">
                <line x1={0} y1={5} x2={14} y2={5} stroke={hidden ? "#9ca3af" : s.color}
                  strokeWidth={2.5} strokeDasharray={s.dash || undefined} strokeLinecap="round" />
                <circle cx={7} cy={5} r={3.5} fill={hidden ? "#9ca3af" : s.color}
                  stroke="white" strokeWidth={1.5} />
              </svg>
              <span className={hidden ? "line-through" : ""}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Collapsible block ─────────────────────────────────────────────────────────
function CollapsibleBlock({
  title, defaultOpen = true, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2/50 transition-colors"
      >
        <span className="font-bold text-ink text-sm">{title}</span>
        <svg
          width={14} height={14} viewBox="0 0 16 16" fill="currentColor"
          className={`text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"/>
        </svg>
      </button>
      {open && <div className="border-t border-border p-5">{children}</div>}
    </div>
  );
}

// ── Freshness breakdown (new vs legacy content) ──────────────────────────────
// Shows where each staff member's views / watch time come from, grouped by the
// month the video was published in. Answers: "Are today's views from freshly
// published videos or the long tail of older content?"
const FRESHNESS_PALETTE = [
  "#10b981", "#3b82f6", "#6366f1", "#8b5cf6",
  "#ec4899", "#f59e0b", "#06b6d4", "#14b8a6",
  "#a855f7", "#f43f5e", "#84cc16", "#6b7280",
];

function FreshnessBreakdown({
  allMetrics, periods, periodLabelMap,
}: {
  allMetrics:     StaffPeriodMetrics[];
  periods:        string[];                 // ascending (oldest → newest)
  periodLabelMap: Map<string, string>;
}) {
  const [mode, setMode] = useState<"views" | "watchTime">("views");

  const getValue = (m: StaffPeriodMetrics) =>
    mode === "views" ? m.weightedViews : m.totalWatchTime;
  const fmt = mode === "views" ? fmtViews : fmtWatchTime;

  // Newest → oldest for stacking & legend order
  const newestFirst = useMemo(() => [...periods].reverse(), [periods]);

  const periodColors = useMemo(() => {
    const map = new Map<string, string>();
    newestFirst.forEach((p, i) => map.set(p, FRESHNESS_PALETTE[i % FRESHNESS_PALETTE.length]));
    return map;
  }, [newestFirst]);

  const latestPeriod = periods[periods.length - 1] ?? "";

  const rows = useMemo(() => {
    const byStaff = new Map<string, StaffPeriodMetrics[]>();
    for (const m of allMetrics) {
      const key = `${m.staffName}::${m.role}`;
      if (!byStaff.has(key)) byStaff.set(key, []);
      byStaff.get(key)!.push(m);
    }
    return [...byStaff.entries()]
      .map(([key, metrics]) => {
        const total = metrics.reduce((s, m) => s + getValue(m), 0);
        const latest = metrics.find(m => m.period === latestPeriod);
        const latestVal = latest ? getValue(latest) : 0;
        return { key, metrics, total, latestVal };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMetrics, mode, latestPeriod]);

  if (rows.length === 0 || periods.length === 0) {
    return (
      <p className="text-sm text-ink-muted py-6 text-center bg-surface-2 rounded-xl">
        Không có dữ liệu để hiển thị.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ink-muted mr-1">Chỉ số:</span>
        {(["views", "watchTime"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              mode === m
                ? "bg-accent text-white border-accent shadow-sm"
                : "bg-surface-2 text-ink-muted border-border hover:text-ink"
            }`}
          >
            {m === "views" ? "Views" : "Giờ xem"}
          </button>
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Mỗi thanh hiển thị tỷ lệ {mode === "views" ? "views" : "giờ xem"} của nhân sự phân bổ
        theo <span className="font-semibold">tháng xuất bản video</span>. Màu xanh lá là tháng mới
        nhất — giúp xác định {mode === "views" ? "views" : "giờ xem"} đến từ video mới làm hay video cũ.
      </p>

      {/* Period color legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs bg-surface-2 rounded-lg p-2.5 border border-border">
        {newestFirst.map((p, idx) => (
          <div key={p} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: periodColors.get(p) }} />
            <span className="text-ink font-medium">{periodLabelMap.get(p) ?? p}</span>
            {idx === 0 && (
              <span className="text-emerald-600 font-bold text-[10px] uppercase tracking-wide">Mới nhất</span>
            )}
          </div>
        ))}
      </div>

      {/* Staff bars */}
      <div className="space-y-3">
        {rows.map(({ key, metrics, total, latestVal }) => {
          const [staffName, role] = key.split("::");
          const sorted = [...metrics].sort((a, b) => b.period.localeCompare(a.period)); // newest first
          const latestPct = total > 0 ? (latestVal / total) * 100 : 0;
          const oldPct    = 100 - latestPct;

          return (
            <div key={key} className="card p-3 border border-border">
              <div className="flex justify-between items-start mb-2 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-sm truncate">{staffName}</p>
                  <p className="text-xs text-ink-muted">{role}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-ink">
                    {fmt(total)} <span className="text-[10px] font-normal text-ink-muted">tổng</span>
                  </p>
                  <p className="text-[11px] mt-0.5">
                    <span className="text-emerald-600 font-bold">{latestPct.toFixed(0)}%</span>
                    <span className="text-ink-muted"> mới · </span>
                    <span className="text-slate-500 font-semibold">{oldPct.toFixed(0)}%</span>
                    <span className="text-ink-muted"> cũ</span>
                  </p>
                </div>
              </div>

              {/* Stacked horizontal bar */}
              <div className="flex h-6 rounded-lg overflow-hidden bg-surface-2 mb-2 border border-border">
                {sorted.map(m => {
                  const val = getValue(m);
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  if (pct < 0.2) return null;
                  return (
                    <div
                      key={m.period}
                      style={{ width: `${pct}%`, backgroundColor: periodColors.get(m.period) }}
                      className="flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                      title={`${periodLabelMap.get(m.period) ?? m.period}: ${fmt(val)} (${pct.toFixed(1)}%) · ${m.videoCount} video`}
                    >
                      {pct >= 10 && `${pct.toFixed(0)}%`}
                    </div>
                  );
                })}
              </div>

              {/* Monthly breakdown grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                {sorted.map(m => {
                  const val = getValue(m);
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  return (
                    <div key={m.period} className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: periodColors.get(m.period) }} />
                      <span className="text-ink-muted truncate">{periodLabelMap.get(m.period) ?? m.period}:</span>
                      <span className="text-ink font-semibold whitespace-nowrap">{fmt(val)}</span>
                      <span className="text-ink-muted whitespace-nowrap">({pct.toFixed(0)}%) · {m.videoCount}v</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trend summary cards ────────────────────────────────────────────────────────
// Trend can be computed against either views or watch-time. The algorithm
// mirrors computeTrends() in analytics.ts — same half-split moving average ratio.
interface LocalTrend {
  staffName:   string;
  role:        string;
  score:       number;
  label:       TrendLabel;
  periodCount: number;
  latestValue: number;
}

function computeLocalTrends(
  allMetrics: StaffPeriodMetrics[],
  getValue:   (m: StaffPeriodMetrics) => number,
): LocalTrend[] {
  const groups = new Map<string, StaffPeriodMetrics[]>();
  for (const m of allMetrics) {
    const key = `${m.staffName}::${m.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const labelOf = (score: number): TrendLabel => {
    if (score >= 1.2) return "rising_strong";
    if (score >= 1.0) return "rising";
    if (score >= 0.8) return "stable";
    if (score >= 0.6) return "declining";
    return "declining_severe";
  };

  const out: LocalTrend[] = [];
  for (const [key, metrics] of groups) {
    const [staffName, role] = key.split("::");
    const sorted      = [...metrics].sort((a, b) => a.period.localeCompare(b.period));
    const values      = sorted.map(getValue);
    const latestValue = values[values.length - 1] ?? 0;
    const periodCount = sorted.length;

    if (sorted.length < 2) {
      out.push({ staffName, role, score: 1, label: "insufficient_data", periodCount, latestValue });
      continue;
    }

    const half      = Math.floor(sorted.length / 2);
    const prevAvg   = avg(values.slice(0, half));
    const recentAvg = avg(values.slice(values.length - half));
    const score     = prevAvg > 0 ? recentAvg / prevAvg : 1;

    out.push({
      staffName, role,
      score:       Math.round(score * 100) / 100,
      label:       labelOf(score),
      periodCount,
      latestValue,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function TrendCards({
  allMetrics, hasWatchTime,
}: {
  allMetrics:   StaffPeriodMetrics[];
  hasWatchTime: boolean;
}) {
  const [mode, setMode] = useState<"views" | "watchTime">("views");

  // Auto-fallback to views if watch time disappears
  const activeMode = mode === "watchTime" && !hasWatchTime ? "views" : mode;

  const trends = useMemo(
    () => computeLocalTrends(
      allMetrics,
      activeMode === "views" ? m => m.weightedViews : m => m.totalWatchTime,
    ),
    [allMetrics, activeMode],
  );

  const fmt       = activeMode === "views" ? fmtViews : fmtWatchTime;
  const unitLabel = activeMode === "views" ? "views"  : "giờ xem";

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ink-muted mr-1">Xu hướng theo:</span>
        {(["views", "watchTime"] as const).map(m => {
          const disabled = m === "watchTime" && !hasWatchTime;
          const isActive = activeMode === m;
          return (
            <button
              key={m}
              onClick={() => !disabled && setMode(m)}
              disabled={disabled}
              title={disabled ? "File upload chưa có cột Thời gian xem (giờ)" : undefined}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isActive
                  ? "bg-accent text-white border-accent shadow-sm"
                  : disabled
                    ? "bg-surface-2 text-ink-muted border-border opacity-50 cursor-not-allowed"
                    : "bg-surface-2 text-ink-muted border-border hover:text-ink"
              }`}
            >
              {m === "views" ? "Views" : "Giờ xem"}
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trends.map(t => {
          const cfg = TREND_CONFIG[t.label];
          return (
            <div key={`${t.staffName}::${t.role}`} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-ink text-sm truncate">{t.staffName}</p>
                <p className="text-xs text-ink-muted">{t.role} · {t.periodCount} tháng</p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                  {cfg.icon} {cfg.label}
                </span>
                <p className="text-xs text-ink-muted mt-1">
                  {fmt(t.latestValue)} {unitLabel} tháng gần nhất
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TrendTab({ allMetrics, trends }: Props) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Periods oldest → newest (sortKeys "000000"… are already alphabetically ordered)
  const { periods, periodLabelMap } = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of allMetrics) seen.set(m.period, m.label);
    const sorted = [...seen.keys()].sort();
    return { periods: sorted, periodLabelMap: seen };
  }, [allMetrics]);

  // Default: only the latest period selected for pie charts
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(() =>
    new Set(periods.length > 0 ? [periods[periods.length - 1]] : [])
  );

  // Keep selectedPeriods valid when periods change (e.g. first load)
  const validSelectedPeriods = useMemo(() => {
    const valid = new Set([...selectedPeriods].filter(p => periods.includes(p)));
    // If nothing selected (e.g. first render), auto-select last period
    if (valid.size === 0 && periods.length > 0) valid.add(periods[periods.length - 1]);
    return valid;
  }, [selectedPeriods, periods]);

  // Staff keys sorted by total views descending (stable color assignment)
  const staffKeys = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of allMetrics) {
      const k = `${m.staffName}::${m.role}`;
      totals.set(k, (totals.get(k) ?? 0) + m.weightedViews);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [allMetrics]);

  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, StaffPeriodMetrics>>();
    for (const m of allMetrics) {
      const key = `${m.staffName}::${m.role}`;
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(m.period, m);
    }
    return map;
  }, [allMetrics]);

  const buildSeries = (getValue: (m: StaffPeriodMetrics) => number): Series[] =>
    staffKeys.map((key, i) => {
      const [staffName] = key.split("::");
      const byPeriod = lookup.get(key)!;
      return {
        key,
        label: staffName,
        color: LINE_COLORS[i % LINE_COLORS.length],
        dash:  LINE_DASHES[i % LINE_DASHES.length],
        data:  periods.map(p => (byPeriod.get(p) ? getValue(byPeriod.get(p)!) : 0)),
      };
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viewsSeries     = useMemo(() => buildSeries(m => m.weightedViews),  [staffKeys, periods, lookup]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revenueSeries   = useMemo(() => buildSeries(m => m.totalRevenue),   [staffKeys, periods, lookup]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watchTimeSeries = useMemo(() => buildSeries(m => m.totalWatchTime), [staffKeys, periods, lookup]);

  const hasRevenue   = revenueSeries.some(s => s.data.some(v => v > 0));
  const hasWatchTime = watchTimeSeries.some(s => s.data.some(v => v > 0));

  // Toggle handlers
  const toggle  = (key: string) => setHiddenKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const showAll = () => setHiddenKeys(new Set());
  const hideAll = () => setHiddenKeys(new Set(staffKeys));

  // Toggle a period in the pie chart selector
  const togglePeriod = (p: string) => {
    setSelectedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(p)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  };
  const selectAllPeriods  = () => setSelectedPeriods(new Set(periods));
  const selectLastPeriod  = () => setSelectedPeriods(new Set(periods.length > 0 ? [periods[periods.length - 1]] : []));

  // Build pie slices for a single period — always shows ALL staff (unaffected by hiddenKeys)
  const buildPeriodSlices = (period: string, series: Series[]): PieSlice[] => {
    const periodIdx = periods.indexOf(period);
    if (periodIdx === -1) return [];
    const total = series.reduce((s, ser) => s + (ser.data[periodIdx] ?? 0), 0);
    if (total === 0) return [];
    return series
      .map(s => {
        const val = s.data[periodIdx] ?? 0;
        return { key: s.key, label: s.label, color: s.color, value: val, percent: total > 0 ? (val / total) * 100 : 0 };
      })
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  // Periods to show in pie charts, in chronological order
  const activePiePeriods = periods.filter(p => validSelectedPeriods.has(p));

  if (periods.length === 0) {
    return <p className="text-sm text-ink-muted text-center py-12">Chưa có dữ liệu tháng nào được lưu.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Views line chart + legend */}
      <CollapsibleBlock title="Views theo thời gian">
        <div className="space-y-5">
          <SeriesLegend
            series={viewsSeries}
            hiddenKeys={hiddenKeys}
            onToggle={toggle}
            onShowAll={showAll}
            onHideAll={hideAll}
          />
          <LineChart
            title=""
            subtitle="Tổng views nhận được (theo trọng số vai trò) của từng nhân sự qua các lịch sử đã lưu."
            periods={periods}
            periodLabels={periodLabelMap}
            series={viewsSeries}
            hiddenKeys={hiddenKeys}
            formatY={fmtViews}
          />
        </div>
      </CollapsibleBlock>

      {/* Revenue line chart */}
      {hasRevenue && (
        <CollapsibleBlock title="Doanh thu theo thời gian">
          <LineChart
            title=""
            subtitle="Tổng doanh thu ước tính (USD) của từng nhân sự qua các lịch sử đã lưu."
            periods={periods}
            periodLabels={periodLabelMap}
            series={revenueSeries}
            hiddenKeys={hiddenKeys}
            formatY={fmtRevenue}
          />
        </CollapsibleBlock>
      )}

      {/* Watch time line chart */}
      {hasWatchTime && (
        <CollapsibleBlock title="Thời gian xem (giờ) theo thời gian">
          <LineChart
            title=""
            subtitle="Tổng thời gian xem (giờ) của từng nhân sự qua các lịch sử đã lưu. Chỉ tính video có dữ liệu watch time."
            periods={periods}
            periodLabels={periodLabelMap}
            series={watchTimeSeries}
            hiddenKeys={hiddenKeys}
            formatY={fmtWatchTime}
          />
        </CollapsibleBlock>
      )}

      {/* Freshness — video mới vs cũ */}
      <CollapsibleBlock title="Phân bổ theo tháng xuất bản — Video mới vs cũ">
        <FreshnessBreakdown
          allMetrics={allMetrics}
          periods={periods}
          periodLabelMap={periodLabelMap}
        />
      </CollapsibleBlock>

      {/* Pie charts section */}
      <CollapsibleBlock title="Tỷ lệ đóng góp theo tháng">
        <div className="space-y-4">
          {/* Period toggle chips */}
          <div>
            <p className="text-xs text-ink-muted mb-2">
              Chọn một hoặc nhiều tháng để xem. Mỗi tháng hiển thị một biểu đồ riêng.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {periods.map(p => {
                const label      = periodLabelMap.get(p) ?? p;
                const short      = label.replace(/^tháng\s*/i, "T").replace(/\/20(\d{2})/, "/$1");
                const isSelected = validSelectedPeriods.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePeriod(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isSelected
                        ? "bg-accent text-white border-accent shadow-sm"
                        : "bg-surface-2 text-ink-muted border-border hover:border-accent/50 hover:text-ink"
                    }`}
                  >
                    {short}
                  </button>
                );
              })}
              <span className="text-border mx-1">|</span>
              <button onClick={selectAllPeriods}
                className="text-xs text-accent font-semibold hover:underline">
                Tất cả
              </button>
              <button onClick={selectLastPeriod}
                className="text-xs text-ink-muted font-semibold hover:text-ink hover:underline">
                Gần nhất
              </button>
            </div>
          </div>

          {/* Pie charts grid */}
          {activePiePeriods.length > 0 && (() => {
            const stacked = activePiePeriods.length >= 3;
            return (
              <div className={`grid gap-4 ${
                activePiePeriods.length === 1 ? "grid-cols-1" :
                activePiePeriods.length === 2 ? "grid-cols-1 md:grid-cols-2" :
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}>
                {activePiePeriods.map(p => {
                  const label         = periodLabelMap.get(p) ?? p;
                  const viewSlices    = buildPeriodSlices(p, viewsSeries);
                  const revSlices     = buildPeriodSlices(p, revenueSeries);
                  const watchSlices   = buildPeriodSlices(p, watchTimeSeries);
                  const pHasRevenue   = revSlices.some(s => s.value > 0);
                  const pHasWatchTime = watchSlices.some(s => s.value > 0);
                  return (
                    <div key={p} className="space-y-4 border border-border rounded-xl p-4">
                      <PieChart
                        title={`Views — ${label}`}
                        slices={viewSlices}
                        formatValue={fmtViews}
                        stacked={stacked}
                      />
                      {hasWatchTime && pHasWatchTime && (
                        <PieChart
                          title={`Thời gian xem — ${label}`}
                          slices={watchSlices}
                          formatValue={fmtWatchTime}
                          stacked={stacked}
                        />
                      )}
                      {hasRevenue && pHasRevenue && (
                        <PieChart
                          title={`Doanh thu — ${label}`}
                          slices={revSlices}
                          formatValue={fmtRevenue}
                          stacked={stacked}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </CollapsibleBlock>

      {/* Trend summary cards */}
      {trends.length > 0 && (
        <CollapsibleBlock title="Xu hướng tổng hợp" defaultOpen={false}>
          <TrendCards allMetrics={allMetrics} hasWatchTime={hasWatchTime} />
        </CollapsibleBlock>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import type { StaffPeriodMetrics, StaffTrend, TrendLabel } from "@/lib/services/analytics";

interface Props {
  allMetrics: StaffPeriodMetrics[];
  trends:     StaffTrend[];
}

// ── Color palette ────────────────────────────────────────────────────────────
const LINE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#8b5cf6", "#06b6d4", "#f97316",
  "#ec4899", "#84cc16",
];

// ── Trend config ─────────────────────────────────────────────────────────────
const TREND_CONFIG: Record<TrendLabel, { label: string; badge: string; icon: string }> = {
  rising_strong:     { label: "Tăng mạnh",   badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "↑↑" },
  rising:            { label: "Tăng",         badge: "bg-green-50 text-green-600 border-green-200",        icon: "↑"  },
  stable:            { label: "Ổn định",      badge: "bg-slate-100 text-slate-600 border-slate-200",       icon: "→"  },
  declining:         { label: "Giảm",         badge: "bg-amber-50 text-amber-600 border-amber-200",        icon: "↓"  },
  declining_severe:  { label: "Giảm mạnh",    badge: "bg-red-50 text-red-600 border-red-200",              icon: "↓↓" },
  insufficient_data: { label: "Chưa đủ data", badge: "bg-slate-50 text-slate-400 border-slate-200",        icon: "–"  },
};

function formatPeriod(p: string) {
  // "2024-03" → "T3/24"
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

// ── SVG Line Chart ────────────────────────────────────────────────────────────
interface Series {
  key:   string;
  label: string;
  color: string;
  data:  number[]; // one value per period index
}

interface TooltipState {
  svgX: number;
  svgY: number;
  text: string;
}

// Different dash patterns so overlapping lines stay visually distinct
const LINE_DASHES = ["", "7 3", "2 3", "9 3 2 3", "14 4", "3 2 10 2"];

const W = 680, H = 240;
const PAD = { top: 20, right: 20, bottom: 44, left: 64 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

function LineChart({
  periods,
  series,
  formatY,
  noDataMsg,
}: {
  periods:    string[];
  series:     Series[];
  formatY:    (v: number) => string;
  noDataMsg?: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const activeSeries = series.filter(s => s.data.some(v => v > 0));

  if (activeSeries.length === 0 || periods.length < 2) {
    return (
      <p className="text-sm text-ink-muted py-6 text-center">
        {noDataMsg ?? "Không có dữ liệu."}
      </p>
    );
  }

  const maxVal = Math.max(...activeSeries.flatMap(s => s.data), 1);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    frac: f,
    val:  Math.round(maxVal * f * 100) / 100,
    y:    PAD.top + chartH * (1 - f),
  }));

  const xStep = periods.length > 1 ? chartW / (periods.length - 1) : chartW;
  const px = (i: number) => PAD.left + i * xStep;
  const py = (v: number) => PAD.top + chartH * (1 - v / maxVal);

  return (
    <div className="overflow-x-auto">
      {/* relative wrapper so HTML tooltip is positioned within the chart area */}
      <div className="relative" style={{ width: W, minWidth: 400 }}>
        <svg width={W} height={H} style={{ display: "block" }}>
          {/* Y gridlines + labels */}
          {yTicks.map(t => (
            <g key={t.frac}>
              <line
                x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
                stroke="#e5e7eb" strokeWidth={1}
                strokeDasharray={t.frac === 0 ? undefined : "4 3"}
              />
              <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
                {formatY(t.val)}
              </text>
            </g>
          ))}

          {/* X axis labels + tick marks */}
          {periods.map((p, i) => (
            <g key={p}>
              <line
                x1={px(i)} y1={PAD.top + chartH}
                x2={px(i)} y2={PAD.top + chartH + 4}
                stroke="#d1d5db" strokeWidth={1}
              />
              <text x={px(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#6b7280">
                {formatPeriod(p)}
              </text>
            </g>
          ))}

          {/* Lines per series (drawn first so dots sit on top) */}
          {activeSeries.map((s, si) => {
            const dash = LINE_DASHES[si % LINE_DASHES.length];
            const pts  = s.data.map((v, i) => ({ x: px(i), y: py(v), v, i }));

            // Split into connected segments (skip 0-value gaps)
            const segments: Array<typeof pts> = [];
            let seg: typeof pts = [];
            for (const pt of pts) {
              if (pt.v > 0) { seg.push(pt); }
              else          { if (seg.length) { segments.push(seg); seg = []; } }
            }
            if (seg.length) segments.push(seg);

            return (
              <g key={s.key}>
                {segments.filter(sg => sg.length >= 2).map((sg, segi) => (
                  <polyline
                    key={segi}
                    points={sg.map(p => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeDasharray={dash || undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                ))}
              </g>
            );
          })}

          {/* Dots — drawn on top of lines, with large transparent hit area */}
          {activeSeries.map((s, si) => {
            const pts = s.data.map((v, i) => ({ x: px(i), y: py(v), v, i }));
            return (
              <g key={`dots-${s.key}`}>
                {pts.map(pt => pt.v > 0 && (
                  <g key={pt.i}>
                    {/* Large transparent hit target — avoids tooltip flicker */}
                    <circle
                      cx={pt.x} cy={pt.y} r={12}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setTooltip({
                        svgX: pt.x,
                        svgY: pt.y,
                        text: `${s.label} · ${formatPeriod(periods[pt.i])}: ${formatY(pt.v)}`,
                      })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    {/* Visible dot — no pointer events so it doesn't fight the hit target */}
                    <circle
                      cx={pt.x} cy={pt.y} r={si === 0 ? 4.5 : 4}
                      fill={s.color}
                      stroke="white"
                      strokeWidth={2}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>

        {/* HTML tooltip — reliably positioned, never intercepted by SVG elements */}
        {tooltip && (() => {
          const tipAbove = tooltip.svgY > PAD.top + 44;
          return (
            <div
              className="absolute pointer-events-none z-20 bg-gray-900 text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap"
              style={{
                left:      tooltip.svgX,
                top:       tipAbove ? tooltip.svgY - 38 : tooltip.svgY + 14,
                transform: "translateX(-50%)",
              }}
            >
              {tooltip.text}
              {/* Arrow */}
              <span
                className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
                style={tipAbove
                  ? { top: "100%", borderTopColor: "#111827" }
                  : { bottom: "100%", borderBottomColor: "#111827" }
                }
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────
function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
      {series.map(s => (
        <div key={s.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <svg width={20} height={10}>
            <line x1={0} y1={5} x2={14} y2={5} stroke={s.color} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={7} cy={5} r={3.5} fill={s.color} stroke="white" strokeWidth={1.5} />
          </svg>
          {s.label}
        </div>
      ))}
    </div>
  );
}

// ── Trend summary cards ───────────────────────────────────────────────────────
function TrendCards({ trends }: { trends: StaffTrend[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {trends.map(t => {
        const cfg = TREND_CONFIG[t.label];
        const periodCount = t.periods.length;
        const latestViews = t.periods[t.periods.length - 1]?.weightedViews ?? 0;
        return (
          <div key={`${t.staffName}::${t.role}`} className="card p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink text-sm truncate">{t.staffName}</p>
              <p className="text-xs text-ink-muted">{t.role} · {periodCount} tháng</p>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                {cfg.icon} {cfg.label}
              </span>
              <p className="text-xs text-ink-muted mt-1">
                {fmtViews(latestViews)} views tháng gần nhất
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TrendTab({ allMetrics, trends }: Props) {
  // Sorted periods oldest → newest (left to right on chart)
  const periods = useMemo(
    () => [...new Set(allMetrics.map(m => m.period))].sort(),
    [allMetrics],
  );

  // Unique staff keys + color assignment
  const staffKeys = useMemo(
    () => [...new Set(allMetrics.map(m => `${m.staffName}::${m.role}`))],
    [allMetrics],
  );

  // Build a lookup: staffKey → period → metrics
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
        data:  periods.map(p => {
          const m = byPeriod.get(p);
          return m ? getValue(m) : 0;
        }),
      };
    });

  const revenueSeries = useMemo(() => buildSeries(m => m.totalRevenue),  [staffKeys, periods, lookup]);
  const viewsSeries   = useMemo(() => buildSeries(m => m.weightedViews), [staffKeys, periods, lookup]);

  const hasRevenue = revenueSeries.some(s => s.data.some(v => v > 0));

  return (
    <div className="space-y-8">
      {/* Revenue line chart — only shown when data exists */}
      {hasRevenue && (
        <div className="card p-5">
          <h2 className="text-base font-bold text-ink mb-1">Doanh thu theo thời gian</h2>
          <p className="text-xs text-ink-muted mb-4">
            Doanh thu ước tính (USD) của từng nhân sự qua các tháng.
          </p>
          <LineChart
            periods={periods}
            series={revenueSeries}
            formatY={fmtRevenue}
          />
          <Legend series={revenueSeries.filter(s => s.data.some(v => v > 0))} />
        </div>
      )}

      {/* Views line chart */}
      <div className="card p-5">
        <h2 className="text-base font-bold text-ink mb-1">Views theo thời gian</h2>
        <p className="text-xs text-ink-muted mb-4">
          Lượt views nhận được (theo trọng số vai trò) của từng nhân sự qua các tháng.
        </p>
        <LineChart
          periods={periods}
          series={viewsSeries}
          formatY={fmtViews}
        />
        <Legend series={viewsSeries} />
      </div>

      {/* Trend summary */}
      <div>
        <h2 className="text-base font-bold text-ink mb-3">Xu hướng tổng hợp</h2>
        <TrendCards trends={trends} />
      </div>
    </div>
  );
}

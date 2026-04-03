import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";

// ── Tour step definitions ────────────────────────────────────────────────────

interface TourStepDef {
  target:      string;          // data-tour attribute value
  title:       string;
  description: string;
  icon:        string;
  tip?:        string;
  position:    "bottom" | "top" | "bottom-right";
}

const TOUR_STEPS: TourStepDef[] = [
  {
    target:      "channel-selector",
    title:       "Bước 1: Tạo kênh YouTube",
    description: "Bấm vào đây để tạo kênh mới hoặc chọn kênh. Mỗi kênh lưu dữ liệu riêng — bạn có thể quản lý nhiều kênh cùng lúc.",
    icon:        "📺",
    tip:         "Hệ thống đã tạo sẵn \"Kênh mặc định\". Đổi tên hoặc tạo thêm kênh mới tùy ý.",
    position:    "bottom",
  },
  {
    target:      "upload-zone",
    title:       "Bước 2: Upload file Views",
    description: "Upload file .xlsx bạn tải từ YouTube Studio (Analytics → Content → Export). Hệ thống sẽ tự nhận diện các cột cần thiết.",
    icon:        "📊",
    tip:         "YouTube Studio → Analytics → Nội dung → bấm ↓ Export → chọn .xlsx",
    position:    "top",
  },
  {
    target:      "tab-salary",
    title:       "Bước 3: Import nhân sự",
    description: "Sau khi upload views, bước tiếp theo là import bảng tiến độ công việc. Hệ thống tự lọc Video ID theo từng nhân sự và import luôn — không cần qua tab Lọc Video ID.",
    icon:        "👥",
    tip:         "File cần có cột \"Video ID\" + \"Tên Người Làm\". Vai trò tự suy từ prefix: ED = Editor, CT = Content.",
    position:    "bottom",
  },
  {
    target:      "step-indicators",
    title:       "Bước 4: Tính kết quả",
    description: "Sau khi import nhân sự và kiểm tra tỷ trọng, bấm \"Tính kết quả\". Hệ thống phân bổ views theo vai trò và số người cùng làm video.",
    icon:        "🧮",
    tip:         "Có thể export ra Excel, lọc theo số người, và xem công thức chi tiết mỗi video.",
    position:    "bottom",
  },
  {
    target:      "subtab-history",
    title:       "Bước 5: Lưu lịch sử",
    description: "Sau khi tính xong, bấm \"Lưu tháng này\" và điền tên tháng (VD: Tháng 3/2026). Mỗi tháng upload → tính → lưu. Khi có ≥ 2 tháng, tab Analytics sẽ hiển thị xu hướng.",
    icon:        "💾",
    tip:         "Tab Lịch sử cho phép xem lại, sắp xếp, và load lại bất kỳ tháng nào đã lưu.",
    position:    "bottom",
  },
];

const STORAGE_KEY = "yt_tracker_tour_done";
const TOOLTIP_W = 370;

// ── Tooltip positioning ──────────────────────────────────────────────────────

interface TooltipPos {
  top:       number;
  left:      number;
  arrowLeft: number;
  arrowDir:  "up" | "down";
}

function computePosition(
  targetRect: DOMRect,
  tooltipH: number,
  position: TourStepDef["position"],
): TooltipPos {
  const gap = 14;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const tw  = Math.min(TOOLTIP_W, vw - 24);

  let top: number;
  let arrowDir: "up" | "down";

  if (position === "top") {
    top = targetRect.top - tooltipH - gap;
    arrowDir = "down";
    // Flip if goes above screen
    if (top < 12) {
      top = targetRect.bottom + gap;
      arrowDir = "up";
    }
  } else {
    // bottom / bottom-right
    top = targetRect.bottom + gap;
    arrowDir = "up";
    // Flip if goes below screen
    if (top + tooltipH > vh - 12) {
      top = targetRect.top - tooltipH - gap;
      arrowDir = "down";
    }
  }

  // Horizontal: center on target, clamp to viewport
  let left = position === "bottom-right"
    ? targetRect.right - tw
    : targetRect.left + targetRect.width / 2 - tw / 2;
  left = Math.max(12, Math.min(left, vw - tw - 12));

  // Arrow horizontal: point at target center
  let arrowLeft = targetRect.left + targetRect.width / 2 - left;
  arrowLeft = Math.max(24, Math.min(arrowLeft, tw - 24));

  return { top, left, arrowLeft, arrowDir };
}

// ── Tooltip card (shared between anchored and floating) ──────────────────────

function TooltipCard({
  step, total, current, isFirst, isLast,
  onPrev, onNext, onClose, onGoTo,
}: {
  step: number; total: number; current: TourStepDef;
  isFirst: boolean; isLast: boolean;
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onGoTo: (i: number) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-surface-2">
        <div
          className="h-full bg-accent rounded-r-full transition-all duration-500"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-lg flex-shrink-0">
              {current.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-accent">{step + 1}/{total}</p>
              <h3 className="text-base font-bold text-ink leading-tight">{current.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-ink-secondary leading-relaxed mb-3">{current.description}</p>

        {/* Tip */}
        {current.tip && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-4">
            <span className="font-semibold">💡</span> {current.tip}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                onClick={() => onGoTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-5 bg-accent"
                  : i < step ? "w-1.5 bg-accent/40"
                  : "w-1.5 bg-border-strong"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {!isFirst && (
              <button
                onClick={onPrev}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary border border-border hover:border-border-strong transition-all"
              >
                ←
              </button>
            )}
            <button
              onClick={onNext}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-dim transition-all shadow-sm active:scale-[0.97]"
            >
              {isLast ? "Hoàn tất ✓" : "Tiếp →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function TourGuide({ onClose }: Props) {
  const [step,       setStep]       = useState(0);
  const [pos,        setPos]        = useState<TooltipPos | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const total   = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];
  const isLast  = step === total - 1;
  const isFirst = step === 0;
  const hasTarget = targetRect !== null;

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  }, [onClose]);

  const handleNext = () => { isLast ? handleClose() : setStep((s) => s + 1); };
  const handlePrev = () => { if (!isFirst) setStep((s) => s - 1); };

  // Find target and compute position
  const updatePosition = useCallback(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setTargetRect(null);
      setPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);
    const th = tooltipRef.current?.offsetHeight ?? 240;
    setPos(computePosition(rect, th, current.position));
  }, [current]);

  useLayoutEffect(() => {
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [updatePosition]);

  // Refine after render
  useLayoutEffect(() => {
    if (!tooltipRef.current || !targetRect) return;
    const th = tooltipRef.current.offsetHeight;
    setPos(computePosition(targetRect, th, current.position));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetRect]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && !isFirst) setStep((s) => s - 1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose, isLast, isFirst]);

  // Scroll target into view
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [current.target]);

  const cardProps = {
    step, total, current, isFirst, isLast,
    onPrev: handlePrev, onNext: handleNext, onClose: handleClose,
    onGoTo: setStep,
  };

  // ── No target found → centered floating card ──────────────────────────────
  if (!hasTarget) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/35 animate-fade" onClick={handleClose} />
        <div
          className="fixed z-[52] tour-tooltip"
          style={{
            top:  "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: Math.min(TOOLTIP_W, window.innerWidth - 24),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <TooltipCard {...cardProps} />
        </div>
      </>
    );
  }

  // ── Target found → anchored tooltip with spotlight ─────────────────────────
  const tw = Math.min(TOOLTIP_W, window.innerWidth - 24);

  return (
    <>
      {/* Overlay with cutout */}
      <div
        className="fixed inset-0 z-50 animate-fade"
        onClick={handleClose}
        style={{
          background: "rgba(0,0,0,0.35)",
          clipPath: `polygon(
            evenodd,
            0 0, 100% 0, 100% 100%, 0 100%, 0 0,
            ${targetRect.left - 8}px ${targetRect.top - 8}px,
            ${targetRect.right + 8}px ${targetRect.top - 8}px,
            ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
            ${targetRect.left - 8}px ${targetRect.bottom + 8}px
          )`,
        }}
      />

      {/* Spotlight ring */}
      <div
        className="fixed z-[51] pointer-events-none rounded-xl border-2 border-accent/50"
        style={{
          top:    targetRect.top - 8,
          left:   targetRect.left - 8,
          width:  targetRect.width + 16,
          height: targetRect.height + 16,
          boxShadow: "0 0 0 4px rgba(59,130,246,0.12), 0 0 20px 0 rgba(59,130,246,0.08)",
          transition: "top 0.35s cubic-bezier(0.16,1,0.3,1), left 0.35s cubic-bezier(0.16,1,0.3,1), width 0.35s, height 0.35s",
        }}
      />

      {/* Tooltip */}
      {pos && (
        <div
          ref={tooltipRef}
          className="fixed z-[52] tour-tooltip"
          style={{
            top:  pos.top,
            left: pos.left,
            width: tw,
            transition: "top 0.35s cubic-bezier(0.16,1,0.3,1), left 0.35s cubic-bezier(0.16,1,0.3,1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div
            className="absolute w-3 h-3 bg-white rotate-45 border border-border z-10"
            style={{
              left: pos.arrowLeft - 6,
              ...(pos.arrowDir === "up"
                ? { top: -7, borderRight: "none", borderBottom: "none" }
                : { bottom: -7, borderLeft: "none", borderTop: "none" }),
            }}
          />
          <TooltipCard {...cardProps} />
        </div>
      )}
    </>
  );
}

/** Check if user has completed the tour before */
export function isTourCompleted(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

/** Reset tour so it shows again */
export function resetTour(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

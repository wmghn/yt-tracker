import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";

// ── Tour step definitions ────────────────────────────────────────────────────

interface TourStepDef {
  target:      string;          // data-tour attribute value
  title:       string;
  description: string;
  icon:        string;
  tip?:        string;
  position:    "bottom" | "top" | "left" | "right" | "bottom-right";
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
    target:      "tab-salary",
    title:       "Bước 2: Upload file Views",
    description: "Vào tab \"Tính views\" → Upload file .xlsx bạn tải từ YouTube Studio (Analytics → Content → Export).",
    icon:        "📊",
    tip:         "YouTube Studio → Analytics → Nội dung → bấm ↓ Export → chọn .xlsx",
    position:    "bottom",
  },
  {
    target:      "upload-zone",
    title:       "Bước 3: Import nhân sự",
    description: "Sau khi upload views, ở bước tiếp theo bạn sẽ import bảng tiến độ công việc. Hệ thống tự lọc Video ID theo từng nhân sự và import luôn.",
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

// ── Tooltip positioning ──────────────────────────────────────────────────────

interface TooltipPos {
  top:       number;
  left:      number;
  arrowTop:  number;
  arrowLeft: number;
  arrowDir:  "up" | "down" | "left" | "right";
}

function computePosition(
  targetRect: DOMRect,
  tooltipW: number,
  tooltipH: number,
  position: TourStepDef["position"],
): TooltipPos {
  const gap = 14;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  let top  = 0;
  let left = 0;
  let arrowDir: TooltipPos["arrowDir"] = "up";

  if (position === "bottom" || position === "bottom-right") {
    top  = targetRect.bottom + gap;
    left = position === "bottom-right"
      ? targetRect.right - tooltipW
      : targetRect.left + targetRect.width / 2 - tooltipW / 2;
    arrowDir = "up";
  } else if (position === "top") {
    top  = targetRect.top - tooltipH - gap;
    left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    arrowDir = "down";
  } else if (position === "right") {
    top  = targetRect.top + targetRect.height / 2 - tooltipH / 2;
    left = targetRect.right + gap;
    arrowDir = "left";
  } else if (position === "left") {
    top  = targetRect.top + targetRect.height / 2 - tooltipH / 2;
    left = targetRect.left - tooltipW - gap;
    arrowDir = "right";
  }

  // Clamp within viewport
  left = Math.max(12, Math.min(left, vw - tooltipW - 12));
  top  = Math.max(12, Math.min(top, vh - tooltipH - 12));

  // If tooltip was pushed below screen, flip to top
  if (position === "bottom" && top + tooltipH > vh - 12) {
    top = targetRect.top - tooltipH - gap;
    arrowDir = "down";
  }

  // Arrow points at center of target
  let arrowLeft = targetRect.left + targetRect.width / 2 - left;
  arrowLeft = Math.max(20, Math.min(arrowLeft, tooltipW - 20));
  let arrowTop = arrowDir === "up" ? -6 : arrowDir === "down" ? tooltipH - 1 : targetRect.top + targetRect.height / 2 - top;

  return { top, left, arrowTop, arrowLeft, arrowDir };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function TourGuide({ onClose }: Props) {
  const [step,    setStep]    = useState(0);
  const [pos,     setPos]     = useState<TooltipPos | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const total   = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];
  const isLast  = step === total - 1;
  const isFirst = step === 0;

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  }, [onClose]);

  // Find target element and compute tooltip position
  const updatePosition = useCallback(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setTargetRect(null);
      setPos(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    // Add spotlight class
    el.classList.add("tour-spotlight");

    const tw = Math.min(380, window.innerWidth - 24);
    // Estimate tooltip height (will refine in layout effect)
    const th = tooltipRef.current?.offsetHeight ?? 220;
    setPos(computePosition(rect, tw, th, current.position));
  }, [current]);

  // Recalc on step change and scroll/resize
  useLayoutEffect(() => {
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      // Remove spotlight from all elements
      document.querySelectorAll(".tour-spotlight").forEach((el) =>
        el.classList.remove("tour-spotlight")
      );
    };
  }, [updatePosition]);

  // Refine position after tooltip renders
  useLayoutEffect(() => {
    if (!tooltipRef.current || !targetRect) return;
    const tw = tooltipRef.current.offsetWidth;
    const th = tooltipRef.current.offsetHeight;
    setPos(computePosition(targetRect, tw, th, current.position));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetRect]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && !isFirst) setStep((s) => s - 1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose, isLast, isFirst]);

  const handleNext = () => {
    if (isLast) handleClose();
    else setStep((s) => s + 1);
  };

  const handlePrev = () => {
    if (!isFirst) setStep((s) => s - 1);
  };

  // Scroll target into view
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [current.target]);

  return (
    <>
      {/* Overlay — click to close */}
      <div
        className="fixed inset-0 z-50 animate-fade"
        onClick={handleClose}
        style={{
          background: "rgba(0,0,0,0.35)",
          // Cut out the spotlight area
          ...(targetRect && {
            clipPath: `polygon(
              0% 0%, 0% 100%, 100% 100%, 100% 0%,
              0% 0%,
              ${targetRect.left - 6}px ${targetRect.top - 6}px,
              ${targetRect.left - 6}px ${targetRect.bottom + 6}px,
              ${targetRect.right + 6}px ${targetRect.bottom + 6}px,
              ${targetRect.right + 6}px ${targetRect.top - 6}px,
              ${targetRect.left - 6}px ${targetRect.top - 6}px,
              0% 0%
            )`,
          }),
        }}
      />

      {/* Spotlight ring around target */}
      {targetRect && (
        <div
          className="fixed z-[51] pointer-events-none rounded-xl border-2 border-accent/60"
          style={{
            top:    targetRect.top - 6,
            left:   targetRect.left - 6,
            width:  targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: "0 0 0 4px rgba(59,130,246,0.15)",
            transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      )}

      {/* Tooltip card */}
      {pos && (
        <div
          ref={tooltipRef}
          className="fixed z-[52] tour-tooltip"
          style={{
            top:   pos.top,
            left:  pos.left,
            width: Math.min(380, window.innerWidth - 24),
            transition: "top 0.3s cubic-bezier(0.16,1,0.3,1), left 0.3s cubic-bezier(0.16,1,0.3,1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div
            className="absolute w-3 h-3 bg-white rotate-45 border border-border"
            style={{
              left: pos.arrowLeft - 6,
              ...(pos.arrowDir === "up"
                ? { top: -7, borderRight: "none", borderBottom: "none" }
                : pos.arrowDir === "down"
                ? { bottom: -7, borderLeft: "none", borderTop: "none" }
                : {}),
            }}
          />

          {/* Card body */}
          <div className="bg-white rounded-2xl border border-border shadow-xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-surface-2">
              <div
                className="h-full bg-accent rounded-r-full transition-all duration-500"
                style={{ width: `${((step + 1) / total) * 100}%` }}
              />
            </div>

            <div className="p-5">
              {/* Header row */}
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
                  onClick={handleClose}
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

              {/* Footer: dots + buttons */}
              <div className="flex items-center justify-between">
                {/* Step dots */}
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setStep(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step
                          ? "w-5 bg-accent"
                          : i < step
                          ? "w-1.5 bg-accent/40"
                          : "w-1.5 bg-border-strong"
                      }`}
                    />
                  ))}
                </div>

                {/* Nav buttons */}
                <div className="flex gap-1.5">
                  {!isFirst && (
                    <button
                      onClick={handlePrev}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary border border-border hover:border-border-strong transition-all"
                    >
                      ←
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-dim transition-all shadow-sm active:scale-[0.97]"
                  >
                    {isLast ? "Hoàn tất ✓" : "Tiếp →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
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

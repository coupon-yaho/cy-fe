import { Link } from "@tanstack/react-router";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { LiveLabel } from "@/components/coupon/section-head";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatClock, formatDateTime } from "@/components/coupon/timer";
import {
  ROUND_STATUS_LABEL,
  brandOf,
  discountDetail,
  discountHeadline,
  gradesLabel,
  remainingStock,
  type CouponRoundView,
  type MembershipGrade,
} from "@/lib/coupon";

/**
 * 회차 하나를 카드로.
 *
 * 할인율이 카드에서 가장 큰 글자입니다. 회차 이름보다 할인율이 먼저 읽혀야
 * 카드 여섯 장을 훑을 때 비교가 됩니다 — 이름은 비교 대상이 아닙니다.
 */
export function RoundCard({
  round,
  grade,
}: {
  round: CouponRoundView;
  grade?: MembershipGrade | null;
}) {
  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);
  const eligible = !grade || round.eligibleGrades.includes(grade);
  const soldOut = remaining <= 0;
  const closed = soldOut || round.status === "CLOSED";

  return (
    <Link
      to="/events/$couponRoundId"
      params={{ couponRoundId: String(round.id) }}
      className={`yh-card yh-card-hover group relative flex flex-col overflow-hidden p-6 ${
        closed ? "saturate-[0.2]" : ""
      }`}
    >
      {/* 왼쪽 브랜드 레일 — 카드 그리드에서 색으로 먼저 찾습니다 */}
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: closed ? "var(--yh-rule)" : brand.hue }}
        aria-hidden
      />

      {soldOut && (
        <span
          className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 -rotate-12 rounded-md border-[3px] border-yh-ink-3/50 px-2.5 py-1 text-[0.9375rem] font-extrabold tracking-[0.16em] text-yh-ink-3/60"
          aria-hidden
        >
          SOLD OUT
        </span>
      )}
      <div className="flex items-center justify-between gap-3">
        {round.status === "OPEN" ? (
          <span className="flex items-center gap-2.5">
            <LiveLabel />
            {round.queueActive && <span className="yh-small text-yh-ink-3">대기열</span>}
          </span>
        ) : (
          <span className="yh-label">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
        <span className="yh-num yh-small text-yh-ink-3">
          {formatClock(round.openAt)} – {formatClock(round.closeAt)}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BrandPlate brandId={round.brandId} size="md" />
        <div className="min-w-0">
          <p className="yh-small text-yh-ink-3">
            {brand.name} · {brand.category}
          </p>
          <p className="yh-body truncate font-bold">{round.name}</p>
        </div>
      </div>

      <p className="yh-figure-sm mt-7 text-[2.25rem] leading-none">{discountHeadline(round)}</p>
      <p className="yh-small mt-2 text-yh-ink-2">{discountDetail(round)}</p>

      <div className="mt-7">
        {round.status === "SCHEDULED" ? (
          <p className="yh-small text-yh-ink-3">
            오픈까지{" "}
            <Countdown
              target={Date.parse(round.openAt)}
              className="yh-num font-bold text-yh-navy"
            />
          </p>
        ) : (
          <StockGauge remaining={remaining} total={round.totalQuantity} />
        )}
      </div>

      <div className="yh-small mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-yh-rule pt-5 text-yh-ink-3">
        <span
          className={
            eligible ? undefined : "inline-flex items-center gap-1.5 font-bold text-yh-ink-2"
          }
        >
          {!eligible && <LockGlyph />}
          {eligible
            ? gradesLabel(round.eligibleGrades)
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </span>
        {round.status === "OPEN" && !soldOut && (
          <span>
            마감 <Countdown target={Date.parse(round.closeAt)} className="yh-num font-bold" />
          </span>
        )}
        {round.status === "CLOSED" && <span>{soldOut ? "품절" : "마감"}</span>}
        {round.status === "SCHEDULED" && (
          <span className="yh-num">{formatDateTime(round.openAt)}</span>
        )}
      </div>
    </Link>
  );
}

/**
 * 일정 한 줄 — 시간 순으로 늘어놓을 때.
 *
 * 신문 편성표처럼 괘선으로만 나눕니다. 줄마다 카드를 두면 스무 줄에서 지면이 무너집니다.
 */
export function RoundRow({
  round,
  grade,
}: {
  round: CouponRoundView;
  grade?: MembershipGrade | null;
}) {
  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);
  const eligible = !grade || round.eligibleGrades.includes(grade);

  return (
    <Link
      to="/events/$couponRoundId"
      params={{ couponRoundId: String(round.id) }}
      className="group -mx-3 grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-5 gap-y-1 rounded-xl border-b border-yh-rule px-3 py-5 transition-colors last:border-b-0 hover:bg-yh-paper sm:grid-cols-[104px_auto_1fr_auto_136px_auto]"
    >
      <span className="yh-num yh-small font-semibold text-yh-ink-2">
        {formatClock(round.openAt)}
        <span className="hidden font-normal text-yh-ink-3 sm:inline">
          {" "}
          – {formatClock(round.closeAt)}
        </span>
      </span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <span className="min-w-0">
        <span className="yh-sub block truncate">{round.name}</span>
        <span className="yh-small block truncate text-yh-ink-3">
          {brand.name} ·{" "}
          {eligible
            ? gradesLabel(round.eligibleGrades)
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </span>
      </span>

      <span className="yh-figure-sm text-[1.375rem] whitespace-nowrap">
        {discountHeadline(round)}
      </span>

      <span className="hidden sm:block">
        {round.status === "SCHEDULED" ? (
          <span className="yh-num yh-small text-yh-ink-3">
            <Countdown target={Date.parse(round.openAt)} /> 후
          </span>
        ) : (
          <StockGauge remaining={remaining} total={round.totalQuantity} label={false} />
        )}
      </span>

      <span className="justify-self-end">
        {round.status === "OPEN" ? (
          <span className="flex items-center gap-2.5">
            <LiveLabel />
            {round.queueActive && <span className="yh-small text-yh-ink-3">대기열</span>}
          </span>
        ) : (
          <span className="yh-label">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
      </span>
    </Link>
  );
}

/** 등급 미달 표시 — 색만으로 알리지 않도록 모양을 함께 씁니다 */
function LockGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
      <path d="M5.75 7V5a2.25 2.25 0 0 1 4.5 0v2" />
    </svg>
  );
}

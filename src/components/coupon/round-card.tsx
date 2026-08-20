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

/** 회차 하나를 카드로. 크기가 큰 쪽이 지금 눌러야 하는 것입니다. */
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

  return (
    <Link
      to="/events/$couponRoundId"
      params={{ couponRoundId: String(round.id) }}
      className="surface-card group flex flex-col p-6 transition-colors hover:bg-white/70"
    >
      <div className="flex items-center justify-between gap-3">
        {round.status === "OPEN" ? (
          <span className="flex items-center gap-2">
            <LiveLabel />
            {round.queueActive && <span className="t-caption text-hig-muted">대기열</span>}
          </span>
        ) : (
          <span className="t-caption font-semibold text-hig-muted">
            {ROUND_STATUS_LABEL[round.status]}
          </span>
        )}
        <span className="num t-caption text-hig-muted">
          {formatClock(round.openAt)} – {formatClock(round.closeAt)}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BrandPlate brandId={round.brandId} size="md" />
        <div className="min-w-0">
          <p className="t-body-sm text-hig-muted">
            {brand.name} · {brand.category}
          </p>
          <p className="t-body truncate font-semibold">{round.name}</p>
        </div>
      </div>

      <p className="t-tile mt-7">{discountHeadline(round)}</p>
      <p className="t-body-sm mt-1 text-hig-secondary">{discountDetail(round)}</p>

      <div className="mt-7">
        {round.status === "SCHEDULED" ? (
          <p className="t-body-sm text-hig-muted">
            오픈까지 <Countdown target={Date.parse(round.openAt)} className="text-hig-fg" />
          </p>
        ) : (
          <StockGauge remaining={remaining} total={round.totalQuantity} />
        )}
      </div>

      <div className="t-body-sm mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-hig-muted">
        <span className={eligible ? undefined : "font-semibold text-hig-secondary"}>
          {eligible
            ? gradesLabel(round.eligibleGrades)
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </span>
        {round.status === "OPEN" && !soldOut && (
          <span>
            마감 <Countdown target={Date.parse(round.closeAt)} className="num" />
          </span>
        )}
        {round.status === "CLOSED" && <span>{soldOut ? "품절" : "마감"}</span>}
        {round.status === "SCHEDULED" && (
          <span className="num">{formatDateTime(round.openAt)}</span>
        )}
      </div>
    </Link>
  );
}

/** 일정 한 줄 — 시간 순으로 늘어놓을 때. */
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
      className="hairline-row grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-4 gap-y-1 py-4 transition-opacity hover:opacity-70 sm:grid-cols-[96px_auto_1fr_auto_128px_auto]"
    >
      <span className="num t-body-sm text-hig-secondary">
        {formatClock(round.openAt)}
        <span className="hidden text-hig-muted sm:inline"> – {formatClock(round.closeAt)}</span>
      </span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <span className="min-w-0">
        <span className="t-body block truncate font-semibold">{round.name}</span>
        <span className="t-body-sm block truncate text-hig-muted">
          {brand.name} ·{" "}
          {eligible
            ? gradesLabel(round.eligibleGrades)
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </span>
      </span>

      <span className="t-body font-semibold">{discountHeadline(round)}</span>

      <span className="hidden sm:block">
        {round.status === "SCHEDULED" ? (
          <span className="num t-body-sm text-hig-muted">
            <Countdown target={Date.parse(round.openAt)} /> 후
          </span>
        ) : (
          <StockGauge remaining={remaining} total={round.totalQuantity} label={false} />
        )}
      </span>

      <span className="justify-self-end">
        {round.status === "OPEN" ? (
          <span className="flex items-center gap-2">
            <LiveLabel />
            {round.queueActive && <span className="t-caption text-hig-muted">대기열</span>}
          </span>
        ) : (
          <span className="t-caption text-hig-muted">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
      </span>
    </Link>
  );
}

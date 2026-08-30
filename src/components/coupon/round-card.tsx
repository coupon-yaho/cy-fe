import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
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
            <span className="yh-small text-yh-ink-3">입장 시 확인</span>
          </span>
        ) : (
          <span className="yh-label">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
        <span className="yh-num yh-small text-yh-ink-3">
          {formatClock(round.openAt)}-{formatClock(round.closeAt)}
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
          {!eligible && <Lock className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />}
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
  const soldOutRow = remaining <= 0;
  const urgentRow = !soldOutRow && remaining / round.totalQuantity <= 0.1;

  return (
    <Link
      to="/events/$couponRoundId"
      params={{ couponRoundId: String(round.id) }}
      className="group -mx-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 rounded-xl border-b border-yh-rule px-3 py-4 transition-colors last:border-b-0 hover:bg-yh-paper sm:grid-cols-[104px_auto_minmax(0,1fr)_auto_96px_112px] sm:gap-x-6 sm:py-4"
    >
      {/* 좁은 화면에서는 시각을 별도 칸으로 두지 않습니다 — 네 칸이 들어가면
          회차 이름이 두세 글자만 남습니다. 이름 아래 줄로 내립니다. */}
      <span className="yh-num yh-small hidden font-semibold text-yh-ink-2 sm:block">
        {formatClock(round.openAt)}
        <span className="font-normal text-yh-ink-3">-{formatClock(round.closeAt)}</span>
      </span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <span className="min-w-0">
        <span className="yh-sub block truncate">{round.name}</span>
        <span className="yh-small block truncate text-yh-ink-3">
          <span className="yh-num sm:hidden">{formatClock(round.openAt)} · </span>
          {brand.name} ·{" "}
          {eligible
            ? gradesLabel(round.eligibleGrades)
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </span>
      </span>

      {/* 할인은 이 줄에서 비교하는 값이라 가장 큽니다. 보조 설명을 아래 줄에 붙여
          숫자가 혼자 떠 있지 않게 합니다. */}
      <span className="text-right whitespace-nowrap">
        <span className="yh-figure-sm block text-[1.375rem] leading-none">
          {discountHeadline(round)}
        </span>
        <span className="yh-small mt-1 hidden text-yh-ink-3 sm:block">{discountDetail(round)}</span>
      </span>

      {/* 여기에는 라벨 없는 게이지 막대가 떠 있었습니다. 폭이 좁아 남은 비율이
          읽히지도 않고, 재고가 적을 땐 점 하나로 보여 오류처럼 읽혔습니다.
          같은 자리에 실제 숫자를 둡니다 — 훑을 때 비교되는 건 수치입니다. */}
      <span className="hidden text-right sm:block">
        {round.status === "SCHEDULED" ? (
          <>
            <span className="yh-num yh-small block font-bold text-yh-ink-2">
              <Countdown target={Date.parse(round.openAt)} />
            </span>
            <span className="yh-small mt-0.5 block text-yh-ink-3">후 오픈</span>
          </>
        ) : soldOutRow ? (
          <span className="yh-small font-bold text-yh-ink-3">품절</span>
        ) : (
          <>
            <span
              className={`yh-num yh-small block font-bold ${
                urgentRow ? "text-yh-warn" : "text-yh-ink-2"
              }`}
            >
              {remaining.toLocaleString("ko-KR")}장
            </span>
            <span className="yh-small mt-0.5 block text-yh-ink-3">
              {urgentRow ? "품절 임박" : "남음"}
            </span>
          </>
        )}
      </span>

      {/* 입장 상태 안내를 배지 옆에 두면 그만큼 배지가 왼쪽으로 밀려 행마다 오른쪽 끝이
          어긋납니다. 아래 줄로 내려서 오른쪽 기준선을 지킵니다. */}
      <span className="col-start-2 -col-end-1 justify-self-start sm:col-auto sm:justify-self-end sm:text-right">
        {round.status === "OPEN" ? (
          <>
            <LiveLabel />
            <span className="yh-small mt-1 block text-yh-ink-3">입장 시 확인</span>
          </>
        ) : (
          <span className="yh-label">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
      </span>
    </Link>
  );
}

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { Countdown, useNow } from "@/components/coupon/timer";
import {
  brandOf,
  couponApi,
  discountHeadline,
  remainingStock,
  type CouponRoundView,
} from "@/lib/coupon";

/**
 * 발급 현황 바.
 *
 * 지금 열려 있는 회차 하나를 헤더 아래 계속 띄웁니다. 여러 개가 동시에 열려 있으면
 * **가장 먼저 마감되는** 회차를 올립니다 — 놓치면 안 되는 게 그것이기 때문입니다.
 *
 * 신문 1면의 속보 띠를 참고했습니다. 어두운 잉크 면 위에서 숫자만 흰색으로 두어
 * 시선이 수치에 먼저 닿게 합니다.
 */
export function LiveStrip() {
  const now = useNow(1000);
  const { data } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    refetchInterval: 15_000,
  });

  const rounds = data ?? [];
  const live = rounds
    .filter((r) => r.status === "OPEN")
    .sort((a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt));
  const next = rounds
    .filter((r) => r.status === "SCHEDULED")
    .sort((a, b) => Date.parse(a.openAt) - Date.parse(b.openAt))[0];

  const headline = live[0] ?? next;

  return (
    <div className="bg-yh-navy text-white">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-4 px-5">
        {!headline ? (
          <span className="yh-small text-white/40">일정 불러오는 중</span>
        ) : live.length > 0 ? (
          <Live round={headline} extra={live.length - 1} now={now} />
        ) : (
          <Next round={headline} />
        )}
      </div>
    </div>
  );
}

function Live({
  round,
  extra,
  now,
}: {
  round: CouponRoundView;
  extra: number;
  now: number | null;
}) {
  const remaining = remainingStock(round);
  const closeAt = Date.parse(round.closeAt);
  const urgent = remaining > 0 && remaining / round.totalQuantity <= 0.1;

  return (
    <>
      <span className="yh-live-on-navy shrink-0">
        <span className="live-dot" />
        발급 중
      </span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="yh-body min-w-0 flex-1 truncate font-semibold hover:underline"
      >
        {round.name}
        {extra > 0 && <span className="ml-2 font-normal text-white/55">외 {extra}개 발급 중</span>}
      </Link>

      <span className="yh-body yh-figure-sm hidden shrink-0 md:block">
        {discountHeadline(round)}
      </span>

      <span className="yh-small hidden shrink-0 text-white/55 sm:block">
        남은{" "}
        <span className={`yh-num font-bold ${urgent ? "text-yh-accent-on-navy" : "text-white"}`}>
          {remaining.toLocaleString("ko-KR")}
        </span>
      </span>

      <span className="yh-small hidden shrink-0 text-white/55 lg:block">
        마감까지{" "}
        {now !== null && closeAt > now ? (
          <Countdown target={closeAt} className="yh-num font-bold text-white" />
        ) : (
          <span className="yh-num font-bold text-white">--:--:--</span>
        )}
      </span>

      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="yh-btn-sm shrink-0 bg-white text-yh-navy shadow-none hover:bg-white/85"
      >
        발급받기
      </Link>
    </>
  );
}

function Next({ round }: { round: CouponRoundView }) {
  const brand = brandOf(round.brandId);
  return (
    <>
      <span className="yh-label shrink-0 text-white/50">다음 회차</span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="yh-body min-w-0 flex-1 truncate font-semibold hover:underline"
      >
        {round.name}
        <span className="ml-2 font-normal text-white/55">{brand.name}</span>
      </Link>

      <span className="yh-small shrink-0 text-white/55">
        <Countdown target={Date.parse(round.openAt)} className="yh-num font-bold text-white" /> 후
        오픈
      </span>

      <Link
        to="/events"
        className="yh-small hidden shrink-0 font-semibold text-white/80 underline-offset-4 hover:underline sm:block"
      >
        전체 일정
      </Link>
    </>
  );
}

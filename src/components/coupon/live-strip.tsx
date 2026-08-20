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
 * DESIGN.md §12 — 컨트롤 층은 어둡게 두고 콘텐츠(숫자)가 앞에 오게 합니다.
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
    <div className="bg-hig-brand text-hig-canvas">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-4 px-5">
        {!headline ? (
          <span className="t-caption text-white/40">일정 불러오는 중</span>
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
      <span className="t-caption flex shrink-0 items-center gap-1.5 font-semibold text-live-on-dark">
        <span className="live-dot" />
        발급 중
      </span>

      <BrandPlate brandId={round.brandId} size="sm" />

      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="t-body-sm min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {round.name}
        {extra > 0 && <span className="ml-2 text-white/60">외 {extra}개 발급 중</span>}
      </Link>

      <span className="t-body-sm hidden shrink-0 font-semibold md:block">
        {discountHeadline(round)}
      </span>

      <span className="t-body-sm hidden shrink-0 text-white/60 sm:block">
        남은{" "}
        <span className={`num ${urgent ? "font-semibold text-attention-on-dark" : "text-white"}`}>
          {remaining.toLocaleString("ko-KR")}
        </span>
      </span>

      <span className="t-body-sm hidden shrink-0 text-white/60 lg:block">
        마감까지{" "}
        {now !== null && closeAt > now ? (
          <Countdown target={closeAt} className="num text-white" />
        ) : (
          <span className="num text-white">--:--:--</span>
        )}
      </span>

      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="btn-compact shrink-0"
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
      <span className="t-caption shrink-0 font-semibold text-white/60">다음 회차</span>
      <BrandPlate brandId={round.brandId} size="sm" />
      <Link
        to="/events/$couponRoundId"
        params={{ couponRoundId: String(round.id) }}
        className="t-body-sm min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {round.name}
        <span className="ml-2 text-white/60">{brand.name}</span>
      </Link>
      <span className="t-body-sm shrink-0 text-white/60">
        <Countdown target={Date.parse(round.openAt)} className="num text-white" /> 후 오픈
      </span>
      <Link
        to="/events"
        className="t-body-sm hidden shrink-0 text-hig-link-on-dark hover:underline sm:block"
      >
        전체 일정
      </Link>
    </>
  );
}

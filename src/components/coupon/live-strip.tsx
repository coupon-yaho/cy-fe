import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
 * 어두운 면 위에서 숫자만 흰색으로 두어 시선이 수치에 먼저 닿게 합니다.
 *
 * ── 언제 보이는가 ──
 * 홈 첫 화면에는 같은 회차를 크게 보여 주는 쿠폰 카드가 있습니다. 그 위에 이 띠까지
 * 띄우면 같은 말을 두 번 하면서 48px 를 먹습니다 — 그만큼 쿠폰이 접혔습니다.
 *
 * 그래서 **쿠폰 카드가 화면에 보이는 동안에는 접어 둡니다.** 스크롤해서 카드가
 * 시야를 벗어나면 그때 내려옵니다. 카드가 없는 화면(일정·쿠폰함 등)에서는 늘 보입니다.
 */

/**
 * 접어 둘 것인가.
 *
 * 쿠폰 카드를 관찰해서 판단하면 순환합니다 — 띠가 보이니 카드가 아래로 밀리고,
 * 카드가 안 보이니 띠가 계속 보입니다. 그래서 **스크롤 위치**로 정합니다.
 * 위치는 레이아웃의 결과가 아니라 원인이라 순환하지 않습니다.
 */
const FOLD = 260;

function useCollapsed(enabled: boolean) {
  const [collapsed, setCollapsed] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }

    /* scroll 이벤트로 읽으면 **매 프레임 리액트 상태를 씁니다.** 값이 바뀌는 건
       스크롤 한 번에 두 번(경계를 지날 때)뿐인데 초당 수십 번 리렌더가 납니다.

       대신 문서 y=260 에 눈에 안 보이는 표식을 하나 박고 그것이 화면에 걸치는지를
       봅니다. body 가 static 이라 absolute 는 문서 원점 기준으로 잡히므로, 이 표식은
       띠의 높이와 무관하게 제자리에 있습니다 — 쿠폰 카드를 관찰할 때 생기던
       순환(띠가 보이니 카드가 밀리고, 카드가 안 보이니 띠가 남는)이 없습니다.
       표식이 보인다 = 스크롤이 260 아래 = 접어 둔다. 조건은 전과 같고,
       리렌더는 경계를 지날 때 한 번씩입니다. */
    const mark = document.createElement("div");
    mark.setAttribute("aria-hidden", "true");
    mark.style.cssText = `position:absolute;top:${FOLD}px;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden`;
    document.body.appendChild(mark);

    const io = new IntersectionObserver(([entry]) => setCollapsed(!!entry?.isIntersecting));
    io.observe(mark);

    return () => {
      io.disconnect();
      mark.remove();
    };
  }, [enabled]);

  return collapsed;
}
export function LiveStrip() {
  const now = useNow(1000);
  // 쿠폰 카드가 있는 화면은 홈뿐입니다. DOM 존재로 판단하면 로딩 스켈레톤 때문에
  // 효과 실행 시점에 아직 없어서 빗나갑니다 — 경로로 정합니다.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const collapsed = useCollapsed(pathname === "/");
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
    <div
      className={`overflow-hidden bg-yh-band text-white transition-[max-height,opacity] duration-300 ease-out ${
        collapsed ? "max-h-0 opacity-0" : "max-h-12 opacity-100"
      }`}
      aria-hidden={collapsed}
    >
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
        /* 띠는 라이트·다크 모두 어두운 면입니다. text-yh-navy 는 다크에서 밝아져
           흰 배경 위 흰 글자가 됩니다 — 띠 색을 글자에 씁니다. */
        className="yh-btn-sm shrink-0 bg-white text-yh-band shadow-none hover:bg-white/85"
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

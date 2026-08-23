import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { Reveal, useCountUp } from "@/components/coupon/reveal";
import { SectionHead } from "@/components/coupon/section-head";
import { GradeChip } from "@/components/coupon/grade-chip";
import { RoundRow } from "@/components/coupon/round-card";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatDateTime } from "@/components/coupon/timer";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  DAY_LABEL,
  GRADES,
  GRADE_LABEL,
  NTH_WEEK_LABEL,
  trimSeconds,
  type BrandDay,
  brandOf,
  couponApi,
  discountDetail,
  discountHeadline,
  gradesLabel,
  remainingStock,
  type CouponRoundView,
  type MembershipGrade,
} from "@/lib/coupon";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "쿠폰 야~호 · 브랜드 데이 선착순 쿠폰" },
      {
        name: "description",
        content: "매월 열리는 12개 브랜드 데이. 한정 수량 쿠폰을 선착순으로 발급받으세요.",
      },
      { property: "og:title", content: "쿠폰 야~호 · 브랜드 데이 선착순 쿠폰" },
      {
        property: "og:description",
        content: "지금 발급 중인 브랜드 데이와 남은 수량을 실시간으로 확인하세요.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { property: "og:image", content: "/hero-yaho.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    refetchInterval: 15_000,
  });

  const rounds = data ?? [];
  const live = rounds
    .filter((r) => r.status === "OPEN")
    .sort((a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt));
  const upcoming = rounds
    .filter((r) => r.status === "SCHEDULED")
    .sort((a, b) => Date.parse(a.openAt) - Date.parse(b.openAt));

  const headline = live[0] ?? upcoming[0];
  const board = [...live, ...upcoming].slice(0, 4);

  return (
    <div>
      <Hero />

      <LiveNow round={headline} loading={isLoading} grade={session?.grade ?? null} />

      <section className="mx-auto w-full max-w-6xl px-5 py-14">
        {/* 제목은 연출로 감싸지 않습니다 — 스크롤이 닿기 전에 섹션이 통째로
            비어 보이면 고장으로 읽힙니다. 목록만 올라오게 둡니다. */}
        <SectionHead
          eyebrow="다가오는 일정"
          title="열리는 순서대로"
          note="매월 정해진 요일과 시각에 한 번씩 열립니다. 수량이 먼저 떨어지면 마감 시각 전에도 닫힙니다."
          action={
            <Link to="/events" className="yh-btn-ghost">
              전체 일정 보기
            </Link>
          }
        />

        <Reveal className="yh-card mt-8 overflow-hidden px-6 sm:px-8">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="my-4 h-16 rounded-xl" />
              ))
            : board.map((r) => <RoundRow key={r.id} round={r} grade={session?.grade ?? null} />)}
        </Reveal>
      </section>

      <BrandGrid />
      <Grades rounds={rounds} grade={session?.grade ?? null} />
      <Closing />
    </div>
  );
}

/* ── 히어로 ─────────────────────────────────────────
   캐릭터는 **서비스의 얼굴**입니다. 그래서 히어로는 특정 회차가 아니라
   서비스를 소개합니다.

   앞선 시안에서는 캐릭터를 "버거하우스 점심 특가" 카드 옆에 붙였는데,
   그러면 그가 그 브랜드의 모델처럼 읽힙니다 — 마스코트와 회차는 층이 다릅니다.
   지금 열려 있는 회차는 아래 <LiveNow> 로 내려서 "지금 발급 중"이라는
   이름표를 달아 줬습니다.

   캐릭터가 오른쪽 아래를 가리키므로 왼쪽에 두면 손끝이 문구와 버튼을 가리킵니다. */

function Hero() {
  return (
    <section className="yh-hero-band yh-deep yh-grain relative overflow-hidden pb-16">
      {/* 캐릭터 뒤 광 — 어두운 면 위에서 아트워크의 흰 외곽선이 살아납니다 */}
      <div
        className="pointer-events-none absolute top-0 left-0 size-[46rem] rounded-full opacity-45 blur-3xl"
        style={{ background: "radial-gradient(circle, #4d7ec4 0%, transparent 66%)" }}
        aria-hidden
      />

      <div className="relative z-[1] mx-auto grid w-full max-w-6xl items-center gap-6 px-5 pt-8 pb-2 lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:pt-10">
        <div className="order-2 lg:order-1">
          <img
            src="/hero-character.png"
            alt="쿠폰을 펼쳐 든 쿠폰 야~호 안내 캐릭터"
            width={844}
            height={595}
            className="yh-hero-art mx-auto w-full max-w-[11rem] drop-shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:max-w-[15rem] lg:max-w-[28rem]"
          />
        </div>

        <div className="order-1 lg:order-2">
          {/* 로고 리본에 적힌 문구를 그대로 씁니다 — 브랜드가 이미 정해 둔 말입니다 */}
          <p className="yh-label inline-flex rounded-full bg-white/14 px-3.5 py-1.5 text-white/80 ring-1 ring-white/20">
            할인 생활의 즐거움
          </p>

          <h1 className="yh-hero mt-4 text-white">
            매달 12개 브랜드가
            <br />
            하루씩 문을 엽니다
          </h1>

          {/* 어두운 띠 위입니다. --yh-ink-2 는 종이 면에서 본문 다음 단계로 쓰는
              잉크라 여기 얹으면 2.55:1 이 됩니다(측정). 흰색을 눌러서 씁니다. */}
          <p className="yh-lede mt-5 max-w-[40ch] text-white/72">
            정해진 수량을 선착순으로 나눠 드립니다. 수량이 떨어지면 마감 시각 전에도 닫히니, 열리는
            시각을 미리 확인해 두세요.
          </p>

          {/* 히어로에는 버튼을 두지 않습니다.
              "브랜드 데이 보기" 는 바로 아래 쿠폰 카드의 "전체 일정 보기" 와 같은 곳(/events)이고
              "내 쿠폰함" 은 헤더 네비에 있습니다. 카드를 위로 겹치면서 이 두 버튼이 카드 뒤에
              깔려 있었는데, 중복이라 아무도 못 눌러도 티가 안 났습니다. 액션은 카드 한 곳에 모읍니다. */}
        </div>
      </div>
    </section>
  );
}

/* ── 지금 발급 중 ────────────────────────────────────
   히어로에서 분리한 회차 카드. 이름표를 달아 두면 캐릭터와 섞이지 않습니다. */

function LiveNow({
  round,
  loading,
  grade,
}: {
  round: CouponRoundView | undefined;
  loading: boolean;
  grade: MembershipGrade | null;
}) {
  return (
    /* 히어로 아래 끝에 걸치게 두면 두 면이 한 덩어리로 읽힙니다 */
    <section className="relative z-[2] mx-auto -mt-20 w-full max-w-6xl px-5">
      {loading || !round ? (
        <HeroSkeleton />
      ) : round.status === "OPEN" ? (
        <HeroLive round={round} grade={grade} />
      ) : (
        <HeroNext round={round} grade={grade} />
      )}
    </section>
  );
}

/** 큰 수치 한 칸. 히어로 카드 안에서 두 번 쓰입니다. */
function Figure({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="yh-label">{label}</p>
      <p className={`yh-figure mt-1.5 ${accent ? "text-yh-accent" : "text-yh-navy"}`}>{children}</p>
    </div>
  );
}

function HeroLive({ round, grade }: { round: CouponRoundView; grade: MembershipGrade | null }) {
  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);
  const eligible = !grade || round.eligibleGrades.includes(grade);
  const urgent = remaining > 0 && remaining / round.totalQuantity <= 0.1;
  // 할인율은 "얼마나 큰가" 가 메시지라 한 번 세어 올립니다. 시계에는 쓰지 않습니다.
  const rate = useCountUp(round.discountRate ?? 0, 800);

  return (
    /* 실물 쿠폰의 구조를 그대로 씁니다 — 위는 읽는 면, 절취선 아래는 뜯어 가는 면.
       앞선 시안은 좌우로 나눠서 오른쪽 칸에 게이지와 버튼만 남고 가운데가 비었습니다.
       가로로 긴 카드에서는 정보를 가로로 늘어놓아야 폭이 다 쓰입니다. */
    /* overflow-hidden 을 두면 좌우 노치(반원)가 카드 경계에서 잘립니다.
       노치는 카드 밖으로 나가야 뚫린 것처럼 보입니다. */
    <div className="yh-rise yh-coupon">
      <div className="p-6 pb-7 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="yh-live">
            <span className="live-dot" />
            지금 발급 중
          </span>
          <span className="flex items-center gap-2">
            <BrandPlate brandId={round.brandId} size="sm" />
            <span className="yh-small text-yh-ink-3">
              {brand.name} · {brand.category}
            </span>
          </span>
        </div>

        <h1 className="yh-hero mt-4">{round.name}</h1>

        {/* 세 값이 한 줄에 놓여야 "얼마나 싸고, 얼마나 남았고, 몇 장 남았나" 가
            한눈에 비교됩니다. 라벨을 같은 높이에 두려면 크기도 같아야 합니다. */}
        {/* 좁은 화면에서 셋을 세로로 쌓으면 카드가 첫 화면을 넘깁니다.
            할인·마감을 두 칸으로 두고 남은 수량은 한 줄로 눕힙니다. */}
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:mt-7 sm:grid-cols-3 sm:gap-x-10 sm:gap-y-6">
          <div>
            <p className="yh-label">할인</p>
            <p className="yh-figure mt-1.5 text-yh-navy">
              {round.policyType === "PERCENT_CAPPED" ? `${rate}%` : discountHeadline(round)}
            </p>
            <p className="yh-small mt-2 text-yh-ink-2">{discountDetail(round)}</p>
          </div>

          <div>
            <p className="yh-label">마감까지</p>
            <p className={`yh-figure mt-1.5 ${urgent ? "text-yh-accent" : "text-yh-navy"}`}>
              <Countdown target={Date.parse(round.closeAt)} />
            </p>
            <p className="yh-num yh-small mt-2 text-yh-ink-2">
              {formatDateTime(round.closeAt)} 마감
            </p>
          </div>

          <div>
            <p className="yh-label">남은 수량</p>
            <p className={`yh-figure yh-num mt-1.5 ${urgent ? "text-yh-accent" : "text-yh-navy"}`}>
              {remaining.toLocaleString("ko-KR")}
            </p>
            <div className="mt-3">
              <StockGauge remaining={remaining} total={round.totalQuantity} label={false} />
            </div>
          </div>
        </div>
      </div>

      {/* 절취선. 카드가 종이 면 위에만 놓이는 높이라 노치가 제대로 뚫립니다. */}
      <div className="yh-tear mx-6 sm:mx-8" />

      {/* 뜯어 가는 쪽입니다. 종이 색(--yh-paper)으로 두면 페이지 바탕과 정확히
          같은 값이라(#f6f9fd) 절취선 아래가 카드 밖처럼 보입니다. 한 단계 눌러
          두 면을 갈라 놓습니다 — 쿠폰함 티켓의 번호 칸과 같은 처리입니다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-b-[15px] bg-yh-paper-2 px-6 py-5 sm:px-8">
        <Link
          to="/events/$couponRoundId"
          params={{ couponRoundId: String(round.id) }}
          className="yh-btn-live"
        >
          발급받기
        </Link>
        {/* "전체 일정 보기" 를 여기 두지 않습니다. 바로 아래 일정 섹션 머리에 같은
            버튼이 있고 헤더 네비에도 같은 곳으로 가는 항목이 있어서, 한 화면에
            같은 말이 셋이었습니다. 이 카드의 일은 "이 회차를 받는 것" 하나입니다. */}
        <p className="yh-small ml-auto text-yh-ink-3">
          {eligible
            ? `${gradesLabel(round.eligibleGrades)} 참여 가능`
            : `${gradesLabel(round.eligibleGrades)} 전용`}
        </p>
      </div>
    </div>
  );
}

function HeroNext({ round, grade }: { round: CouponRoundView; grade: MembershipGrade | null }) {
  const brand = brandOf(round.brandId);
  const eligible = !grade || round.eligibleGrades.includes(grade);

  return (
    <div className="yh-rise yh-ticket p-7 sm:p-9">
      <div className="flex flex-wrap items-center gap-3">
        <span className="yh-label">다음 브랜드 데이</span>
        <span className="flex items-center gap-2">
          <BrandPlate brandId={round.brandId} size="sm" />
          <span className="yh-small text-yh-ink-3">
            {brand.name} · {brand.category}
          </span>
        </span>
      </div>

      <h1 className="yh-hero mt-5">{round.name}</h1>

      <div className="yh-perf mt-7 grid gap-y-6 pt-7 sm:grid-cols-2 sm:gap-x-8">
        <Figure label="할인">{discountHeadline(round)}</Figure>
        <Figure label="오픈까지">
          <Countdown target={Date.parse(round.openAt)} />
        </Figure>
      </div>

      <p className="yh-small mt-4 text-yh-ink-2">
        {discountDetail(round)}
        <span className="yh-num ml-2 text-yh-ink-3">{formatDateTime(round.openAt)} 오픈</span>
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/events/$couponRoundId"
          params={{ couponRoundId: String(round.id) }}
          className="yh-btn"
        >
          회차 정보 보기
        </Link>
      </div>

      <p className="yh-small mt-5 text-yh-ink-3">
        수량{" "}
        <span className="yh-num font-bold text-yh-ink-2">
          {round.totalQuantity.toLocaleString("ko-KR")}장
        </span>{" "}
        ·{" "}
        {eligible ? gradesLabel(round.eligibleGrades) : `${gradesLabel(round.eligibleGrades)} 전용`}
      </p>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="yh-coupon flex flex-col gap-5 p-6 sm:p-7">
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="h-11 w-72 max-w-full rounded-xl" />
      <div className="mt-2 grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
      <Skeleton className="mt-2 h-2 w-full rounded-full" />
      <Skeleton className="mt-3 h-12 w-40 rounded-full" />
    </div>
  );
}

/* ── 등급 ───────────────────────────────────────────
   네 등급을 아트워크의 티켓 색으로 구분합니다. 색이 등급의 이름을 대신하지는
   않으므로(색맹) 이름과 수치를 항상 함께 적습니다. */

const GRADE_TINT: Record<MembershipGrade, string> = {
  WELCOME: "bg-yh-t-sky",
  SILVER: "bg-yh-t-peri",
  GOLD: "bg-yh-t-yellow",
  VIP: "bg-yh-t-pink",
};

function Grades({ rounds, grade }: { rounds: CouponRoundView[]; grade: MembershipGrade | null }) {
  const openCount = (g: MembershipGrade) =>
    rounds.filter((r) => r.eligibleGrades.includes(g)).length;

  return (
    <section>
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <SectionHead
          title={
            grade
              ? `${GRADE_LABEL[grade]} 등급으로 참여할 수 있는 회차`
              : "등급마다 열리는 회차가 다릅니다"
          }
          note={`회차마다 참여할 수 있는 등급이 정해져 있습니다. 숫자는 전체 ${rounds.length}개 회차 중 그 등급으로 참여할 수 있는 수입니다.`}
        />

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GRADES.map((g, i) => {
            const mine = grade === g;
            return (
              <Reveal key={g} delay={i * 60}>
                <li
                  className={`yh-tile yh-tinted h-full ${GRADE_TINT[g]} ${mine ? "ring-2 ring-yh-navy" : ""}`}
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <GradeChip grade={g} />
                      {mine && (
                        <span className="yh-small rounded-full bg-yh-solid px-2.5 py-1 font-bold text-yh-on-solid">
                          내 등급
                        </span>
                      )}
                    </div>
                    {/* 분모를 숫자 옆에 붙입니다. 카드마다 "전체 12개 중 참여 가능" 을
                        한 줄씩 달면 같은 문장이 네 번 반복되는데, 정작 비교해야 할
                        7·9·11·12 는 서로 떨어져 있습니다. 분모는 섹션 설명이 한 번만
                        말하고, 카드에는 비율만 남깁니다. */}
                    <p className="yh-figure-sm mt-6 text-[2.75rem] leading-none">
                      {openCount(g)}
                      <span className="yh-figure-sm ml-1.5 align-baseline text-[1.375rem] text-yh-ink-2">
                        / {rounds.length}
                      </span>
                    </p>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── 브랜드 12개 ─────────────────────────────────────
   사양서 U1 이 요구하는 그리드입니다. 어떤 브랜드가 참여하는지가
   "이 서비스를 쓸 이유"라서 회차 목록보다 먼저 알고 싶어 하는 정보입니다. */

function BrandGrid() {
  const { data } = useQuery({
    queryKey: ["brand-days"],
    queryFn: () => couponApi.listBrandDays(),
    staleTime: 5 * 60_000,
  });

  // 매달 N번째 주로 묶습니다. 브랜드를 그냥 늘어놓으면 "12개가 있다" 만 말하지만,
  // 주차로 묶으면 "언제 열리는가" 를 말합니다 — 섹션 설명이 이미 그 얘기입니다.
  const weeks = useMemo(() => {
    const map = new Map<number, BrandDay[]>();
    for (const d of data ?? []) {
      const list = map.get(d.nthWeek);
      if (list) list.push(d);
      else map.set(d.nthWeek, [d]);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [data]);

  return (
    /* 앞(일정)과 뒤(등급)가 모두 밝은 면이라 셋이 이어지면 가운데가 늘어집니다.
       한 단계 눌러 면을 교차시킵니다. */
    <section className="bg-yh-paper-2">
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        {/* 주·요일은 coupon_templates 값이고 관리자가 /admin/campaigns 에서 바꿉니다.
          "정해져 있다" 고 단정하면 일정이 바뀌는 순간 화면이 거짓말을 합니다.
          지금 등록된 것을 보여 주는 화면이라고 말합니다. */}
        <SectionHead
          title="브랜드 데이 순서"
          note="지금 등록된 일정입니다. 브랜드마다 열리는 주와 요일이 다르고, 운영 상황에 따라 바뀔 수 있습니다."
        />

        {weeks.length === 0 ? (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <dl className="mt-8">
            {weeks.map(([nth, items], wi) => (
              <Reveal key={nth} delay={wi * 60}>
                <div className="-mx-4 grid gap-x-8 gap-y-3 rounded-xl border-t border-yh-rule px-4 py-5 transition-colors hover:bg-yh-surface/70 sm:grid-cols-[7rem_1fr]">
                  <dt className="yh-sub text-yh-ink-2">{NTH_WEEK_LABEL[nth] ?? nth}&nbsp;주</dt>
                  <dd className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                    {items.map((d) => {
                      const brand = brandOf(d.brandId);
                      return (
                        /* 이름 밑에 시각을 쌓아 두면 셀 폭 330px 중 90px 만 쓰고
                           나머지가 빕니다. 옆으로 눕히면 한 줄에 다 들어갑니다.
                           셀 오른쪽 끝까지 밀지는 않습니다 — 그러면 시각이 제 이름보다
                           옆 브랜드에 더 가까워져서 누구의 시각인지 헷갈립니다.
                           남는 폭은 셀과 셀 **사이**에 둡니다. */
                        <span key={d.templateId} className="flex items-center gap-2.5">
                          <BrandPlate brandId={d.brandId} size="sm" />
                          <span className="flex min-w-0 items-baseline gap-2.5">
                            <span className="yh-body truncate font-bold">{brand.name}</span>
                            <span className="yh-num yh-small shrink-0 text-yh-ink-3">
                              {DAY_LABEL[d.dayOfWeek]} {trimSeconds(d.startTime)}
                            </span>
                          </span>
                        </span>
                      );
                    })}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/* ── 발급 3단계 ──────────────────────────────────────
   사양서 U1. 대기열이 왜 뜨는지 미리 알려 두지 않으면
   순번 화면이 처음 뜨는 순간 사용자는 실패로 읽습니다. */

/* 번호마다 다른 색을 주었었습니다. 세 단계는 같은 줄기의 1·2·3 인데 색이 셋이면
   서로 다른 갈래로 읽힙니다. 색은 분류를 뜻하지 순서를 뜻하지 않습니다. */
const STEPS = [
  { n: "01", head: "입장", body: "오픈 시각에 입장하면 즉시 입장하거나 대기열에 배정됩니다." },
  {
    n: "02",
    head: "대기",
    body: "내 순번과 예상 시간이 1초마다 갱신됩니다. 창을 열어 두기만 하면 됩니다.",
  },
  {
    n: "03",
    head: "발급",
    body: "입장 토큰으로 발급합니다. 1인 1매, 초과 발급은 발생하지 않습니다.",
  },
];

/* ── 절차·규칙 문구 ─────────────────────────────────── */

const RULES = [
  {
    head: "한 회차에 한 장",
    body: "한 사람이 같은 회차에서 발급받을 수 있는 쿠폰은 한 장입니다.",
  },
  {
    head: "수량이 떨어지면 바로 마감",
    body: "마감 시각이 남아 있어도 수량이 떨어지면 그 자리에서 닫힙니다. 남은 수량은 실시간으로 셉니다.",
  },
  {
    head: "정해진 수량만",
    body: "몇 명이 동시에 눌러도 준비된 수량을 넘겨 발급하지 않습니다.",
  },
];

/* ── 페이지 마무리 ───────────────────────────────────
   절차와 규칙은 둘 다 "읽고 끝내는" 정보라 한 덩어리로 묶었습니다.
   밝은 면이 여섯 번 이어지면 어느 섹션도 끝처럼 안 보입니다. 어두운 면으로 닫습니다. */

function Closing() {
  return (
    <section className="yh-deep yh-grain relative overflow-hidden">
      <div className="relative z-[1] mx-auto w-full max-w-6xl px-5 py-16">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            {/* 이 자리에 "발급 절차" 라벨이 있었습니다. 섹션마다 작은 대문자 라벨을
                하나씩 얹으면 지면이 전부 같은 리듬으로 읽힙니다. 제목만으로 충분하고,
                라벨을 빼니 옆 칸 제목과 밑선도 저절로 맞습니다. */}
            <h2 className="yh-title text-white">이렇게 받습니다</h2>

            <ol className="mt-7 space-y-5">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 90}>
                  <li className="flex gap-4 border-t border-white/20 pt-4">
                    {/* shrink-0 이 없으면 flex 가 이 배지를 찌그러뜨리고
                        그 안에서 "01" 이 두 줄로 접힙니다. */}
                    <span className="yh-num yh-figure-sm mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-yh-t-sky text-[0.8125rem] text-yh-navy">
                      {s.n}
                    </span>
                    {/* 두 문단은 한 덩어리로 묶습니다 — flex 직계로 두면
                        각각이 줄어들면서 "입장" 이 한 글자씩 쪼개집니다. */}
                    <div className="min-w-0">
                      <p className="yh-sub text-white">{s.head}</p>
                      <p className="yh-body mt-1 text-white/65">{s.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>

          <div>
            <h2 className="yh-title text-white">선착순은 이렇게 지켜집니다</h2>

            <dl className="mt-7 space-y-5">
              {RULES.map((r) => (
                <div key={r.head} className="border-t border-white/20 pt-4">
                  <dt className="yh-sub text-white">{r.head}</dt>
                  <dd className="yh-body mt-1 text-white/65">{r.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

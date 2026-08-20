import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { SectionHead } from "@/components/coupon/section-head";
import { GradeChip } from "@/components/coupon/grade-chip";
import { RoundRow } from "@/components/coupon/round-card";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatDateTime } from "@/components/coupon/timer";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  GRADES,
  GRADE_LABEL,
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
      { title: "쿠폰 야~호 — 브랜드 데이 선착순 쿠폰" },
      {
        name: "description",
        content: "매월 열리는 12개 브랜드 데이. 한정 수량 쿠폰을 선착순으로 발급받으세요.",
      },
      { property: "og:title", content: "쿠폰 야~호 — 브랜드 데이 선착순 쿠폰" },
      {
        property: "og:description",
        content: "지금 발급 중인 브랜드 데이와 남은 수량을 실시간으로 확인하세요.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
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
  const board = [...live, ...upcoming].slice(0, 6);

  return (
    <div>
      <Hero round={headline} loading={isLoading} grade={session?.grade ?? null} />

      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <SectionHead
          eyebrow="다가오는 일정"
          title="열리는 순서대로"
          note="매월 정해진 요일과 시각에 한 번씩 열립니다. 수량이 먼저 떨어지면 마감 시각 전에도 닫힙니다."
          action={
            <Link to="/events" className="btn-outline">
              전체 일정 보기
            </Link>
          }
        />

        <div className="mt-10">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="mb-2 h-16 rounded-xl" />
              ))
            : board.map((r) => <RoundRow key={r.id} round={r} grade={session?.grade ?? null} />)}
        </div>
      </section>

      <Grades rounds={rounds} grade={session?.grade ?? null} />
      <Rules />
    </div>
  );
}

/* ── 히어로 ─────────────────────────────────────────
   DESIGN.md §12·1 — 콘텐츠가 주인공. 지금 열려 있는 회차의 숫자를 그대로 크게 두고,
   컨트롤은 알약 두 개로 절제합니다. 배경은 몰입형 다크 캔버스(#000)입니다. */

function Hero({
  round,
  loading,
  grade,
}: {
  round: CouponRoundView | undefined;
  loading: boolean;
  grade: MembershipGrade | null;
}) {
  return (
    <section className="bg-hig-brand text-hig-canvas">
      <div className="mx-auto w-full max-w-3xl px-5 py-24 text-center sm:py-28">
        {loading || !round ? (
          <HeroSkeleton />
        ) : round.status === "OPEN" ? (
          <HeroLive round={round} grade={grade} />
        ) : (
          <HeroNext round={round} grade={grade} />
        )}
      </div>
    </section>
  );
}

function HeroLive({ round, grade }: { round: CouponRoundView; grade: MembershipGrade | null }) {
  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);
  const eligible = !grade || round.eligibleGrades.includes(grade);

  return (
    <div className="rise-in">
      <p className="t-caption inline-flex items-center gap-1.5 font-semibold text-live-on-dark">
        <span className="live-dot" />
        발급 중
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <BrandPlate brandId={round.brandId} size="sm" />
        <p className="t-body-sm text-white/60">
          {brand.name} · {brand.category}
        </p>
      </div>

      <h1 className="t-hero mt-4">{round.name}</h1>

      <p className="t-tile mt-5 text-white/85">
        {discountHeadline(round)}
        <span className="t-body ml-3 align-middle text-white/55">{discountDetail(round)}</span>
      </p>

      <div className="mx-auto mt-12 max-w-md">
        <StockGauge remaining={remaining} total={round.totalQuantity} onDark />
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/events/$couponRoundId"
          params={{ couponRoundId: String(round.id) }}
          className="btn-primary"
        >
          발급받기
        </Link>
        <Link to="/events" className="btn-outline-on-dark">
          전체 일정 보기
        </Link>
      </div>

      <p className="t-body-sm mt-8 text-white/60">
        마감까지 <Countdown target={Date.parse(round.closeAt)} className="num text-white/80" /> ·{" "}
        {eligible ? gradesLabel(round.eligibleGrades) : `${gradesLabel(round.eligibleGrades)} 전용`}
      </p>
    </div>
  );
}

function HeroNext({ round, grade }: { round: CouponRoundView; grade: MembershipGrade | null }) {
  const brand = brandOf(round.brandId);
  const eligible = !grade || round.eligibleGrades.includes(grade);

  return (
    <div className="rise-in">
      <p className="t-caption font-semibold text-white/60">다음 브랜드 데이</p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <BrandPlate brandId={round.brandId} size="sm" />
        <p className="t-body-sm text-white/60">
          {brand.name} · {brand.category}
        </p>
      </div>

      <h1 className="t-hero mt-4">{round.name}</h1>

      <p className="t-tile mt-5 text-white/85">
        {discountHeadline(round)}
        <span className="t-body ml-3 align-middle text-white/55">{discountDetail(round)}</span>
      </p>

      <p className="t-hero mt-12">
        <Countdown target={Date.parse(round.openAt)} className="num" />
      </p>
      <p className="num t-body-sm mt-3 text-white/60">{formatDateTime(round.openAt)} 오픈</p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/events/$couponRoundId"
          params={{ couponRoundId: String(round.id) }}
          className="btn-primary"
        >
          회차 정보 보기
        </Link>
        <Link to="/events" className="btn-outline-on-dark">
          전체 일정 보기
        </Link>
      </div>

      <p className="t-body-sm mt-8 text-white/60">
        수량{" "}
        <span className="num text-white/80">{round.totalQuantity.toLocaleString("ko-KR")}장</span> ·{" "}
        {eligible ? gradesLabel(round.eligibleGrades) : `${gradesLabel(round.eligibleGrades)} 전용`}
      </p>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Skeleton className="h-4 w-24 rounded-full bg-white/12" />
      <Skeleton className="h-12 w-80 max-w-full rounded-xl bg-white/12" />
      <Skeleton className="h-7 w-56 rounded-xl bg-white/12" />
      <Skeleton className="mt-8 h-2 w-full max-w-md rounded-full bg-white/12" />
      <Skeleton className="mt-6 h-11 w-40 rounded-full bg-white/12" />
    </div>
  );
}

/* ── 등급 ─────────────────────────────────────────── */

function Grades({ rounds, grade }: { rounds: CouponRoundView[]; grade: MembershipGrade | null }) {
  const openCount = (g: MembershipGrade) =>
    rounds.filter((r) => r.eligibleGrades.includes(g)).length;

  return (
    <section className="bg-hig-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-20">
        <SectionHead
          eyebrow="참여 조건"
          title={
            grade
              ? `${GRADE_LABEL[grade]} 등급으로 참여할 수 있는 회차`
              : "등급마다 열리는 회차가 다릅니다"
          }
          note="회차마다 참여할 수 있는 등급이 정해져 있습니다."
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GRADES.map((g) => {
            const mine = grade === g;
            return (
              <li
                key={g}
                className={`rounded-2xl bg-hig-canvas p-6 ${
                  mine ? "outline-2 -outline-offset-2 outline-hig-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <GradeChip grade={g} />
                  {mine && <span className="t-caption font-semibold text-hig-link">내 등급</span>}
                </div>
                <p className="t-tile num mt-6">
                  {openCount(g)}
                  <span className="t-body-sm align-middle text-hig-muted">개 회차</span>
                </p>
                <p className="t-body-sm mt-1 text-hig-muted">지금 참여 가능</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── 발급 규칙 ─────────────────────────────────────── */

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

function Rules() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20">
      <SectionHead eyebrow="발급 규칙" title="선착순은 이렇게 지켜집니다" />
      <dl className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {RULES.map((r) => (
          <div key={r.head}>
            <dt className="t-body font-semibold">{r.head}</dt>
            <dd className="t-body-sm mt-2 text-hig-secondary">{r.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

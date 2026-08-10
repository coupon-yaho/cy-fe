import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ShieldCheck, Sparkles, Ticket, Users } from "lucide-react";
import keyvisual from "@/assets/keyvisual.png.asset.json";
import { Countdown, formatDateTime } from "@/components/countdown";
import { CouponStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getBrands, getCoupons } from "@/lib/api";
import { GRADE_LABEL, GRADES, describePolicy, maskLabel } from "@/lib/domain";
import { templateSummary } from "@/lib/mock-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "쿠폰 야~호 — 브랜드 데이 선착순 쿠폰" },
      {
        name: "description",
        content:
          "12개 제휴 브랜드의 브랜드 데이를 한곳에서. 선착순 한정 수량 쿠폰을 초과 발급 없이 정확하게 발급받으세요.",
      },
      { property: "og:title", content: "쿠폰 야~호 — 브랜드 데이 선착순 쿠폰" },
      {
        property: "og:description",
        content: "매월 열리는 12개 브랜드 데이. 등급별 혜택과 선착순 한정 쿠폰을 확인하세요.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

const GRADE_PERKS: Record<(typeof GRADES)[number], { count: string; desc: string }> = {
  WELCOME: { count: "8개 브랜드", desc: "전체 공개 브랜드 데이 참여" },
  SILVER: { count: "9개 브랜드", desc: "마트 · 뷰티 브랜드 데이 추가" },
  GOLD: { count: "11개 브랜드", desc: "영화 · 여행 프리미엄 이벤트 개방" },
  VIP: { count: "12개 브랜드", desc: "헬스클럽 포함 전 브랜드 참여" },
};

function Landing() {
  const { session } = useAuth();
  const coupons = useQuery({ queryKey: ["coupons", session?.userId ?? null], queryFn: () => getCoupons(session) });
  const brands = useQuery({ queryKey: ["brands"], queryFn: getBrands });

  const live = (coupons.data ?? []).filter((c) => c.status === "OPEN").slice(0, 3);
  const upcoming = (coupons.data ?? []).filter((c) => c.status === "SCHEDULED").slice(0, 1)[0];

  return (
    <div>
      {/* 히어로 */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="text-primary-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3.5" /> 매월 12개 브랜드 데이 진행 중
            </span>
            <h1 className="mt-5 text-4xl leading-tight font-bold sm:text-5xl">
              한정 수량 쿠폰,
              <br />
              초과 발급 0건으로 정확하게.
            </h1>
            <p className="mt-4 max-w-lg text-primary-foreground/80">
              재고 10,000장에 20,000명이 몰려도 1인 1매를 보장합니다. 대기열 순번과 예상 시간까지
              실시간으로 확인하세요.
            </p>

            {upcoming && (
              <div className="mt-7 inline-flex flex-wrap items-center gap-3 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3">
                <Clock className="size-4" />
                <span className="text-sm">
                  다음 오픈 · {upcoming.brand.name} {upcoming.brand.emoji}
                </span>
                <Countdown target={upcoming.openAt} className="text-lg font-bold" compact />
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/events">
                  브랜드 데이 보러가기 <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                asChild
              >
                <Link to="/admin">관리자 콘솔</Link>
              </Button>
            </div>
          </div>

          <img
            src={keyvisual.url}
            alt="쿠폰 야~호 키비주얼 — 쿠폰을 든 캐릭터"
            className="mx-auto w-full max-w-md drop-shadow-2xl"
          />
        </div>
      </section>

      {/* 진행 중인 이벤트 */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold">지금 진행 중</h2>
            <p className="text-sm text-muted-foreground">재고가 남아 있는 동안만 발급됩니다.</p>
          </div>
          <Link to="/events" className="text-sm font-medium text-accent hover:underline">
            전체 보기
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {coupons.isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          {live.map((c) => {
            const pct = Math.round((c.issuedCount / c.totalStock) * 100);
            return (
              <Card key={c.couponId} className="shadow-card overflow-hidden">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{c.brand.emoji}</span>
                      <div>
                        <p className="font-semibold">{c.brand.name}</p>
                        <p className="text-xs text-muted-foreground">{c.brand.category}</p>
                      </div>
                    </div>
                    <CouponStatusBadge status={c.status} />
                  </div>

                  <p className="text-lg font-bold text-accent">
                    {describePolicy(c.policyType, c.policyValue, c.policyCap)}
                  </p>

                  <div className="space-y-1.5">
                    <Progress value={pct} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="num">
                        잔여 {c.remaining.toLocaleString("ko-KR")}장
                      </span>
                      <span className="num">{pct}% 소진</span>
                    </div>
                  </div>

                  <Button className="w-full" asChild>
                    <Link to="/events/$couponId" params={{ couponId: c.couponId }}>
                      쿠폰 받기
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {!coupons.isLoading && live.length === 0 && (
            <Card className="md:col-span-3">
              <CardContent className="py-12 text-center text-muted-foreground">
                현재 진행 중인 브랜드 데이가 없습니다.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* 발급 3단계 */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
          {[
            { icon: Users, title: "1. 입장", desc: "오픈 시각에 입장하면 즉시 입장 또는 대기열에 배정됩니다." },
            { icon: Clock, title: "2. 대기", desc: "내 순번과 예상 시간이 1초마다 갱신됩니다." },
            { icon: Ticket, title: "3. 발급", desc: "입장 토큰으로 발급. 1인 1매, 초과 발급은 발생하지 않습니다." },
          ].map((s) => (
            <div key={s.title} className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <s.icon className="size-5" />
              </div>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 브랜드 12개 */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold">제휴 브랜드 12</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          브랜드마다 매월 정해진 요일 · 시각에 브랜드 데이가 열립니다.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.isLoading &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          {(brands.data ?? []).map((b) => (
            <Card key={b.brandId} className="shadow-card">
              <CardContent className="flex items-center gap-4 p-4">
                <span
                  className="flex size-12 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: `${b.color}1f` }}
                >
                  {b.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {templateSummary(b.template)} · {maskLabel(b.template.eligibleGradesMask)}
                  </p>
                  <p className="num mt-0.5 text-xs text-accent">
                    다음 오픈 {formatDateTime(b.nextOpenAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 등급 */}
      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-accent" />
            <h2 className="text-2xl font-bold">멤버십 등급 혜택</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            등급이 높을수록 참여 가능한 브랜드 데이가 늘어납니다.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GRADES.slice().reverse().map((g) => (
              <Card key={g} className="shadow-card">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold text-muted-foreground">{GRADE_LABEL[g]}</p>
                  <p className="mt-1 text-xl font-bold text-accent">{GRADE_PERKS[g].count}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{GRADE_PERKS[g].desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

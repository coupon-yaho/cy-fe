import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Countdown, formatDateTime } from "@/components/countdown";
import { CouponStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getCoupons } from "@/lib/api";
import { describePolicy, maskLabel } from "@/lib/domain";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "브랜드 데이 — 쿠폰 야~호" },
      { name: "description", content: "진행 중 · 오픈 예정 브랜드 데이 쿠폰을 한눈에 확인하세요." },
      { property: "og:title", content: "브랜드 데이 — 쿠폰 야~호" },
      { property: "og:description", content: "진행 중 · 오픈 예정 브랜드 데이 쿠폰 목록." },
      { property: "og:url", content: "/events" },
    ],
    links: [{ rel: "canonical", href: "/events" }],
  }),
  component: EventsPage,
});

function EventsPage() {
  const { session } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["coupons", session?.userId ?? null],
    queryFn: () => getCoupons(session),
    refetchInterval: 5000,
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">브랜드 데이</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        재고가 소진되면 즉시 마감됩니다. 등급 조건을 확인하세요.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
        {(data ?? []).map((c) => {
          const pct = Math.round((c.issuedCount / c.totalStock) * 100);
          return (
            <Card key={c.couponId} className="shadow-card">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{c.brand.emoji}</span>
                    <div>
                      <p className="font-semibold">{c.brand.name}</p>
                      <p className="text-xs text-muted-foreground">{maskLabel(c.eligibleGradesMask)}</p>
                    </div>
                  </div>
                  <CouponStatusBadge status={c.status} />
                </div>

                <p className="text-lg font-bold text-accent">
                  {describePolicy(c.policyType, c.policyValue, c.policyCap)}
                </p>

                {c.status === "SCHEDULED" ? (
                  <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
                    <span className="text-muted-foreground">오픈까지 </span>
                    <Countdown target={c.openAt} className="font-bold" compact />
                    <p className="num mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(c.openAt)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Progress value={pct} />
                    <div className="num flex justify-between text-xs text-muted-foreground">
                      <span>잔여 {c.remaining.toLocaleString("ko-KR")}장</span>
                      <span>{pct}% 소진</span>
                    </div>
                  </div>
                )}

                <Button className="w-full" variant={c.status === "OPEN" ? "default" : "secondary"} asChild>
                  <Link to="/events/$couponId" params={{ couponId: c.couponId }}>
                    {c.status === "OPEN" ? "쿠폰 받기" : "상세 보기"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

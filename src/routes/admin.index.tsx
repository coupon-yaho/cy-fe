import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTime } from "@/components/countdown";
import { CouponStatusBadge, GradeBadge } from "@/components/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { adminListCoupons, adminRecentIssuances } from "@/lib/api";
import { metricSeries, queueMode } from "@/lib/metrics";
import { useNow } from "@/components/countdown";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "운영 현황 — 쿠폰 야~호 관리자" },
      { name: "description", content: "실시간 발급 TPS, 대기열 깊이, 재고 소진률을 관제합니다." },
      { property: "og:title", content: "운영 현황 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "실시간 발급 관제 대시보드." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOps,
});

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="num mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="num text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AdminOps() {
  const now = useNow(1000);
  const points = now === null ? [] : metricSeries(120);
  const last = points[points.length - 1];

  const coupons = useQuery({ queryKey: ["admin-coupons"], queryFn: adminListCoupons, refetchInterval: 4000 });
  const recent = useQuery({
    queryKey: ["admin-recent"],
    queryFn: () => adminRecentIssuances(10),
    refetchInterval: 3000,
  });

  const live = (coupons.data ?? []).filter((c) => c.status === "OPEN");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">운영 현황</h1>
        <p className="text-sm text-muted-foreground">1초 주기 실시간 관제 · 대기열 상태 {queueMode(last)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="초당 발급 (TPS)" value={(last?.issuePerSec ?? 0).toLocaleString("ko-KR")} sub="201 Created" />
        <Kpi label="대기열 깊이" value={(last?.queueDepth ?? 0).toLocaleString("ko-KR")} sub={`모드 ${queueMode(last)}`} />
        <Kpi label="응답 p99" value={`${last?.p99 ?? 0} ms`} sub={`p50 ${last?.p50 ?? 0} / p95 ${last?.p95 ?? 0}`} />
        <Kpi label="진행 중 이벤트" value={`${live.length}건`} sub={`전체 ${coupons.data?.length ?? 0}건`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">초당 발급 추이</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="issuePerSec" stroke="#3b6fa0" fill="#3b6fa055" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">대기열 깊이</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="queueDepth" stroke="#1e3a5f" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">응답 코드 분포</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="c201" stackId="a" fill="#3b6fa0" />
                <Bar dataKey="c202" stackId="a" fill="#8ab0d6" />
                <Bar dataKey="c409" stackId="a" fill="#e0a33c" />
                <Bar dataKey="c403" stackId="a" fill="#c05c5c" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">진행 중 이벤트 재고</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {live.length === 0 && <p className="text-sm text-muted-foreground">진행 중인 이벤트가 없습니다.</p>}
            {live.map((c) => {
              const pct = Math.round((c.issuedCount / c.totalStock) * 100);
              return (
                <div key={c.couponId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.brand.emoji} {c.brand.name}</span>
                    <span className="num text-muted-foreground">
                      {c.issuedCount.toLocaleString("ko-KR")} / {c.totalStock.toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">최근 발급 로그</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(recent.data ?? []).map((i) => (
            <div key={i.issuanceId} className="flex items-center gap-3 border-b border-border/60 pb-2 text-sm last:border-0">
              <span className="num w-20 shrink-0 text-muted-foreground">{formatTime(i.issuedAt)}</span>
              <GradeBadge grade={i.grade} />
              <span className="num text-muted-foreground">{i.maskedUserId}</span>
              <span className="ml-auto">{i.brand.emoji} {i.brand.name}</span>
              <CouponStatusBadge status={i.coupon.status} />
            </div>
          ))}
          {(recent.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">발급 이력이 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

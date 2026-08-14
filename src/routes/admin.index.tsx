import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { adminListCoupons, adminRecentEvents, adminRecentIssuances } from "@/lib/api";
import { metricSeries, queueMode } from "@/lib/metrics";
import { useNow } from "@/components/countdown";
import type { AppEvent } from "@/lib/domain";

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

const EVENT_LABEL: Record<AppEvent["type"], string> = {
  ISSUE: "발급",
  USE: "사용",
  CANCEL_USE: "사용취소",
  CANCEL: "발급취소",
  EXPIRE: "만료",
  SYSTEM: "시스템",
};

const TRANSITION_TYPES: AppEvent["type"][] = ["USE", "CANCEL_USE", "CANCEL", "EXPIRE"];

function EventRow({ e }: { e: AppEvent }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 pb-2 text-sm last:border-0">
      <span className="num w-20 shrink-0 text-muted-foreground">{formatTime(e.at)}</span>
      <Badge variant="outline" className="shrink-0">{EVENT_LABEL[e.type]}</Badge>
      {e.grade && <GradeBadge grade={e.grade} />}
      <span className="num shrink-0 text-muted-foreground">{e.maskedUserId}</span>
      <span className="ml-auto truncate text-right text-muted-foreground">{e.message}</span>
    </div>
  );
}

function AdminOps() {
  const now = useNow(1000);
  const points = now === null ? [] : metricSeries(120);
  const last = points[points.length - 1];

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const coupons = useQuery({ queryKey: ["admin-coupons"], queryFn: adminListCoupons, refetchInterval: 4000 });
  const recent = useQuery({
    queryKey: ["admin-recent", submitted],
    queryFn: () => adminRecentIssuances(submitted ? 50 : 10, submitted),
    refetchInterval: 3000,
  });
  const events = useQuery({
    queryKey: ["admin-events"],
    queryFn: () => adminRecentEvents(60),
    refetchInterval: 2000,
  });

  const live = (coupons.data ?? []).filter((c) => c.status === "OPEN");
  const all = coupons.data ?? [];

  const stock = useMemo(() => {
    const total = all.reduce((a, c) => a + c.totalStock, 0);
    const issued = all.reduce((a, c) => a + c.issuedCount, 0);
    return { total, issued, remain: total - issued };
  }, [all]);

  const issueEvents = (events.data ?? []).filter((e) => e.type === "ISSUE");
  const transitionEvents = (events.data ?? []).filter((e) => TRANSITION_TYPES.includes(e.type));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">운영 현황</h1>
        <p className="text-sm text-muted-foreground">1초 주기 실시간 관제 · 대기열 상태 {queueMode(last)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="초당 발급 (TPS)" value={(last?.issuePerSec ?? 0).toLocaleString("ko-KR")} sub="201 Created" />
        <Kpi label="대기열 깊이" value={(last?.queueDepth ?? 0).toLocaleString("ko-KR")} sub={`모드 ${queueMode(last)}`} />
        <Kpi
          label="잔여 재고"
          value={stock.remain.toLocaleString("ko-KR")}
          sub={`총 ${stock.total.toLocaleString("ko-KR")} · 발급 ${stock.issued.toLocaleString("ko-KR")}`}
        />
        <Kpi label="진행 중 이벤트" value={`${live.length}건`} sub={`전체 ${all.length}건`} />
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
                      잔여 {(c.totalStock - c.issuedCount).toLocaleString("ko-KR")} /{" "}
                      {c.totalStock.toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* 잔여 재고 현황 */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">쿠폰별 잔여 재고</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {all.length === 0 && <p className="text-sm text-muted-foreground">쿠폰이 없습니다.</p>}
          {all.map((c) => {
            const remain = c.totalStock - c.issuedCount;
            const pct = Math.round((c.issuedCount / c.totalStock) * 100);
            return (
              <div key={c.couponId} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c.brand.emoji} {c.brand.name}</span>
                  <CouponStatusBadge status={c.status} />
                </div>
                <p className="num mt-1 text-lg font-bold">{remain.toLocaleString("ko-KR")}장</p>
                <p className="num text-xs text-muted-foreground">
                  소진률 {pct}% · 총 {c.totalStock.toLocaleString("ko-KR")}장
                </p>
                <Progress value={pct} className="mt-2 h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 발급 · 상태전이 스트림 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">발급 이벤트 스트림</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {issueEvents.length === 0 && <p className="text-sm text-muted-foreground">발급 이벤트가 없습니다.</p>}
            {issueEvents.map((e) => <EventRow key={e.id} e={e} />)}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">상태 전이 스트림</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {transitionEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">상태 전이 이벤트가 없습니다.</p>
            )}
            {transitionEvents.map((e) => <EventRow key={e.id} e={e} />)}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">최근 발급 로그</CardTitle>
          <form
            className="flex w-full items-center gap-2 sm:w-72"
            onSubmit={(ev) => {
              ev.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="사용자 아이디로 검색"
                className="pl-8"
              />
            </div>
            <Button type="submit" size="sm">검색</Button>
            {submitted && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => { setQuery(""); setSubmitted(""); }}
                aria-label="검색 해제"
              >
                <X className="size-4" />
              </Button>
            )}
          </form>
        </CardHeader>
        <CardContent className="space-y-2">
          {submitted && (
            <p className="text-xs text-muted-foreground">
              “{submitted}” 검색 결과 {(recent.data ?? []).length}건
            </p>
          )}
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
            <p className="text-sm text-muted-foreground">
              {submitted ? "일치하는 사용자 발급 이력이 없습니다." : "발급 이력이 없습니다."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

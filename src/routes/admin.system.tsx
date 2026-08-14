import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CircleDashed,
  Cpu,
  Pause,
  Play,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useNow } from "@/components/countdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getEngine, setEngineVersion } from "@/lib/api";
import type { EngineVersion } from "@/lib/domain";
import {
  breakers,
  metricSeries,
  queueMode,
  resources,
  sloRows,
  type Health,
  type MetricPoint,
} from "@/lib/metrics";

export const Route = createFileRoute("/admin/system")({
  head: () => ({
    meta: [
      { title: "시스템 관제 — 쿠폰 야~호 관리자" },
      {
        name: "description",
        content: "SLO 상태, 발급 엔진 전환, 서킷 브레이커, 대기열·인프라 지표를 실시간으로 관제합니다.",
      },
      { property: "og:title", content: "시스템 관제 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "SLO · 엔진 전환 · 서킷 브레이커 실시간 관제." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSystem,
});

const ENGINES: { v: EngineVersion; label: string; desc: string; tps: string; p99: string }[] = [
  { v: "v1", label: "DB 비관적 락", desc: "정확하지만 처리량이 낮음", tps: "1.2K TPS", p99: "4,210ms" },
  { v: "v2", label: "Redis 원자 카운터", desc: "고성능 재고 차감", tps: "8.6K TPS", p99: "412ms" },
  { v: "v3", label: "Kafka 비동기", desc: "최대 처리량 · 최종 일관성", tps: "14.3K TPS", p99: "186ms" },
];

const WINDOWS = [
  { label: "1분", sec: 60 },
  { label: "5분", sec: 300 },
  { label: "15분", sec: 900 },
] as const;

const REFRESH = [
  { label: "1초", ms: 1 },
  { label: "5초", ms: 5 },
  { label: "정지", ms: 0 },
] as const;

const HEALTH_STYLE: Record<Health, string> = {
  OK: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  WARN: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  CRIT: "border-chart-5/40 bg-chart-5/10 text-chart-5",
};

const HEALTH_LABEL: Record<Health, string> = { OK: "정상", WARN: "주의", CRIT: "위험" };

function HealthDot({ health }: { health: Health }) {
  const cls = health === "OK" ? "bg-chart-2" : health === "WARN" ? "bg-chart-3" : "bg-chart-5";
  return <span className={`inline-block size-2 shrink-0 rounded-full ${cls}`} />;
}

function timeLabel(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}`;
}

function AdminSystem() {
  const now = useNow(1000);
  const [windowSec, setWindowSec] = useState<number>(300);
  const [refresh, setRefresh] = useState<number>(1);
  const [version, setVersion] = useState<EngineVersion>(getEngine().version);
  const [paused, setPaused] = useState(false);
  const frozen = useRef<MetricPoint[]>([]);

  const tick = now === null ? 0 : Math.floor(now / 1000);
  const gate = refresh === 0 ? "off" : Math.floor(tick / refresh);

  const points = useMemo(() => {
    if (now === null) return frozen.current;
    if (refresh === 0) return frozen.current;
    frozen.current = metricSeries(windowSec);
    return frozen.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, windowSec, now === null]);

  const last = points[points.length - 1];
  const slo = useMemo(() => sloRows(points), [points]);
  const cbs = useMemo(() => breakers(last), [last]);
  const res = useMemo(() => resources(last), [last]);
  const mode = queueMode(last);
  const worst: Health = slo.some((s) => s.health === "CRIT")
    ? "CRIT"
    : slo.some((s) => s.health === "WARN")
      ? "WARN"
      : "OK";

  const codeData = points.slice(-60);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold">시스템 관제</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${HEALTH_STYLE[worst]}`}
            >
              <HealthDot health={worst} />
              {HEALTH_LABEL[worst]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            발급 엔진 <span className="font-semibold text-foreground">{version}</span> · 대기열 모드{" "}
            <span className="font-semibold text-foreground">{mode}</span> ·{" "}
            {last ? timeLabel(last.t) : "--:--:--"} 기준 (Mock)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.sec}
                type="button"
                onClick={() => setWindowSec(w.sec)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  windowSec === w.sec
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-border bg-background p-0.5">
            {REFRESH.map((r) => (
              <button
                key={r.ms}
                type="button"
                onClick={() => setRefresh(r.ms)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  refresh === r.ms
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* SLO 스트립 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {slo.map((s) => (
          <Card key={s.key} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                <HealthDot health={s.health} />
              </div>
              <p className="num mt-1 text-2xl font-bold">
                {s.value.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-medium text-muted-foreground">{s.unit}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 엔진 전환 */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-accent" /> 발급 엔진 전환
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {ENGINES.map((e) => {
            const active = version === e.v;
            return (
              <button
                key={e.v}
                onClick={() => {
                  setEngineVersion(e.v);
                  setVersion(e.v);
                  toast.success(`발급 엔진이 ${e.v}로 전환되었습니다`, { description: e.label });
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active ? "border-accent bg-accent/10 ring-1 ring-accent/40" : "border-border hover:bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {e.v} · {e.label}
                  </p>
                  {active && <Badge>사용 중</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{e.desc}</p>
                <div className="num mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>벤치 {e.tps}</span>
                  <span>p99 {e.p99}</span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* 처리량 · 대기열 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-accent" /> 초당 발급 · 대기열 깊이
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <defs>
                  <linearGradient id="gTps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={48} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="issuePerSec"
                  name="초당 발급"
                  stroke="var(--chart-1)"
                  fill="url(#gTps)"
                />
                <Area
                  yAxisId="r"
                  type="monotone"
                  dataKey="queueDepth"
                  name="대기 인원"
                  stroke="var(--chart-3)"
                  fill="var(--chart-3)"
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-accent" /> 서킷 브레이커
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cbs.map((c) => {
              const h: Health = c.state === "CLOSED" ? "OK" : c.state === "HALF_OPEN" ? "WARN" : "CRIT";
              return (
                <div key={c.name} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-mono text-sm">{c.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${HEALTH_STYLE[h]}`}>
                      {c.state}
                    </span>
                  </div>
                  <div className="num mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>실패율 {c.failureRate}%</span>
                    <span>{c.calls.toLocaleString("ko-KR")} calls/s</span>
                  </div>
                  <Progress value={Math.min(100, c.failureRate * 8)} className="mt-2 h-1.5" />
                </div>
              );
            })}
            <Separator />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleDashed className="size-3.5" /> 대기열 모드 <span className="font-semibold text-foreground">{mode}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 지연 · 응답코드 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">지연 시간 분위 (p50 / p95 / p99)</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={48} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <ReferenceLine y={500} stroke="var(--chart-5)" strokeDasharray="4 4" label={{ value: "SLO 500ms", fontSize: 10 }} />
                <Line dataKey="p50" name="p50" stroke="var(--chart-2)" dot={false} strokeWidth={1.5} />
                <Line dataKey="p95" name="p95" stroke="var(--chart-1)" dot={false} strokeWidth={1.5} />
                <Line dataKey="p99" name="p99" stroke="var(--chart-4)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">응답 코드 분포 (최근 60초)</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={codeData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={48} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="c201" name="201 발급" stackId="s" fill="var(--chart-2)" />
                <Bar dataKey="c202" name="202 대기" stackId="s" fill="var(--chart-1)" />
                <Bar dataKey="c409" name="409 소진/중복" stackId="s" fill="var(--chart-3)" />
                <Bar dataKey="c403" name="403 등급" stackId="s" fill="var(--chart-4)" />
                <Bar dataKey="c5xx" name="5xx" stackId="s" fill="var(--chart-5)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 리소스 · 정합성 · 알림 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="size-4 text-accent" /> 리소스 사용률
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {res.map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-sm">
                  <span>{r.label}</span>
                  <span className="num font-semibold">{r.value}%</span>
                </div>
                <Progress value={r.value} className="mt-1.5 h-2" />
                <p className="mt-1 text-[11px] text-muted-foreground">{r.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Redis ↔ DB 정합성 격차</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={48} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area type="stepAfter" dataKey="drift" name="격차(건)" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.2} />
                <Area type="monotone" dataKey="kafkaLag" name="Kafka Lag" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.08} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      {/* 긴급 제어 */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">긴급 제어</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPaused((p) => !p);
              toast.success(paused ? "발급이 재개되었습니다 (Mock)" : "전체 발급이 일시 중지되었습니다 (Mock)");
            }}
          >
            {paused ? <Play className="mr-2 size-4" /> : <Pause className="mr-2 size-4" />}
            {paused ? "발급 재개" : "전체 발급 일시 중지"}
          </Button>
          <Button variant="outline" onClick={() => toast.success("대기열 유입이 차단되었습니다 (Mock)")}>
            대기열 유입 차단
          </Button>
          <Button variant="outline" onClick={() => toast.success("캐시가 워밍업되었습니다 (Mock)")}>
            캐시 워밍업
          </Button>
          <Button variant="outline" onClick={() => toast.success("정합성 보정 배치를 실행했습니다 (Mock)")}>
            Redis↔DB 보정 배치
          </Button>
          <Button variant="destructive" onClick={() => toast.success("서킷 브레이커를 강제 오픈했습니다 (Mock)")}>
            서킷 브레이커 강제 오픈
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

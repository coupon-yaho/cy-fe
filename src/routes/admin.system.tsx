import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNow } from "@/components/countdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getEngine, setEngineVersion } from "@/lib/api";
import { metricSeries } from "@/lib/metrics";
import type { EngineVersion } from "@/lib/domain";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/system")({
  head: () => ({
    meta: [
      { title: "시스템 관제 — 쿠폰 야~호 관리자" },
      { name: "description", content: "엔진 버전 전환, 인프라 지표, 정합성 드리프트를 관제합니다." },
      { property: "og:title", content: "시스템 관제 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "엔진 전환과 인프라 관제." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSystem,
});

const ENGINES: { v: EngineVersion; label: string; desc: string }[] = [
  { v: "v1", label: "v1 · DB 비관적 락", desc: "정확하지만 처리량이 낮음" },
  { v: "v2", label: "v2 · Redis 원자 카운터", desc: "고성능 재고 차감" },
  { v: "v3", label: "v3 · Kafka 비동기", desc: "최대 처리량, 최종 일관성" },
];

function AdminSystem() {
  const now = useNow(1000);
  const points = now === null ? [] : metricSeries(120);
  const last = points[points.length - 1];
  const [version, setVersion] = useState<EngineVersion>(getEngine().version);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">시스템 관제</h1>
        <p className="text-sm text-muted-foreground">발급 엔진 전환과 인프라 지표 (Mock)</p>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">발급 엔진 전환</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {ENGINES.map((e) => (
            <button
              key={e.v}
              onClick={() => {
                setEngineVersion(e.v);
                setVersion(e.v);
                toast.success(`발급 엔진이 ${e.v}로 전환되었습니다`);
              }}
              className={`rounded-xl border p-4 text-left transition-colors ${
                version === e.v ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="font-semibold">{e.label}</p>
                {version === e.v && <Badge>사용 중</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{e.desc}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "인플라이트 요청", value: (last?.inflight ?? 0).toLocaleString("ko-KR") },
          { label: "Redis 지연", value: `${last?.redisLatency ?? 0} ms` },
          { label: "Kafka Lag", value: (last?.kafkaLag ?? 0).toLocaleString("ko-KR") },
          { label: "재고 드리프트", value: `${last?.drift ?? 0} 건` },
        ].map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="num mt-1 text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">DB 커넥션 풀 사용률</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Progress value={last?.dbPool ?? 0} />
          <p className="num text-sm text-muted-foreground">{last?.dbPool ?? 0}% 사용 중</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">지연 시간 p50 / p95 / p99</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line dataKey="p50" stroke="#8ab0d6" dot={false} />
                <Line dataKey="p95" stroke="#3b6fa0" dot={false} />
                <Line dataKey="p99" stroke="#0f1b3d" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">상태 전이 이벤트</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area dataKey="transitionUse" stackId="a" stroke="#3b6fa0" fill="#3b6fa055" />
                <Area dataKey="transitionCancel" stackId="a" stroke="#e0a33c" fill="#e0a33c55" />
                <Area dataKey="transitionExpire" stackId="a" stroke="#c05c5c" fill="#c05c5c55" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">긴급 제어</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast.success("대기열 유입이 차단되었습니다 (Mock)")}>
            대기열 유입 차단
          </Button>
          <Button variant="outline" onClick={() => toast.success("캐시가 워밍업되었습니다 (Mock)")}>
            캐시 워밍업
          </Button>
          <Button variant="destructive" onClick={() => toast.success("전체 발급이 일시 중지되었습니다 (Mock)")}>
            전체 발급 일시 중지
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

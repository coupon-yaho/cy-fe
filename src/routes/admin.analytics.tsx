import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, Download, RotateCcw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BENCHMARKS,
  STAT_PERIODS,
  VERIFY_REPORT,
  brandStats,
  funnel,
  heatmap,
  heatmapDays,
  heatmapHours,
  issuanceTrend,
  resetStats,
  versionDbPoolCurve,
  versionLatencyCurve,
  versionStockCurve,
  type StatPeriod,
} from "@/lib/metrics";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "통계 · 분석 — 쿠폰 야~호 관리자" },
      {
        name: "description",
        content: "기간별 발급 퍼널, 브랜드 전환율, 등급·정책 분포, 엔진 벤치마크와 정합성 검증 리포트.",
      },
      { property: "og:title", content: "통계 · 분석 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "퍼널 · 브랜드 · 등급 · 엔진 비교 분석." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAnalytics,
});

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

type SortKey = "issued" | "used" | "conversion";

function kfmt(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function AdminAnalytics() {
  const [period, setPeriod] = useState<StatPeriod>("30d");
  const [nonce, setNonce] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("issued");

  const data = useMemo(() => {
    const brands = brandStats(period);
    const cells = heatmap(period);
    const totalIssued = brands.reduce((a, b) => a + b.issued, 0);
    const totalUsed = brands.reduce((a, b) => a + b.used, 0);
    const peak = cells.reduce((a, c) => (c.value > a.value ? c : a), cells[0]!);
    const stages = funnel(period);
    const best = [...brands].sort((a, b) => b.conversion - a.conversion)[0]!;
    return {
      brands,
      cells,
      days: heatmapDays(period),
      hours: heatmapHours(period),
      trend: issuanceTrend(period),
      stages,
      totalIssued,
      totalUsed,
      conversion: totalIssued ? (totalUsed / totalIssued) * 100 : 0,
      peak,
      best,
      avgPerDay: Math.round(totalIssued / (period === "today" ? 1 : period === "7d" ? 7 : 30)),
    };
  }, [period, nonce]);

  const VERSION_CHARTS = useMemo(
    () => [
      { key: "stock", title: "버전별 재고 소진", hint: "재고 10만장 소진까지 남은 수량", unit: "장", data: versionStockCurve() },
      { key: "p99", title: "버전별 p99 추이", hint: "부하 구간 응답 지연 p99", unit: "ms", data: versionLatencyCurve() },
      { key: "pool", title: "버전별 DB 풀 사용률", hint: "HikariCP 커넥션 점유율", unit: "%", data: versionDbPoolCurve() },
    ],
    [nonce],
  );

  const sortedBrands = useMemo(
    () => [...data.brands].sort((a, b) => b[sortKey] - a[sortKey]),
    [data.brands, sortKey],
  );

  const max = Math.max(...data.cells.map((c) => c.value), 1);
  const periodLabel = STAT_PERIODS.find((p) => p.value === period)?.label ?? "";

  function handleReset() {
    resetStats();
    setNonce((n) => n + 1);
    toast.success("지표를 리셋했습니다", { description: "집계 데이터가 다시 산출되었습니다." });
  }

  function exportCsv() {
    const rows = [
      ["브랜드", "발급", "사용", "전환율(%)"],
      ...sortedBrands.map((b) => [b.brand, b.issued, b.used, b.conversion]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupon-brand-stats-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV로 내보냈습니다");
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">통계 · 분석</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel} 기준 집계 · 누적 300만 건 규모 데이터셋 (Mock)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5">
            {STAT_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 size-4" /> 지표 리셋
          </Button>
        </div>
      </header>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "총 발급", value: kfmt(data.totalIssued) + "건", sub: `${data.totalIssued.toLocaleString("ko-KR")}건` },
          { label: "총 사용", value: kfmt(data.totalUsed) + "건", sub: `${data.totalUsed.toLocaleString("ko-KR")}건` },
          { label: "사용 전환율", value: data.conversion.toFixed(1) + "%", sub: "발급 대비 사용" },
          { label: "일평균 발급", value: kfmt(data.avgPerDay) + "건", sub: `${periodLabel} 평균` },
          { label: "피크 시간대", value: `${DAYS[data.peak.day]} ${data.peak.hour}시`, sub: `${kfmt(data.peak.value)}건` },
        ].map((kpi) => (
          <Card key={kpi.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="num mt-1 text-2xl font-bold">{kpi.value}</p>
              <p className="num mt-0.5 text-[11px] text-muted-foreground">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 퍼널 */}
      <div className="grid gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-accent" /> 발급 퍼널 ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.stages.map((s, i) => {
              const prev = data.stages[i - 1];
              const step = prev ? (s.value / prev.value) * 100 : 100;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{s.stage}</span>
                    <span className="num text-muted-foreground">
                      {s.value.toLocaleString("ko-KR")}건 · 전체 {s.rate}%
                      {prev && <span className="ml-2 text-foreground">직전 대비 {step.toFixed(1)}%</span>}
                    </span>
                  </div>
                  <Progress value={s.rate} className="mt-1.5 h-2.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>

      </div>

      {/* 추이 */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            발급 · 사용 추이 ({periodLabel} · {period === "today" ? "시간별" : "일별"})
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="aIssued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="aUsed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={kfmt} />
              <Tooltip formatter={(v: number) => v.toLocaleString("ko-KR") + "건"} />
              <Legend />
              <Area type="monotone" dataKey="issued" name="발급" stroke="var(--chart-1)" fill="url(#aIssued)" strokeWidth={2} />
              <Area type="monotone" dataKey="used" name="사용" stroke="var(--chart-2)" fill="url(#aUsed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 브랜드 탭: 차트 / 테이블 */}
      <Card className="shadow-card">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-2 sm:flex sm:justify-between">
          <CardTitle className="truncate text-base">브랜드별 성과</CardTitle>
          <button
            type="button"
            onClick={() =>
              setSortKey((k) => (k === "issued" ? "used" : k === "used" ? "conversion" : "issued"))
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
          >
            <ArrowDownUp className="size-3.5" />
            정렬: {sortKey === "issued" ? "발급" : sortKey === "used" ? "사용" : "전환율"}
          </button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="chart">
            <TabsList>
              <TabsTrigger value="chart">차트</TabsTrigger>
              <TabsTrigger value="table">테이블</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sortedBrands}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="brand" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={64} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={kfmt} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="issued" name="발급" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="l" dataKey="used" name="사용" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="conversion" name="전환율(%)" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="table">
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>브랜드</TableHead>
                      <TableHead className="text-right">발급</TableHead>
                      <TableHead className="text-right">사용</TableHead>
                      <TableHead className="text-right">전환율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBrands.map((b) => (
                      <TableRow key={b.brand}>
                        <TableCell className="font-medium">{b.brand}</TableCell>
                        <TableCell className="num text-right">{b.issued.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="num text-right">{b.used.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={b.conversion >= 55 ? "default" : "secondary"} className="num">
                            {b.conversion}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 히트맵 */}
      <div className="grid gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">요일 × 시간대 발급 히트맵 ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[640px] space-y-1">
              <div className="flex items-center gap-1 pl-7">
                {data.hours.map((h) => (
                  <span key={h} className="num flex-1 text-center text-[9px] text-muted-foreground">
                    {h % 3 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              {data.days.map((day) => (
                <div key={day} className="flex items-center gap-1">
                  <span className="w-6 text-xs text-muted-foreground">{DAYS[day]}</span>
                  {data.hours.map((hour) => {
                    const v = data.cells.find((c) => c.day === day && c.hour === hour)?.value ?? 0;
                    return (
                      <div
                        key={hour}
                        title={`${DAYS[day]} ${hour}시 · ${v.toLocaleString("ko-KR")}건`}
                        className="h-6 flex-1 rounded-sm border border-border/40 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: "var(--chart-1)",
                          opacity: 0.1 + (v / max) * 0.9,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 pt-2 text-[11px] text-muted-foreground">
                <span>적음</span>
                {[0.15, 0.35, 0.55, 0.75, 1].map((o) => (
                  <span key={o} className="size-3 rounded-sm" style={{ backgroundColor: "var(--chart-1)", opacity: o }} />
                ))}
                <span>많음 · 최대 {kfmt(max)}건</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {period === "today"
                ? "오늘 요일의 현재 시각까지 발급분만 표시합니다."
                : `${periodLabel} 누적 발급 기준입니다.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 버전별 비교 */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">엔진 버전별 비교 (v1 DB 락 · v2 Redis · v3 Kafka)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          {VERSION_CHARTS.map((chart) => (
            <div key={chart.key}>
              <p className="mb-1 text-sm font-medium">{chart.title}</p>
              <p className="mb-2 text-xs text-muted-foreground">{chart.hint}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="sec" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis tick={{ fontSize: 10 }} width={44} />
                    <Tooltip formatter={(v: number) => v.toLocaleString("ko-KR") + chart.unit} labelFormatter={(l) => `${l}초`} />
                    <Legend />
                    <Line type="monotone" dataKey="v1" name="v1 DB 락" stroke="var(--chart-5)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="v2" name="v2 Redis" stroke="var(--chart-1)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="v3" name="v3 Kafka" stroke="var(--chart-2)" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 벤치마크 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">엔진 버전 벤치마크</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={BENCHMARKS}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="version" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={kfmt} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="tps" name="TPS" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" dataKey="p99" name="p99(ms)" stroke="var(--chart-5)" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>엔진</TableHead>
                  <TableHead className="text-right">TPS</TableHead>
                  <TableHead className="text-right">p99</TableHead>
                  <TableHead className="text-right">오류율</TableHead>
                  <TableHead className="text-right">초과발급</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BENCHMARKS.map((b) => (
                  <TableRow key={b.version}>
                    <TableCell className="font-medium">
                      {b.version} · {b.label}
                    </TableCell>
                    <TableCell className="num text-right">{b.tps.toLocaleString("ko-KR")}</TableCell>
                    <TableCell className="num text-right">{b.p99} ms</TableCell>
                    <TableCell className="num text-right">{b.errorRate}%</TableCell>
                    <TableCell className="num text-right">{b.overIssued}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">정합성 검증 리포트</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>검증 규칙</TableHead>
                  <TableHead className="text-right">검사</TableHead>
                  <TableHead className="text-right">위반</TableHead>
                  <TableHead className="text-right">탐지</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {VERIFY_REPORT.map((r) => (
                  <TableRow key={r.rule}>
                    <TableCell className="max-w-56 text-sm">{r.rule}</TableCell>
                    <TableCell className="num text-right">{r.checked.toLocaleString("ko-KR")}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.violations === 0 ? "secondary" : "destructive"} className="num">
                        {r.violations}
                      </Badge>
                    </TableCell>
                    <TableCell className="num text-right">
                      {r.detected}/{r.planted}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              심어둔 결함(planted)을 모두 탐지하면 검증 로직이 정상 동작함을 의미합니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

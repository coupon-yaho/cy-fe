import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GRADE_LABEL } from "@/lib/domain";
import {
  BENCHMARKS,
  STAT_PERIODS,
  VERIFY_REPORT,
  brandStats,
  gradeStats,
  heatmap,
  heatmapDays,
  heatmapHours,
  issuanceTrend,
  resetStats,
  type StatPeriod,
} from "@/lib/metrics";


export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "통계 · 분석 — 쿠폰 야~호 관리자" },
      { name: "description", content: "브랜드별 전환율, 등급 분포, 엔진 벤치마크와 검증 리포트." },
      { property: "og:title", content: "통계 · 분석 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "브랜드 · 등급 · 엔진 비교 분석." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAnalytics,
});

const PIE_COLORS = ["#8ab0d6", "#3b6fa0", "#1e3a5f", "#0f1b3d"];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function AdminAnalytics() {
  const [period, setPeriod] = useState<StatPeriod>("30d");
  const [nonce, setNonce] = useState(0);

  // 기간/리셋이 바뀌면 즉시 재계산
  const { brands, grades, cells, days, hours, trend, totalIssued, totalUsed, conversion, peak } =
    useMemo(() => {
      const brands = brandStats(period);
      const grades = gradeStats(period);
      const cells = heatmap(period);
      const totalIssued = brands.reduce((a, b) => a + b.issued, 0);
      const totalUsed = brands.reduce((a, b) => a + b.used, 0);
      const peak = cells.reduce((a, c) => (c.value > a.value ? c : a), cells[0]!);
      return {
        brands,
        grades,
        cells,
        days: heatmapDays(period),
        hours: heatmapHours(period),
        trend: issuanceTrend(period),
        totalIssued,
        totalUsed,
        conversion: totalIssued ? (totalUsed / totalIssued) * 100 : 0,
        peak,
      };
    }, [period, nonce]);

  const max = Math.max(...cells.map((c) => c.value), 1);
  const periodLabel = STAT_PERIODS.find((p) => p.value === period)?.label ?? "";



  function handleReset() {
    resetStats();
    setNonce((n) => n + 1);
    toast.success("지표를 리셋했습니다", { description: "집계 데이터가 다시 산출되었습니다." });
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">통계 · 분석</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel} 기준 집계 데이터 (누적 300만 건 규모)
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 size-4" /> 지표 리셋
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "총 발급", value: totalIssued.toLocaleString("ko-KR") + "건" },
          { label: "총 사용", value: totalUsed.toLocaleString("ko-KR") + "건" },
          { label: "전환율", value: conversion.toFixed(1) + "%" },
          { label: "피크 시간대", value: `${DAYS[peak.day]} ${peak.hour}시` },
        ].map((kpi) => (
          <Card key={kpi.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="num mt-1 text-2xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>


      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">브랜드별 발급 · 사용</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brands}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="brand" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="issued" name="발급" fill="#3b6fa0" />
                <Bar dataKey="used" name="사용" fill="#0f1b3d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">등급별 발급 분포</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={grades.map((g) => ({ name: GRADE_LABEL[g.grade], value: g.issued }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label
                >
                  {grades.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            발급 · 사용 추이 ({periodLabel} · {period === "today" ? "시간별" : "일별"})
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="issued" name="발급" stroke="#3b6fa0" fill="#3b6fa0" fillOpacity={0.25} />
              <Area type="monotone" dataKey="used" name="사용" stroke="#0f1b3d" fill="#0f1b3d" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            요일 × 시간대 발급 히트맵 ({periodLabel})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[640px] space-y-1">
            {days.map((day) => (
              <div key={day} className="flex items-center gap-1">
                <span className="w-6 text-xs text-muted-foreground">{DAYS[day]}</span>
                {hours.map((hour) => {
                  const v = cells.find((c) => c.day === day && c.hour === hour)?.value ?? 0;
                  return (
                    <div
                      key={hour}
                      title={`${DAYS[day]} ${hour}시 · ${v.toLocaleString("ko-KR")}건`}
                      className="h-6 flex-1 rounded-sm"
                      style={{ backgroundColor: `rgba(15,27,61,${0.08 + (v / max) * 0.92})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {period === "today"
              ? "오늘 요일의 현재 시각까지 발급분만 표시합니다."
              : `${periodLabel} 누적 발급 기준입니다.`}
          </p>
        </CardContent>
      </Card>


      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">엔진 버전 벤치마크</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>엔진</TableHead>
                  <TableHead className="text-right">TPS</TableHead>
                  <TableHead className="text-right">p99</TableHead>
                  <TableHead className="text-right">초과발급</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BENCHMARKS.map((b) => (
                  <TableRow key={b.version}>
                    <TableCell className="font-medium">{b.version} · {b.label}</TableCell>
                    <TableCell className="num text-right">{b.tps.toLocaleString("ko-KR")}</TableCell>
                    <TableCell className="num text-right">{b.p99} ms</TableCell>
                    <TableCell className="num text-right">{b.overIssued}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">정합성 검증 리포트</CardTitle></CardHeader>
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
                    <TableCell className="num text-right">{r.violations}</TableCell>
                    <TableCell className="num text-right">{r.detected}/{r.planted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

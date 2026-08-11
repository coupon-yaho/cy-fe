import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
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

  void nonce;
  const brands = brandStats(period);
  const grades = gradeStats(period);
  const cells = heatmap(period);
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
        <CardHeader><CardTitle className="text-base">요일 × 시간대 발급 히트맵</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[640px] space-y-1">
            {DAYS.map((d, day) => (
              <div key={d} className="flex items-center gap-1">
                <span className="w-6 text-xs text-muted-foreground">{d}</span>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const v = cells.find((c) => c.day === day && c.hour === hour)?.value ?? 0;
                  return (
                    <div
                      key={hour}
                      title={`${d} ${hour}시 · ${v.toLocaleString("ko-KR")}건`}
                      className="h-6 flex-1 rounded-sm"
                      style={{ backgroundColor: `rgba(15,27,61,${0.08 + (v / max) * 0.92})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
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

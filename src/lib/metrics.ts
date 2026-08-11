// 관제 시계열 · 통계 사전 집계 목 데이터
import { GRADES, type Grade } from "./domain";
import { getStore } from "./mock-store";

export interface MetricPoint {
  t: number;
  label: string;
  issuePerSec: number;
  queueDepth: number;
  p50: number;
  p95: number;
  p99: number;
  c201: number;
  c202: number;
  c409: number;
  c403: number;
  c5xx: number;
  inflight: number;
  dbPool: number;
  redisLatency: number;
  kafkaLag: number;
  drift: number;
  transitionUse: number;
  transitionCancel: number;
  transitionExpire: number;
}

export type QueueMode = "IDLE" | "QUEUEING" | "DRAINING";

let series: MetricPoint[] = [];
let lastTick = 0;

function fmt(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function makePoint(t: number, prev?: MetricPoint): MetricPoint {
  const wave = Math.sin(t / 12000) * 0.5 + 0.5;
  const jitter = () => Math.random() * 0.4 + 0.8;
  const issuePerSec = Math.round((320 + wave * 900) * jitter());
  const queueDepth = Math.round((prev?.queueDepth ?? 800) * 0.85 + wave * 2600 * Math.random());
  const p50 = Math.round(18 + wave * 26 * jitter());
  const p95 = Math.round(p50 * (2.4 + Math.random()));
  const p99 = Math.round(p95 * (1.6 + Math.random() * 0.8));
  return {
    t,
    label: fmt(t),
    issuePerSec,
    queueDepth,
    p50,
    p95,
    p99,
    c201: issuePerSec,
    c202: Math.round(issuePerSec * (0.4 + wave)),
    c409: Math.round(issuePerSec * (0.12 + Math.random() * 0.25)),
    c403: Math.round(issuePerSec * (0.04 + Math.random() * 0.06)),
    c5xx: Math.random() < 0.06 ? Math.round(Math.random() * 4) : 0,
    inflight: Math.round(120 + wave * 480 * jitter()),
    dbPool: Math.min(100, Math.round(30 + wave * 65 * jitter())),
    redisLatency: Number((0.4 + Math.random() * 1.2).toFixed(2)),
    kafkaLag: Math.round(wave * 4200 * Math.random()),
    drift: Math.random() < 0.12 ? Math.round(Math.random() * 6) : 0,
    transitionUse: Math.round(issuePerSec * (0.3 + Math.random() * 0.2)),
    transitionCancel: Math.round(issuePerSec * (0.05 + Math.random() * 0.05)),
    transitionExpire: Math.random() < 0.1 ? Math.round(Math.random() * 300) : 0,
  };
}

export function metricSeries(windowSec: number): MetricPoint[] {
  const now = Date.now();
  if (series.length === 0) {
    for (let i = 900; i > 0; i--) series.push(makePoint(now - i * 1000, series[series.length - 1]));
    lastTick = now;
  }
  while (lastTick + 1000 <= now) {
    lastTick += 1000;
    series.push(makePoint(lastTick, series[series.length - 1]));
  }
  if (series.length > 1000) series = series.slice(-1000);
  return series.slice(-windowSec);
}

export function queueMode(p: MetricPoint | undefined): QueueMode {
  if (!p) return "IDLE";
  if (p.queueDepth > 1500) return "QUEUEING";
  if (p.queueDepth > 200) return "DRAINING";
  return "IDLE";
}

/* ---------- 사전 집계 통계 (300만 건 규모 대표값) ---------- */

export type StatPeriod = "today" | "7d" | "30d";

export const STAT_PERIODS: { value: StatPeriod; label: string; scale: number }[] = [
  { value: "today", label: "오늘", scale: 0.045 },
  { value: "7d", label: "7일", scale: 0.28 },
  { value: "30d", label: "30일", scale: 1 },
];

function scaleOf(period: StatPeriod) {
  return STAT_PERIODS.find((p) => p.value === period)?.scale ?? 1;
}

/** 리셋할 때마다 증가하는 시드 — 집계 지표를 초기 상태로 다시 계산 */
let statSeed = 0;

/** 관리자 통계 지표 리셋 (누적 집계를 다시 산출) */
export function resetStats() {
  statSeed += 1;
  series = [];
  lastTick = 0;
  return statSeed;
}

export function statSeedValue() {
  return statSeed;
}

export interface BrandStat {
  brand: string;
  issued: number;
  used: number;
  conversion: number;
}

export function brandStats(period: StatPeriod = "30d"): BrandStat[] {
  const s = getStore();
  const k = scaleOf(period);
  return s.brands.map((b, i) => {
    const j = i + statSeed;
    const issued = Math.round((180000 + ((j * 37711) % 140000)) * k);
    const used = Math.round(issued * (0.42 + ((j * 13) % 30) / 100));
    return {
      brand: b.name,
      issued,
      used,
      conversion: Number((issued ? (used / issued) * 100 : 0).toFixed(1)),
    };
  });
}

export function gradeStats(period: StatPeriod = "30d"): { grade: Grade; issued: number; users: number }[] {
  const base = { WELCOME: 500000, SILVER: 300000, GOLD: 150000, VIP: 50000 } as Record<Grade, number>;
  const weight = { WELCOME: 1.6, SILVER: 3.1, GOLD: 5.4, VIP: 9.2 } as Record<Grade, number>;
  const k = scaleOf(period);
  return GRADES.map((g) => ({
    grade: g,
    users: base[g],
    issued: Math.round(base[g] * weight[g] * k),
  }));
}

/** 선택 기간에 포함되는 요일(0=월) 목록 — 오늘은 오늘 요일만 */
export function heatmapDays(period: StatPeriod = "30d"): number[] {
  if (period !== "today") return [0, 1, 2, 3, 4, 5, 6];
  const js = new Date().getDay(); // 0=일
  return [(js + 6) % 7];
}

/** 선택 기간에 포함되는 시간대 — 오늘은 현재 시각까지만 */
export function heatmapHours(period: StatPeriod = "30d"): number[] {
  const last = period === "today" ? new Date().getHours() : 23;
  return Array.from({ length: last + 1 }, (_, h) => h);
}

/** 요일(0=월) × 시간(0~23) 발급 히트맵 (기간에 해당하는 셀만 반환) */
export function heatmap(period: StatPeriod = "30d"): { day: number; hour: number; value: number }[] {
  const k = scaleOf(period);
  const days = heatmapDays(period);
  const hours = heatmapHours(period);

  const cells: { day: number; hour: number; value: number }[] = [];
  const peaks = [
    [1, 14], [3, 18], [4, 11], [1, 10], [2, 15],
    [4, 19], [0, 12], [2, 16], [4, 17], [1, 13], [3, 20], [4, 7],
  ];
  for (const day of days) {
    for (const hour of hours) {
      let v = 200 + ((day * 31 + hour * 17 + statSeed * 7) % 400);
      for (const [pd, ph] of peaks) {
        const dist = Math.abs(day - pd!) * 3 + Math.abs(hour - ph!);
        if (dist < 6) v += Math.round(9000 / (1 + dist * dist));
      }
      cells.push({ day, hour, value: Math.round(v * k) });
    }
  }
  return cells;
}

export interface TrendPoint {
  label: string;
  issued: number;
  used: number;
}

/** 기간별 발급 추이 — 오늘은 시간 단위, 7일/30일은 일 단위 */
export function issuanceTrend(period: StatPeriod = "30d"): TrendPoint[] {
  const now = new Date();
  const buckets = period === "today" ? now.getHours() + 1 : period === "7d" ? 7 : 30;
  const points: TrendPoint[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    let label: string;
    let base: number;
    if (period === "today") {
      const hour = now.getHours() - i;
      label = `${String(hour).padStart(2, "0")}시`;
      base = 4200 + ((hour * 977 + statSeed * 131) % 3600) + (hour >= 10 && hour <= 20 ? 5200 : 0);
    } else {
      const d = new Date(now.getTime() - i * 86400000);
      label = `${d.getMonth() + 1}/${d.getDate()}`;
      const key = d.getDate() + d.getMonth() * 31 + statSeed * 17;
      base = 68000 + ((key * 5171) % 42000) + ([0, 6].includes(d.getDay()) ? 18000 : 0);
    }
    points.push({
      label,
      issued: base,
      used: Math.round(base * (0.44 + ((Math.abs(base) / 7) % 22) / 100)),
    });
  }
  return points;
}


export interface Benchmark {
  version: "v1" | "v2" | "v3";
  label: string;
  tps: number;
  p99: number;
  errorRate: number;
  overIssued: number;
  duration: number;
}

export const BENCHMARKS: Benchmark[] = [
  { version: "v1", label: "DB 비관적 락", tps: 1180, p99: 4210, errorRate: 0.4, overIssued: 0, duration: 62 },
  { version: "v2", label: "Redis 원자 카운터", tps: 8640, p99: 412, errorRate: 0.1, overIssued: 0, duration: 9 },
  { version: "v3", label: "Kafka 비동기", tps: 14320, p99: 186, errorRate: 0.05, overIssued: 0, duration: 6 },
];

export interface VerifyRow {
  rule: string;
  checked: number;
  violations: number;
  planted: number;
  detected: number;
}

export const VERIFY_REPORT: VerifyRow[] = [
  { rule: "재고 불변식 (총재고 = 발급+사용+잔여)", checked: 147, violations: 0, planted: 3, detected: 3 },
  { rule: "1인 1매 (UNIQUE coupon_id, user_id)", checked: 3021884, violations: 0, planted: 5, detected: 5 },
  { rule: "상태 전이 적법성", checked: 3021884, violations: 0, planted: 4, detected: 4 },
  { rule: "멱등키 응답 동일성", checked: 51204, violations: 0, planted: 2, detected: 2 },
  { rule: "만료 배치 정합성", checked: 812340, violations: 0, planted: 1, detected: 1 },
];

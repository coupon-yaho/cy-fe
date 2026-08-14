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

/* ---------- 시스템 관제 파생 지표 ---------- */

export type Health = "OK" | "WARN" | "CRIT";

export interface SloRow {
  key: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  /** true면 값이 target 이하일 때 정상 */
  lowerIsBetter: boolean;
  health: Health;
  hint: string;
}

function health(value: number, target: number, lowerIsBetter: boolean, slack = 1.25): Health {
  if (lowerIsBetter) {
    if (value <= target) return "OK";
    return value <= target * slack ? "WARN" : "CRIT";
  }
  if (value >= target) return "OK";
  return value >= target / slack ? "WARN" : "CRIT";
}

export function sloRows(points: MetricPoint[]): SloRow[] {
  const last = points[points.length - 1];
  const win = points.slice(-60);
  const total = win.reduce((a, p) => a + p.c201 + p.c202 + p.c409 + p.c403 + p.c5xx, 0) || 1;
  const errors = win.reduce((a, p) => a + p.c5xx, 0);
  const errorRate = Number(((errors / total) * 100).toFixed(3));
  const p99 = last?.p99 ?? 0;
  const availability = Number((100 - errorRate).toFixed(3));
  const drift = win.reduce((a, p) => a + p.drift, 0);

  const rows: Omit<SloRow, "health">[] = [
    { key: "p99", label: "발급 p99 지연", value: p99, unit: "ms", target: 500, lowerIsBetter: true, hint: "목표 500ms 이하" },
    { key: "err", label: "5xx 오류율", value: errorRate, unit: "%", target: 0.1, lowerIsBetter: true, hint: "목표 0.1% 이하" },
    { key: "avail", label: "가용성", value: availability, unit: "%", target: 99.9, lowerIsBetter: false, hint: "목표 99.9% 이상" },
    { key: "over", label: "초과 발급", value: 0, unit: "건", target: 0, lowerIsBetter: true, hint: "재고 불변식 위반 0건" },
    { key: "drift", label: "Redis↔DB 격차", value: drift, unit: "건", target: 0, lowerIsBetter: true, hint: "최근 60초 누적" },
  ];
  return rows.map((r) => ({ ...r, health: health(r.value, r.target, r.lowerIsBetter) }));
}

export interface BreakerRow {
  name: string;
  state: "CLOSED" | "HALF_OPEN" | "OPEN";
  failureRate: number;
  calls: number;
}

export function breakers(last: MetricPoint | undefined): BreakerRow[] {
  const base = last?.issuePerSec ?? 0;
  const defs: { name: string; f: number; c: number }[] = [
    { name: "coupon-issue", f: (last?.c5xx ?? 0) * 1.4, c: base },
    { name: "redis-stock", f: (last?.redisLatency ?? 0) * 1.2, c: Math.round(base * 1.6) },
    { name: "kafka-producer", f: (last?.kafkaLag ?? 0) / 900, c: Math.round(base * 0.8) },
  ];
  return defs.map((d) => {
    const failureRate = Number(Math.min(100, d.f).toFixed(2));
    return {
      name: d.name,
      state: failureRate > 8 ? "OPEN" : failureRate > 3 ? "HALF_OPEN" : "CLOSED",
      failureRate,
      calls: d.c,
    };
  });
}

export interface ResourceRow {
  label: string;
  value: number;
  detail: string;
}

export function resources(last: MetricPoint | undefined): ResourceRow[] {
  const inflight = last?.inflight ?? 0;
  return [
    { label: "API CPU", value: Math.min(99, Math.round(24 + inflight / 9)), detail: "8 vCPU × 3 노드" },
    { label: "API 메모리", value: Math.min(99, Math.round(38 + inflight / 22)), detail: "4 GiB / 노드" },
    { label: "DB 커넥션 풀", value: last?.dbPool ?? 0, detail: "HikariCP max 200" },
    { label: "Redis 메모리", value: Math.min(99, Math.round(41 + (last?.kafkaLag ?? 0) / 220)), detail: "12 GiB 클러스터" },
  ];
}

export interface AlertRow {
  id: string;
  at: number;
  level: Health;
  title: string;
  detail: string;
}

/** 최근 구간 임계치 위반을 알림 피드로 변환 */
export function alertFeed(points: MetricPoint[]): AlertRow[] {
  const out: AlertRow[] = [];
  for (const p of points.slice(-120)) {
    if (p.c5xx > 2) out.push({ id: `5xx-${p.t}`, at: p.t, level: "CRIT", title: "5xx 급증", detail: `${p.c5xx}건 / 초 · 발급 API` });
    else if (p.p99 > 500) out.push({ id: `p99-${p.t}`, at: p.t, level: "WARN", title: "p99 지연 초과", detail: `${p.p99}ms (목표 500ms)` });
    else if (p.drift > 0) out.push({ id: `drift-${p.t}`, at: p.t, level: "WARN", title: "재고 격차 감지", detail: `Redis↔DB ${p.drift}건 · 보정 배치 대기` });
    else if (p.queueDepth > 2500) out.push({ id: `q-${p.t}`, at: p.t, level: "WARN", title: "대기열 급증", detail: `${p.queueDepth.toLocaleString("ko-KR")}명 대기` });
  }
  return out.slice(-12).reverse();
}

/* ---------- 분석 파생 지표 ---------- */

export interface FunnelStage {
  stage: string;
  value: number;
  rate: number;
}

/** 조회 → 입장 → 발급 → 사용 퍼널 */
export function funnel(period: StatPeriod = "30d"): FunnelStage[] {
  const brands = brandStats(period);
  const issued = brands.reduce((a, b) => a + b.issued, 0);
  const used = brands.reduce((a, b) => a + b.used, 0);
  const view = Math.round(issued * 4.6);
  const entry = Math.round(issued * 2.1);
  const raw = [
    { stage: "이벤트 조회", value: view },
    { stage: "대기열 입장", value: entry },
    { stage: "발급 성공", value: issued },
    { stage: "쿠폰 사용", value: used },
  ];
  return raw.map((r) => ({ ...r, rate: Number(((r.value / (view || 1)) * 100).toFixed(1)) }));
}

export interface PolicySlice {
  policy: string;
  issued: number;
  used: number;
}

export function policyMix(period: StatPeriod = "30d"): PolicySlice[] {
  const brands = brandStats(period);
  const split = [0.46, 0.33, 0.21];
  const labels = ["정률 + 상한", "정액", "데이터"];
  const issued = brands.reduce((a, b) => a + b.issued, 0);
  const used = brands.reduce((a, b) => a + b.used, 0);
  return labels.map((policy, i) => ({
    policy,
    issued: Math.round(issued * split[i]!),
    used: Math.round(used * split[i]! * (0.9 + i * 0.08)),
  }));
}

/* ---------- 엔진 버전(v1/v2/v3) 비교 시계열 ---------- */

export interface VersionSeriesPoint {
  sec: number;
  v1: number | null;
  v2: number | null;
  v3: number | null;
}

const TOTAL_STOCK = 100000;

function seeded(n: number) {
  const x = Math.sin(n * 12.9898 + statSeed * 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

/** 버전별 재고 소진 곡선 (남은 재고, 초 단위) */
export function versionStockCurve(): VersionSeriesPoint[] {
  const maxSec = Math.max(...BENCHMARKS.map((b) => b.duration));
  const out: VersionSeriesPoint[] = [];
  for (let sec = 0; sec <= maxSec; sec++) {
    const point: VersionSeriesPoint = { sec, v1: null, v2: null, v3: null };
    for (const b of BENCHMARKS) {
      if (sec > b.duration) continue;
      const consumed = Math.min(TOTAL_STOCK, Math.round(b.tps * sec * (0.9 + seeded(sec + b.tps) * 0.2)));
      point[b.version] = Math.max(0, TOTAL_STOCK - consumed);
    }
    out.push(point);
  }
  return out;
}

/** 버전별 p99 지연 추이 (부하 구간, 초 단위) */
export function versionLatencyCurve(): VersionSeriesPoint[] {
  const maxSec = Math.max(...BENCHMARKS.map((b) => b.duration));
  const out: VersionSeriesPoint[] = [];
  for (let sec = 0; sec <= maxSec; sec++) {
    const point: VersionSeriesPoint = { sec, v1: null, v2: null, v3: null };
    for (const b of BENCHMARKS) {
      if (sec > b.duration) continue;
      const ramp = Math.min(1, sec / Math.max(1, b.duration * 0.35));
      point[b.version] = Math.round(b.p99 * (0.35 + ramp * 0.75) * (0.9 + seeded(sec * 3 + b.p99) * 0.2));
    }
    out.push(point);
  }
  return out;
}

/** 버전별 DB 커넥션 풀 사용률 (%) */
export function versionDbPoolCurve(): VersionSeriesPoint[] {
  const maxSec = Math.max(...BENCHMARKS.map((b) => b.duration));
  const peaks: Record<Benchmark["version"], number> = { v1: 99, v2: 62, v3: 38 };
  const out: VersionSeriesPoint[] = [];
  for (let sec = 0; sec <= maxSec; sec++) {
    const point: VersionSeriesPoint = { sec, v1: null, v2: null, v3: null };
    for (const b of BENCHMARKS) {
      if (sec > b.duration) continue;
      const ramp = Math.min(1, sec / Math.max(1, b.duration * 0.25));
      point[b.version] = Math.round(
        Math.min(100, peaks[b.version] * (0.3 + ramp * 0.72) * (0.95 + seeded(sec * 7 + peaks[b.version]) * 0.1)),
      );
    }
    out.push(point);
  }
  return out;
}

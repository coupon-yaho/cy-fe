/**
 * 관리자 관제 계약.
 *
 * AB-관리자-구현가이드-상세설계도 의 티켓 시그니처를 그대로 옮겼습니다.
 *   A-06  GET /api/v1/admin/overview              운영 현황 O1~O7
 *   A-10  GET /api/v1/admin/coupon-metrics        D1 패널 1~7
 *   OBS-15 GET /api/v1/admin/events               D1 8 · 운영 현황 O5  (커서)
 *   A-08  GET /api/v1/admin/issuance-histories    D1 9 · 운영 현황 O6  (커서)
 *   OBS-6 GET /api/v1/admin/metrics?window=       D2 KPI 6 + 패널 11~21
 *   OBS-14b GET /api/v1/admin/benchmarks          D3 22~25
 *   A-11  GET /api/v1/admin/analytics             26~28 (캠페인 관리 기획 참고)
 *   A-07  GET /api/v1/admin/members/issuance-inquiries
 *
 * 백엔드 관리자 API 응답을 화면 계약으로 옮깁니다.
 */

/* ── 값 상태 계약 7종 (AB-G0 · G0-05 SourceStatus) ─────────
   빈칸과 0을 구분하지 못하면 관제가 아닙니다. 모든 패널이 같은 상태를 씁니다.

   WARMING_UP(표본 미달) 과 UNAVAILABLE(원천 접근 불가) 은 다른 사건입니다.
   하나로 합치면 둘 중 하나를 표현할 수단이 사라집니다. */

export type SourceState =
  /** 현재 실행 기준 유효 */
  | "VALID"
  /** 최종 집계 전 · 판정 금지 */
  | "PENDING"
  /** 백분위 계산에 필요한 표본이 아직 모자람 — 곧 값이 나옵니다 */
  | "WARMING_UP"
  /** observedAt 이 허용 지연 초과 */
  | "STALE"
  /** 요청 없음 — 장애가 아닙니다 */
  | "NO_TRAFFIC"
  /** 원천에 접근할 수 없음 — 값이 있어도 현재값이 아닙니다 */
  | "UNAVAILABLE"
  /** 이 버전에 없는 기능 */
  | "N_A";

export const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  VALID: "유효",
  PENDING: "집계 전",
  WARMING_UP: "표본 부족",
  STALE: "갱신 지연",
  NO_TRAFFIC: "요청 없음",
  UNAVAILABLE: "원천 불가",
  N_A: "해당 없음",
};

export const SOURCE_STATE_NOTE: Record<SourceState, string> = {
  VALID: "현재 실행 기준 유효한 값입니다.",
  PENDING: "최종 집계 전이라 이 값으로 판정하면 안 됩니다.",
  WARMING_UP: "p99 같은 값을 낼 표본이 아직 모자랍니다.",
  STALE: "관측 시각이 허용 지연을 넘었습니다. 마지막 값은 참고값입니다.",
  NO_TRAFFIC: "해당 구간에 요청이 없었습니다. 장애가 아닙니다.",
  UNAVAILABLE: "원천에 접근할 수 없습니다. 남은 값을 현재값으로 읽으면 안 됩니다.",
  N_A: "이 버전에는 없는 기능입니다.",
};

/** 원천 5종 — 패널 우상단 칩. 칩만 훑어도 데이터 토폴로지가 보입니다. */
export type SourceKind = "REDIS" | "MICROMETER" | "MYSQL" | "IN_MEMORY" | "KAFKA";

/** 값과 상태는 항상 분리합니다. 값이 null 이면서 state 가 VALID 인 경우는 없습니다. */
export interface SourceValue<T> {
  value?: T | null | undefined;
  state: SourceState;
  observedAt?: string | null | undefined;
  /** 화면에 그대로 노출할 짧은 단서 */
  note?: string;
}

/**
 * gap 전용 값 (AB-G0 · G0-05).
 *
 * SourceValue<number> 와 구조는 같지만 허용 상태가 5종으로 좁습니다 —
 * gap 은 표본 개수로 계산하는 값이 아니고(WARMING_UP 없음),
 * 요청이 없다고 격차가 사라지지도 않습니다(NO_TRAFFIC 없음).
 * 별칭으로 두면 이 두 상태가 타입으로 막히지 않으므로 별도 타입으로 둡니다.
 *
 * observedAt = min(사용된 원천 시각) 이되 VALID 일 때만 새로 계산합니다.
 */
export type GapState = Extract<SourceState, "VALID" | "PENDING" | "STALE" | "UNAVAILABLE" | "N_A">;

export interface GapValue {
  value?: number | null | undefined;
  state: GapState;
  observedAt?: string | null | undefined;
  note?: string;
}

/** 공통 응답 메타 — snapshotAt · windowStart/End · stale 은 원천별로 표현합니다. */
export interface ResponseMeta {
  schemaVersion: 1;
  snapshotAt: string;
  windowStart: string;
  windowEnd: string;
  collectionDurationMs: number;
  sources: Partial<Record<SourceKind, SourceState>>;
}

import type { QueueMode } from "@/lib/runtime-config";

export type { QueueMode };

/** 요청 파라미터 — 축약형만 보냅니다 */
export type MetricsWindow = "1m" | "5m" | "15m";
/** 응답 표기 — 서버는 enum 이름으로 돌려줍니다 (admin-api-spec §6.1) */
export type MetricsWindowName = "ONE_MINUTE" | "FIVE_MINUTES" | "FIFTEEN_MINUTES";
export const WINDOW_NAME: Record<MetricsWindow, MetricsWindowName> = {
  "1m": "ONE_MINUTE",
  "5m": "FIVE_MINUTES",
  "15m": "FIFTEEN_MINUTES",
};
export type EngineVersion = "v1" | "v2" | "v3";

export const ENGINE_LABEL: Record<EngineVersion, string> = {
  v1: "v1 DB Lock",
  v2: "v2 Redis Lua",
  v3: "v3 Kafka",
};

/** 시계열 한 점. x 는 epoch ms. */
export interface Point {
  t: number;
  [series: string]: number;
}

/* ══ 운영 현황 (A-06) ══════════════════════════════ */

/** GET /api/v1/admin/overview 응답. */
export interface LiveAdminOverviewResponse {
  snapshotAt: string;
  overallStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  actionRequired: SourceValue<{
    totalCount: number;
    urgentCount: number;
    warningCount: number;
  }>;
  openingSoon: SourceValue<{
    totalCount: number;
    preparationIncompleteCount: number;
  }>;
  queueRisk: SourceValue<{
    thresholdExceededCount: number;
    longestWait?: string | null;
  }>;
  stockRisk: SourceValue<{
    depletionRiskCount: number;
    nearestDepletion?: string | null;
  }>;
  aggregateIssuanceRate: SourceValue<{
    currentPerSecond: number;
    sessionPeakPerSecond: number;
  }>;
  aggregateQueue: SourceValue<{
    waitingCount: number;
    admissionsPerSecond: number;
    estimatedWait?: string | null;
  }>;
  latencySummary: SourceValue<{
    successfulP99?: string | null;
    failedP99?: string | null;
    windowStart: string;
    windowEnd: string;
  }>;
  couponRoundStatusSummary: SourceValue<{
    openCount: number;
    scheduledCount: number;
    closedCount: number;
  }>;
  actionItems: SourceValue<{
    totalCount: number;
    topItems: LiveOperationActionItem[];
  }>;
  couponRounds: SourceValue<LiveCampaignOverview[]>;
  customerOutcomes: SourceValue<{
    windowStart: string;
    windowEnd: string;
    totalCount: number;
    outcomes: {
      type: string;
      count: number;
      ratio: number;
      displayText: string;
    }[];
  }>;
}

export interface LiveRecommendedAction {
  code: string;
  displayText: string;
  targetScreen: string;
}

export interface LiveOperationActionItem {
  couponId: number;
  couponName: string;
  opensAt?: string | null;
  severity: string;
  customerImpact: string;
  customerImpactText?: string | null;
  detectedAt: string;
  duration?: string | null;
  recommendedAction?: LiveRecommendedAction | null;
}

export interface LiveCampaignOverview {
  priority: number;
  couponId: number;
  couponName: string;
  brandName: string;
  status: string;
  opensAt: string;
  closesAt?: string | null;
  severity: string;
  issuanceFlow: SourceValue<{
    currentPerMinute: number;
    windowStart: string;
    windowEnd: string;
    points: { observedAt: string; issuancesPerMinute: number }[];
    state: string;
    stateDuration?: string | null;
  }>;
  couponRoundQueueStatus: SourceValue<{
    waitingCount: number;
    trend: string;
    waitingDeltaPerMinute: number;
    admissionsPerMinute?: number | null;
    estimatedWait?: string | null;
    assessment: string;
  }>;
  stockForecast: SourceValue<{
    remainingQuantity: number;
    totalQuantity: number;
    remainingRatio: number;
    estimatedDepletion?: string | null;
  }>;
  failedPreparationItems: string[];
  customerImpact: string;
  customerImpactText?: string | null;
  recommendedAction?: LiveRecommendedAction | null;
}

export interface AdminOverviewQuery {
  brandId?: number | null;
  filter?: "ALL" | "ACTION" | "OPENING" | "RUNNING";
}

/* ══ D1 캠페인 상세 (A-10) ═════════════════════════ */

/** GET /api/v1/admin/coupon-metrics 응답. */
export interface LiveCouponMetricsResponse {
  couponId: number;
  snapshotAt: string;
  window: MetricsWindowName;
  stock: {
    initialCount: SourceValue<number>;
    remainingCount: SourceValue<number>;
  };
  issuanceProgress: SourceValue<number>;
  issuanceRate: SourceValue<{
    currentPerSecond: number;
    peakPerSecond: number;
  }>;
  queue: {
    waitingCount: SourceValue<number>;
    estimatedWaitMillis: SourceValue<number>;
  };
  couponRound: { status: string; opensAt: string } | null;
  usageRatio: SourceValue<number>;
  holdingCounts: SourceValue<{
    unusedCount: number;
    usedCount: number;
    cancelledCount: number;
    expiredCount: number;
  }>;
  transitionRate: SourceValue<{
    usePerSecond: number;
    cancelUsePerSecond: number;
    cancelPerSecond: number;
    expirePerSecond: number;
  }>;
}

/* ══ 스트림 (OBS-15 · A-08) ════════════════════════ */

/** 8 발급 이벤트 — 실패 이벤트가 어디에도 남지 않아 새로 만든 파이프라인입니다 */
export interface IssuanceAttemptEvent {
  eventId: string;
  occurredAt: string;
  memberId: number;
  couponRoundId: number;
  campaign: string;
  code: string | null;
  httpStatus: number;
  reasonCode: string | null;
  grade: string;
  queuePosition: number | null;
}

export interface EventSlice {
  meta: ResponseMeta;
  events: IssuanceAttemptEvent[];
  nextCursor: string | null;
  /** 층화 샘플링으로 생략된 건수 */
  droppedCount: number;
  sampled: boolean;
}

/** 9 상태 전이 — coupon_histories 커서 폴링. 전이는 성공만 존재합니다 */
export interface IssuanceHistoryRow {
  id: number | string;
  occurredAt: string;
  code: string;
  from: string;
  to: string;
  note: string;
}

export interface HistorySlice {
  meta: ResponseMeta;
  histories: IssuanceHistoryRow[];
  nextCursor: string | null;
  /** DB 커서라 유실이 없습니다 */
  droppedCount: 0;
}

/* ══ D2 시스템 관제 (OBS-6) ════════════════════════ */

export type GapType = "LUA_GAP" | "ACTIVE_DB_GAP" | "PERSIST_GAP" | "DB_COUNTER_GAP";

export const GAP_LABEL: Record<GapType, string> = {
  LUA_GAP: "luaGap",
  ACTIVE_DB_GAP: "activeDbGap",
  PERSIST_GAP: "persistGap",
  DB_COUNTER_GAP: "dbCounterGap",
};

export type ConsistencyPhase = "LIVE" | "FINAL";
export type Verdict = "PASS" | "FAIL" | null;

/**
 * 운영 대응 우선순위 (AB-G0 · G0-13).
 *
 * 합성은 CRITICAL > WARN > NONE. 평가 가능한 gap 이 없으면 null 이고,
 * null 을 NONE 으로 바꾸지 않습니다 — "문제 없음" 과 "판단 불가" 는 다릅니다.
 * 값은 A-05 가 계산해 내려줍니다. 화면이 gap 을 보고 다시 판정하면 규칙이 두 곳으로 갈립니다.
 */
export type Severity = "NONE" | "WARN" | "CRITICAL";

/**
 * 응답시간 uri 그룹 (B 단독 결정 · AB-G0 근거 없음).
 *
 * 발급·입장·순번 폴링·조회·상태 전이는 응답 시간대가 자릿수로 다릅니다.
 * 한 선에 합치면 /queue 폴링이 전체를 끌어내려 발급 지연이 안 보입니다.
 */
export type UriGroup = "ISSUE" | "ENTRY" | "QUEUE_POLL" | "LOOKUP" | "TRANSITION";

export const URI_GROUP_LABEL: Record<UriGroup, string> = {
  ISSUE: "발급",
  ENTRY: "입장",
  QUEUE_POLL: "순번 폴링",
  LOOKUP: "조회",
  TRANSITION: "상태 전이",
};

export interface BreakerRow {
  name: "dbCB" | "redisCB" | "kafkaCB";
  failureRate: SourceValue<number>;
  state: "CLOSED" | "OPEN" | "HALF_OPEN" | null;
}

export interface RunScope {
  /** 서버가 주는 범위 구분 (admin-api-spec §6.1) */
  type: "GLOBAL" | "COUPON" | "BENCHMARK_RUN";
  couponId?: number;
  benchmarkRunId?: number;
  /**
   * 실행 메타 — 벤치마크 API(7.x)가 붙어야 채워집니다. 관제 응답에는 없으므로 optional 입니다.
   * 없으면 화면이 상단 칩을 접습니다. 0 이나 "-" 로 채우지 않습니다.
   */
  runId?: string;
  engine?: EngineVersion;
  queueMode?: QueueMode;
  campaign?: string;
  instances?: number;
  aggregation?: "max" | "sum";
  runState?: "IDLE" | "RUNNING" | "DRAINING" | "DONE";
}

export interface AdminMetricsKpi {
  /** 과제 합격 판정 — 스크롤 없이 가장 먼저 보여야 하는 숫자. 미계산을 0 으로 만들지 않습니다 */
  overIssued: GapValue;
  overIssuedZeroSeconds: number;
  gapsValid: number;
  gapsPending: number;
  issueAttemptRps: SourceValue<number>;
  issueAttemptDelta: number;
  attemptBreakdown: { success: number; reject: number; queued: number };
  issueP99Ms: SourceValue<number>;
  issueP99Delta: number;
  issueP99TargetMs: number;
  systemFailureRate: SourceValue<number>;
  systemFailureTargetPct: number;
  persistLag: SourceValue<number>;
  persistLagDeltaPerSec: number;
  persistLagDrainSeconds: number | null;
  breakers: BreakerRow[];
  breakerThresholdPct: number;
}

export interface ConsistencyPanel {
  phase: ConsistencyPhase;
  /** 정합성 판정 — LIVE 에서는 키가 생략되거나 null */
  verdict?: Verdict;
  /**
   * 운영 대응 우선순위 — verdict 와는 다른 축입니다.
   * 어느 한쪽에서 파생시키지 않습니다. 평가 가능한 gap 이 없으면 null.
   */
  severity?: Severity | null;
  /** gap 과 같은 층이 아닙니다 (G0-04). 배열에 넣으면 렌더 루프가 다섯 칸을 그립니다 */
  overIssued: GapValue;
  /** gap 4종 — 서버가 평탄한 필드로 내려줍니다 (admin-api-spec §6.1) */
  luaGap: GapValue;
  activeDbGap: GapValue;
  dbCounterGap: GapValue;
  persistGap: GapValue;
  /** 발급 원장 대사 — 원천(DB 조회)이 아직 없어 optional 입니다 */
  issuedPlusUsed?: number;
  totalQuantity?: number;
}

/**
 * uri 그룹별 백분위 — 전체 집계 옆에 붙는 분해 축입니다.
 * 전체 집계 필드를 대체하지 않습니다 (KPI 카드가 전체 집계를 씁니다).
 */
export interface LatencyGroupStat {
  group: UriGroup;
  p50: SourceValue<number>;
  p95: SourceValue<number>;
  p99: SourceValue<number>;
  series: Point[];
}

/** 백분위 3종은 한 원천에서 같이 나옵니다. 상태도 하나입니다 (admin-api-spec §6.1) */
export interface Percentiles {
  p50Millis: number;
  p95Millis: number;
  p99Millis: number;
}

export interface LatencyPanel {
  /** 13 성공 응답시간 — 주 KPI */
  success: SourceValue<Percentiles>;
  /** 14 실패 응답시간 — 정책 거절과 시스템 실패는 축이 다릅니다 */
  policyReject: SourceValue<Percentiles>;
  systemFailure: SourceValue<Percentiles>;
  /** 시계열·uri 그룹 분해는 아직 서버에 없습니다 (OBS-11) */
  successSeries?: Point[];
  groups?: LatencyGroupStat[];
}

/** 15 의존성 지연 — 최상위 블록입니다. 통계 종류가 달라 한 축에 합치지 않습니다 */
export interface DependencyPanel {
  redis: SourceValue<{ p95Millis?: number; p99Millis?: number; errorRate?: number }>;
  hikari: SourceValue<{ p95Millis?: number; p99Millis?: number; errorRate?: number }>;
  kafka: SourceValue<{ p95Millis?: number; p99Millis?: number; errorRate?: number }>;
}

/** 영속화 lag — 최상위 블록. 원천(Kafka consumer lag)이 아직 없어 PENDING 으로 옵니다 */
export interface PersistenceLag {
  lagTotal: number;
  partitionMax: number;
  arrivalRate: number;
  consumeRate: number;
  netDrainRate: number;
  drainEtaMillis: number | null;
}

/** 회로 차단기 — 최상위 배열. Resilience4j 도입 전이라 지금은 항상 빈 배열입니다 */
export interface CircuitBreakerRow {
  name: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  openedAt?: string;
}

export type TrafficKey =
  | "issueAttemptRps"
  | "issueSuccessTps"
  | "queueAcceptedRps"
  | "policyRejectRps"
  | "systemFailureRps";

/** 결과 분류 라벨 — 서버는 키만 주고 화면 문구는 프론트 상수입니다 */
export const TRAFFIC_LABEL: Record<TrafficKey, string> = {
  issueAttemptRps: "발급 시도",
  issueSuccessTps: "발급 성공",
  queueAcceptedRps: "대기 진입",
  policyRejectRps: "정책 거절",
  systemFailureRps: "시스템 실패",
};

export interface TrafficPanel {
  /**
   * 16 결과 분류 처리량 — 차감식 금지, 전용 Counter 5종.
   * totalRps 는 폐기됐습니다. 폴링·조회가 섞여 있어 분모로도 배경으로도 쓰지 않습니다.
   */
  issueAttemptRps: SourceValue<number>;
  issueSuccessTps: SourceValue<number>;
  queueAcceptedRps: SourceValue<number>;
  policyRejectRps: SourceValue<number>;
  systemFailureRps: SourceValue<number>;
  /** 시계열은 서버가 주지 않습니다 — 화면이 폴링으로 누적합니다. 목에서만 채워집니다 */
  series?: Point[];
  markers?: { t: number; label: string }[];
}

export interface ErrorPanel {
  /** 17 시스템 실패율 — 분모는 issueAttemptRps 로 고정, 정책 거절은 분자에서 제외 */
  denominator: TrafficKey;
  classes: {
    key: "dependencyFailure" | "applicationFailure" | "clientObservedFailure" | "policyReject";
    label: string;
    definition: string;
    excludedFromNumerator: boolean;
    rate: SourceValue<number>;
  }[];
  /** 시계열은 서버가 주지 않습니다 — 화면 누적. 목에서만 채워집니다 */
  series?: Point[];
  /** 18 실패 원인 Top N — 저카디널리티 화이트리스트만 */
  topReasons: { httpStatus: number | string; reasonCode: string; count: number }[];
}

export interface ResourceRow {
  name: string;
  detail: string;
  utilization: SourceValue<number>;
  /** 자원마다 임계가 다릅니다. 공통 임계는 폐기했습니다 */
  warnAt: number;
}

export interface SaturationPanel {
  /** 19 자원별 포화 */
  resources: ResourceRow[];
  /** 20 in-flight — Saturation 선행지표이자 ADAPTIVE 입력 */
  inFlight: {
    globalSum: SourceValue<number>;
    instanceMax: SourceValue<number>;
    instanceId: string;
    activeInstances: number;
    mode: "ON" | "OFF";
    admitThreshold: number;
    releaseThreshold: number;
    series: Point[];
  };
  /** 21 큐 3영역 — 의미가 다른 큐를 합치지 않습니다 */
  queues: {
    zone: "Admission" | "Persistence" | "Telemetry";
    metrics: { label: string; value: SourceValue<number>; unit?: string }[];
    series: Point[];
  }[];
  thresholds: { warn: number; high: number; critical: number };
}

/**
 * 관제 응답 — admin-api-spec.md §6.1 이 정본입니다.
 *
 * kpi 블록은 없습니다. KPI 6칸에 필요한 값이 이미 다른 블록에 있어서, 같은 값을 두 자리에
 * 두지 않기로 했습니다(백엔드 회신). 화면이 consistency·traffic·latency 에서 읽습니다.
 * errors · saturation 은 서버 미구현이라 optional 입니다 — 없으면 화면이 미구현이라 적습니다.
 */
export interface AdminMetricsResponse {
  meta: ResponseMeta;
  window: MetricsWindowName;
  scope: RunScope;
  snapshotAt: string;
  consistency: ConsistencyPanel;
  traffic: TrafficPanel;
  latency: LatencyPanel;
  dependencies: DependencyPanel;
  persistence: SourceValue<PersistenceLag>;
  circuitBreakers: CircuitBreakerRow[];
  /** 17·18 — 백엔드 OBS-13 대기 */
  errors?: ErrorPanel;
  /** 19·20·21 — 백엔드 신규 티켓 대기 */
  saturation?: SaturationPanel;
}

/** KPI 6칸의 프론트 상수 — 서버가 매 폴링마다 실어 보낼 이유가 없는 값들입니다 */
export const KPI_TARGET = { issueP99Ms: 100, systemFailurePct: 0.1, breakerPct: 50 } as const;

/* ══ D3 분석·비교 (OBS-14b) ════════════════════════ */

/** 실제 GET /api/v1/admin/benchmarks 목록 응답. */
export interface LiveBenchmarkListResponse {
  items: {
    benchmarkRunId: number;
    engineVersion: "V1" | "V2" | "V3";
    scenarioCode: string;
    startedAt: string;
    runStatus: "RUNNING" | "LOAD_STOPPED" | "OBSERVED" | "FINALIZED";
    archiveStatus: "NONE" | "IN_PROGRESS" | "DONE" | "FAILED";
  }[];
  nextBeforeCursor?: string | null;
  hasOlder: boolean;
}

/* ══ 기획 참고 (A-11) ══════════════════════════════ */

export interface AdminAnalyticsResponse {
  meta: ResponseMeta;
  asOf: string;
  /** 26 브랜드별 월별 발급 추이 — 수량 배정 근거 */
  brandTrend: {
    months: string[];
    series: { brandId: number; name: string; values: number[] }[];
  };
  /** 27 요일 × 시간 히트맵 — 오픈 시각 근거 */
  heatmap: {
    hours: number[];
    /** [요일 0=월][시간 index] */
    grid: number[][];
    peak: { day: number; hour: number; value: number };
  };
  /** 28 상태 전이 퍼널 — 유효기간 정책 근거 */
  funnel: { stage: string; label: string; count: number; ratio: number }[];
  /** 실제 백엔드 집계 원천 상태. 목 응답에는 없을 수 있습니다. */
  sourceStates?: {
    brandTrend: SourceState;
    heatmap: SourceState;
    funnel: SourceState;
  };
}

/* ══ 회원 발급 문의 (A-07) ═════════════════════════ */

export interface MemberInquiryRow {
  occurredAt: string;
  campaign: string;
  kind: "ATTEMPT" | "TRANSITION";
  result: string;
  note: string;
  httpStatus: number | null;
}

export interface MemberInquiryResponse {
  meta: ResponseMeta;
  member: { memberId: number; grade: string };
  totals: {
    held: number;
    used: number;
    expired: number;
    cancelled: number;
    attempts: number;
    failures: number;
  };
  rows: MemberInquiryRow[];
}

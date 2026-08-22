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
 * 백엔드 미구현입니다. 목 어댑터가 같은 계약으로 응답하고,
 * 컨트롤러가 붙으면 http 어댑터만 켜면 됩니다.
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
  value: T | null;
  state: SourceState;
  observedAt: string | null;
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
  value: number | null;
  state: GapState;
  observedAt: string | null;
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

export type MetricsWindow = "1m" | "5m" | "15m";
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

export type ActionSeverity = "URGENT" | "WARNING" | "READY";

export const ACTION_SEVERITY_LABEL: Record<ActionSeverity, string> = {
  URGENT: "긴급",
  WARNING: "주의",
  READY: "준비",
};

/** 조치 필요 항목 — 지속 시간이 긴 것이 위로 올라옵니다. */
export interface OverviewAction {
  couponRoundId: number;
  severity: ActionSeverity;
  campaign: string;
  brandId: number;
  /** 진행 중 · 13:40 오픈 */
  phase: string;
  /** 고객에게 어떤 영향이 있는지 한 문장 */
  impact: string;
  /** 얼마나 오래 지속됐는지 */
  duration: string;
  /** 이동할 화면 */
  link: "detail" | "system";
  linkLabel: string;
}

export type CampaignOpsState =
  "ADMISSION_STALLED" | "ISSUING" | "PREPARING" | "SOLD_OUT" | "CLOSED";

export const CAMPAIGN_OPS_LABEL: Record<CampaignOpsState, string> = {
  ADMISSION_STALLED: "입장 처리 중단",
  ISSUING: "정상 발급 중",
  PREPARING: "준비 확인 필요",
  SOLD_OUT: "재고 소진",
  CLOSED: "마감",
};

/** 캠페인 운영 상태 한 줄 — 장애 심각도가 아니라 조치 우선순위 순입니다. */
export interface OverviewCampaign {
  priority: number;
  couponRoundId: number;
  campaign: string;
  brandId: number;
  phase: string;
  openAt: string;
  closeAt: string | null;
  remaining: number;
  total: number;
  opsState: CampaignOpsState;
  waiting: SourceValue<number>;
  /** 예상 고객 영향 — 계산할 수 없으면 null 로 두고 추정하지 않습니다 */
  etaText: string | null;
  customerImpact: string;
  nextAction: string;
}

/** O1 캠페인 발급 흐름 */
export interface FlowItem {
  couponRoundId: number;
  campaign: string;
  perMinute: SourceValue<number>;
  verdict: string;
  series: Point[];
}

/** O2 캠페인 대기 상태 — 대기 인원이 많은 것 자체는 장애가 아닙니다 */
export interface QueueItem {
  couponRoundId: number;
  campaign: string;
  waiting: SourceValue<number>;
  trendPerMinute: number;
  admittedPerMinute: SourceValue<number>;
  /** 처리율이 0이면 null — 임의로 추정하지 않습니다 */
  etaSeconds: number | null;
  verdict: string;
  healthy: boolean;
}

export type OutcomeKey =
  | "ISSUED"
  | "QUEUE_ACCEPTED"
  | "ALREADY_ISSUED"
  | "SOLD_OUT"
  | "NOT_ELIGIBLE"
  | "ENTRY_EXPIRED"
  | "SYSTEM_FAILURE";

/** O3 고객이 받은 결과 — 정책 결과와 장애를 색으로 구분합니다 */
export interface OutcomeItem {
  key: OutcomeKey;
  label: string;
  count: number;
  ratio: number;
  /** 장애 색은 시스템 문제에만 씁니다 */
  isFailure: boolean;
}

/** O4 재고와 소진 예상 */
export interface StockItem {
  couponRoundId: number;
  campaign: string;
  remaining: number;
  total: number;
  ratePerMinute: SourceValue<number>;
  /** 발급 속도를 쓸 수 없으면 null — 계산 불가로 둡니다 */
  exhaustEtaMinutes: number | null;
  nextAction: string;
}

/** O6 상태 변경 요약 */
export interface StatusSummary {
  used: number;
  cancelUse: number;
  cancelIssue: number;
  expired: number;
  stockRestored: number;
  failed: number;
  /** 같은 시각 대량 배치 이벤트는 한 줄로 묶습니다 */
  batches: { at: string; title: string; detail: string }[];
}

/** O7 고객 알림 발송 */
export interface NotificationSummary {
  sent: number;
  pending: number;
  failed: number;
}

export interface AdminOverviewResponse {
  meta: ResponseMeta;
  dataStatus: SourceState;
  counts: {
    actionRequired: number;
    actionRequiredDetail: string;
    openingSoon: number;
    openingSoonDetail: string;
    waitOverThreshold: number;
    waitOverThresholdDetail: string;
    stockAtRisk: number;
    stockAtRiskDetail: string;
  };
  actions: OverviewAction[];
  campaigns: OverviewCampaign[];
  flow: FlowItem[];
  queues: QueueItem[];
  outcomes: OutcomeItem[];
  stock: StockItem[];
  statusSummary: StatusSummary;
  notifications: NotificationSummary;
}

export interface AdminOverviewQuery {
  brandId?: number | null;
  filter?: "ALL" | "ACTION" | "OPENING" | "RUNNING";
}

/* ══ D1 캠페인 상세 (A-10) ═════════════════════════ */

export interface CouponMetricsResponse {
  meta: ResponseMeta;
  couponRoundId: number;
  campaign: string;
  brandId: number;
  /** 1 잔여 재고 */
  remainingStock: SourceValue<{ remaining: number; total: number }>;
  /** 2 발급 진행률 */
  progress: SourceValue<{ issued: number; total: number; ratio: number }>;
  /** 3 초당 발급 — Micrometer 는 B 영역이지만 A 의 API 가 값만 받아 서빙합니다 */
  issueRate: SourceValue<{ current: number; peak: number }>;
  /** 4 대기 인원 */
  queue: SourceValue<{ waiting: number; etaSeconds: number | null }>;
  roundStatus: SourceValue<{ status: string; openAt: string }>;
  usageRate: SourceValue<number>;
  /** 5 상태별 보유량 */
  statusBreakdown: SourceValue<{
    ISSUED: number;
    USED: number;
    CANCELLED: number;
    EXPIRED: number;
  }>;
  /** 6 알림 발송 — 오픈 T-5분 */
  notification: SourceValue<{
    sentRate: number;
    sent: number;
    total: number;
    pending: number;
    failed: number;
    dlq: number;
  }>;
  /** 7 상태 전이 rate — 만료 배치가 스파이크를 만듭니다 */
  transitionRate: SourceValue<Point[]>;
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
  id: number;
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
  runId: string;
  engine: EngineVersion;
  queueMode: QueueMode;
  campaign: string;
  instances: number;
  aggregation: "max" | "sum";
  runState: "IDLE" | "RUNNING" | "DRAINING" | "DONE";
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
  /** 정합성 판정 — LIVE 에서는 null */
  verdict: Verdict;
  /**
   * 운영 대응 우선순위 — verdict 와는 다른 축입니다.
   * 어느 한쪽에서 파생시키지 않습니다. 평가 가능한 gap 이 없으면 null.
   */
  severity: Severity | null;
  /** gap 배열 밖 독립 필드입니다 (G0-04). 배열에 넣으면 렌더 루프가 다섯 칸을 그립니다 */
  overIssued: GapValue;
  issuedPlusUsed: number;
  totalQuantity: number;
  /** 정확히 4종 */
  gaps: { type: GapType; value: GapValue }[];
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

export interface LatencyPanel {
  /** 13 성공 응답시간 — 주 KPI */
  success: {
    p50: SourceValue<number>;
    p95: SourceValue<number>;
    p99: SourceValue<number>;
    targetMs: number;
    percentileMode: "instance-max" | "merged";
    series: Point[];
    /** 그룹별 분해 */
    groups: LatencyGroupStat[];
  };
  /** 14 실패 응답시간 — 정책 거절과 시스템 실패는 축이 다릅니다 */
  failure: {
    p50: SourceValue<number>;
    p95: SourceValue<number>;
    p99: SourceValue<number>;
    systemFailureP99Ms: SourceValue<number>;
    series: Point[];
    /** 그룹별 분해 */
    groups: LatencyGroupStat[];
  };
  /** 15 의존성 지연 — 통계 종류가 달라 한 축에 두지 않고 계열별로 정규화합니다 */
  dependency: {
    redisP99Ms: SourceValue<number>;
    hikariP99Ms: SourceValue<number>;
    kafkaAvgMs: SourceValue<number>;
    series: Point[];
  };
}

export type TrafficKey =
  | "totalRps"
  | "issueAttemptRps"
  | "issueSuccessTps"
  | "queueAcceptedRps"
  | "policyRejectRps"
  | "systemFailureRps";

export interface TrafficPanel {
  /** 16 결과 분류 처리량 — 차감식 금지, 전용 Counter 6종 */
  counters: { key: TrafficKey; label: string; value: SourceValue<number> }[];
  series: Point[];
  markers: { t: number; label: string }[];
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
  series: Point[];
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

export interface AdminMetricsResponse {
  meta: ResponseMeta;
  window: MetricsWindow;
  scope: RunScope;
  kpi: AdminMetricsKpi;
  consistency: ConsistencyPanel;
  latency: LatencyPanel;
  traffic: TrafficPanel;
  errors: ErrorPanel;
  saturation: SaturationPanel;
}

/* ══ D3 분석·비교 (OBS-14b) ════════════════════════ */

export interface BenchmarkCondition {
  version: EngineVersion;
  runId: string;
  stock: number;
  vu: number;
  rampSeconds: number;
  instances: number;
  queueMode: QueueMode;
  repeats: string;
  dataset: string;
}

export interface BenchmarkVerdict {
  version: EngineVersion;
  verdict: "PASS" | "PENDING" | "FAIL";
  overIssued: number;
  note: string;
}

export interface ComparisonRow {
  metric: string;
  values: Record<EngineVersion, { text: string; state?: SourceState }>;
  delta: string;
}

export interface AdminBenchmarksResponse {
  meta: ResponseMeta;
  conditionsMatch: boolean;
  conditions: BenchmarkCondition[];
  verdicts: BenchmarkVerdict[];
  comparison: { group: string; rows: ComparisonRow[] }[];
  /** 22 재고 소진 곡선 — 가로축 로그 */
  stockCurve: Point[];
  /** 23 p99 추이 — 세로축 로그, 가로축 진행률 */
  p99Curve: Point[];
  /** 24 병목 자원 — 버전마다 병목이 다릅니다 */
  bottleneck: { version: EngineVersion; resource: string; peak: number; series: Point[] }[];
  /** ⑤ 대기열 모드 비교 — v3 고정 */
  queueModes: {
    mode: QueueMode;
    exhaustSeconds: number;
    p99Ms: number;
    inFlightMax: number;
    rejected: number;
    note: string;
  }[];
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

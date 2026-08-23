/**
 * 관제 목 어댑터.
 *
 * AB 설계도의 예시 수치와 서사(부하 종료 직후 DRAINING 국면)를 그대로 재현합니다.
 * 백엔드 관제 API 가 붙기 전까지 화면·계약을 검증하는 용도입니다.
 *
 * 값은 BOOT 시각 기준 경과 시간으로 계산합니다 — 타이머가 아니라 시간 함수라
 * 탭을 껐다 켜도 이어지고, 폴링 주기를 바꿔도 같은 곡선이 나옵니다.
 */
import {
  HOUR,
  LIFECYCLE,
  lifecycleOf,
  attemptMixPerMinute,
  listRoundStates,
  listTemplates,
  makeCode,
  memberIssuances,
  mulberry32 as worldRandom,
  remainingOf,
  type RoundState,
} from "@/lib/demo-world";
import { brandOf } from "@/lib/coupon/brands";
import { readQueueSettings, writeQueueSettings } from "@/lib/runtime-config";
import type { AdminApi } from "./contract";
import { WINDOW_NAME } from "./types";
import type {
  ActionSeverity,
  AdminAnalyticsResponse,
  AdminBenchmarksResponse,
  AdminMetricsResponse,
  AdminOverviewQuery,
  AdminOverviewResponse,
  CampaignOpsState,
  CouponMetricsResponse,
  EventSlice,
  GapState,
  GapType,
  GapValue,
  Percentiles,
  HistorySlice,
  IssuanceAttemptEvent,
  IssuanceHistoryRow,
  MemberInquiryResponse,
  MetricsWindow,
  OutcomeItem,
  OutcomeKey,
  Point,
  ResponseMeta,
  SourceKind,
  SourceState,
  SourceValue,
  TrafficKey,
} from "./types";

/** 템플릿의 요일 문자열을 히트맵 행 번호(월=0)로 바꿉니다. */
const DAY_INDEX: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

const BOOT = Date.now();
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * 부하 시뮬레이션 시계.
 *
 * 한 회 측정은 85초(시뮬레이션 기준) 짜리 곡선이고, 끝나면 다음 회가 다시 시작합니다 —
 * 부하 테스트를 반복해서 돌리는 상황과 같습니다.
 * 실제 시계보다 느리게 흘려서 각 국면(램프업 · 정상 · 소진 후 · 영속화 수렴 · 유휴)을
 * 화면에서 충분히 볼 수 있게 했습니다. 화면을 언제 열든 어느 국면엔가 걸립니다.
 */
const SIM_RATE = 0.5; // 실제 1초 = 시뮬레이션 0.5초
const CYCLE_SECONDS = 85;
const START_PHASE = 40; // 화면을 연 순간은 정상 구간 한가운데

/** 실제 시각 → 이번 회차 안에서의 경과 초 */
function phaseAt(realMs: number) {
  const sim = START_PHASE + ((realMs - BOOT) / SECOND) * SIM_RATE;
  return ((sim % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
}

function elapsed(now: number) {
  return phaseAt(now);
}

/** 이번 회차에서 어떤 국면이 마지막으로 지나간 실제 시각 */
function realTimeOfPhase(now: number, targetPhase: number) {
  const back = (phaseAt(now) - targetPhase + CYCLE_SECONDS) % CYCLE_SECONDS;
  return now - (back / SIM_RATE) * SECOND;
}

function sv<T>(value: T, state: SourceState, observedAt: number, note?: string): SourceValue<T> {
  return {
    value,
    state,
    observedAt: new Date(observedAt).toISOString(),
    ...(note ? { note } : {}),
  };
}

/**
 * 값이 없는 상태 — PENDING · NO_TRAFFIC · N_A · WARMING_UP · UNAVAILABLE 은
 * 0 이 아니라 빈 값입니다. UNAVAILABLE 은 원천 접근 자체가 안 되는 경우라
 * 마지막 값이 남아 있어도 현재값으로 내려보내지 않습니다.
 */
function absent<T>(state: SourceState, observedAt: number, note?: string): SourceValue<T> {
  return {
    value: null,
    state,
    observedAt: new Date(observedAt).toISOString(),
    ...(note ? { note } : {}),
  };
}

/** 실제 JSON이 값과 관측 시각 키를 생략하는 미집계 상태입니다. */
function pending<T>(): SourceValue<T> {
  return { state: "PENDING" };
}

/** gap 전용 — 허용 상태가 5종으로 좁습니다. */
function gv(value: number, state: GapState, observedAt: number, note?: string): GapValue {
  return {
    value,
    state,
    observedAt: new Date(observedAt).toISOString(),
    ...(note ? { note } : {}),
  };
}

/** 아직 계산되지 않은 gap — 0 으로 채우지 않습니다. */
function gapAbsent(state: GapState, observedAt: number, note?: string): GapValue {
  return {
    value: null,
    state,
    observedAt: new Date(observedAt).toISOString(),
    ...(note ? { note } : {}),
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시간 t 에서 항상 같은 값이 나오는 잡음 — 폴링해도 값이 튀지 않습니다. */
function wobble(t: number, seed: number, amplitude: number) {
  const r = mulberry32(Math.floor(t) * 7919 + seed);
  return (r() - 0.5) * 2 * amplitude;
}

const WINDOW_SECONDS: Record<MetricsWindow, number> = { "1m": 60, "5m": 300, "15m": 900 };

/** 창 길이에 따라 표본 간격을 정합니다. 점을 60개 안쪽으로 유지합니다. */
function windowSeries(
  now: number,
  window: MetricsWindow,
  build: (t: number) => Record<string, number>,
): Point[] {
  const span = WINDOW_SECONDS[window];
  const points = 48;
  const step = span / points;
  const endT = elapsed(now);
  const out: Point[] = [];
  for (let i = points; i >= 0; i -= 1) {
    const t = endT - i * step;
    out.push({ t: now - i * step * SECOND, ...build(t) });
  }
  return out;
}

function meta(
  now: number,
  window: MetricsWindow,
  sources: Partial<Record<SourceKind, SourceState>>,
): ResponseMeta {
  return {
    schemaVersion: 1,
    snapshotAt: new Date(now).toISOString(),
    windowStart: new Date(now - WINDOW_SECONDS[window] * SECOND).toISOString(),
    windowEnd: new Date(now).toISOString(),
    collectionDurationMs: 38 + Math.round(wobble(elapsed(now), 11, 9)),
    sources,
  };
}

/**
 * 목 지연. signal 을 주면 실서버 어댑터와 같은 자리에서 끊깁니다(S-3) —
 * 목으로 개발할 때도 취소 경로가 실제로 도는지 볼 수 있어야 합니다.
 */
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/* ══ 부하 곡선 ═════════════════════════════════════
   t<10 램프업 · 10~48 정상 · 48 재고 소진 · 64 부하 종료 · 이후 수렴 */

const STOCK_EXHAUST_T = 48;
const LOAD_END_T = 64;

function issueAttemptRps(t: number) {
  if (t < 10) return Math.round(1240 * t + wobble(t, 1, 400));
  if (t < LOAD_END_T) return Math.round(12410 + wobble(t, 2, 620));
  return Math.max(0, Math.round(12410 * Math.exp(-(t - LOAD_END_T) / 4)));
}

/** 관제 화면이 보고 있는 소크 런의 재고. 램프 10초 + 평탄 38초에 정확히 소진됩니다. */
const RUN_STOCK = 80_000;

function issueSuccessTps(t: number) {
  if (t < 10) return Math.round(184 * t + wobble(t, 3, 60));
  if (t < STOCK_EXHAUST_T) return Math.round(1863 + wobble(t, 4, 90));
  return 0; // 소진 시점에 절벽
}

/** 부하 시작부터 t 초까지 나간 발급 수 — 위 발급 속도를 시간으로 더한 값입니다. */
function issuedByTime(t: number) {
  const capped = Math.min(Math.max(0, t), STOCK_EXHAUST_T);
  if (capped < 10) return Math.round(92 * capped * capped);
  return Math.min(RUN_STOCK, Math.round(9200 + 1863 * (capped - 10)));
}

/**
 * 정책 거절은 남는 몫입니다.
 * 발급 시도 = 발급 성공 + 대기 등록 + 정책 거절 + 시스템 실패 — 이 등식이 깨지면
 * 화면의 분모(발급 시도)와 분자들이 서로 다른 이야기를 하게 됩니다.
 */
function policyRejectRps(t: number) {
  return Math.max(
    0,
    issueAttemptRps(t) - issueSuccessTps(t) - queueAcceptedRps(t) - systemFailureRps(t),
  );
}

function queueAcceptedRps(t: number) {
  if (t < 10) return Math.round(214 * t);
  if (t < LOAD_END_T) return Math.round(2140 + wobble(t, 7, 110)); // 평탄
  return Math.max(0, Math.round(2140 * Math.exp(-(t - LOAD_END_T) / 5)));
}

function systemFailureRps(t: number) {
  if (t < 10) return 0;
  if (t < LOAD_END_T) return Math.max(0, Math.round(11 + wobble(t, 8, 6)));
  return 0;
}

function totalRps(t: number) {
  return issueAttemptRps(t) + queueAcceptedRps(t) * 2 + Math.round(3200 + wobble(t, 9, 300));
}

function successP99(t: number) {
  if (t < 6) return Math.round(180 + 40 * t);
  if (t < STOCK_EXHAUST_T) return Math.round(612 + wobble(t, 12, 55));
  if (t < LOAD_END_T) return Math.round(480 + wobble(t, 13, 40));
  return Math.round(210 + wobble(t, 14, 20));
}

/** Kafka 컨슈머가 초당 밀어 넣을 수 있는 저장 건수. 발급 속도가 이 값을 넘으면 밀립니다. */
const CONSUME_RPS = 1041;

/** 램프 구간에서 발급 속도가 소비 능력을 넘는 시점 */
const LAG_START_T = CONSUME_RPS / 184;

/** 저장 대기 = 지금까지 (발급 속도 − 소비 능력) 을 시간으로 더한 값. */
function persistLag(t: number) {
  const jitter = wobble(t, 15, 120);
  if (t <= LAG_START_T) return 0;
  if (t < 10) {
    return Math.max(
      0,
      Math.round(92 * (t * t - LAG_START_T ** 2) - CONSUME_RPS * (t - LAG_START_T) + jitter),
    );
  }
  const atTen = 92 * (100 - LAG_START_T ** 2) - CONSUME_RPS * (10 - LAG_START_T);
  if (t < STOCK_EXHAUST_T) return Math.round(atTen + (1863 - CONSUME_RPS) * (t - 10) + jitter);
  const peak = atTen + (1863 - CONSUME_RPS) * (STOCK_EXHAUST_T - 10);
  return Math.max(0, Math.round(peak - CONSUME_RPS * (t - STOCK_EXHAUST_T) + jitter));
}

function inFlightGlobal(t: number) {
  if (t < 10) return Math.round(232 * t);
  if (t < LOAD_END_T) return Math.round(2318 + wobble(t, 16, 180));
  return Math.max(0, Math.round(2318 * Math.exp(-(t - LOAD_END_T) / 3.5)));
}

function admissionQueueDepth(t: number) {
  if (t < 20) return Math.round(160 * t);
  if (t < LOAD_END_T) return Math.round(3204 + wobble(t, 17, 240));
  return Math.max(0, Math.round(3204 - 160 * (t - LOAD_END_T)));
}

/** 대기 인원이 초당 얼마나 늘거나 주는지 — 깊이 곡선의 기울기입니다. */
function admissionGrowth(t: number) {
  if (t < 20) return 160;
  if (t < LOAD_END_T) return Math.round(wobble(t, 18, 40));
  return admissionQueueDepth(t) > 0 ? -160 : 0;
}

/** 지금 추세로 대기가 사라지기까지 걸리는 시간. 줄지 않으면 셀 수 없습니다. */
function admissionEta(t: number) {
  const growth = admissionGrowth(t);
  if (growth >= 0) return 0;
  return Math.ceil(admissionQueueDepth(t) / -growth);
}

/* ══ 운영 현황 ═════════════════════════════════════ */

/* ══ 운영 현황 ═════════════════════════════════════
   숫자는 전부 demo-world 에서 나옵니다. 운영 현황에서 본 잔여 재고와
   고객 화면의 잔여 수량이 같은 값이어야 하기 때문입니다. */

const OPENING_SOON_MINUTES = 30;
/** 고객 안내 기준. 이 시간을 넘기면 대기 초과로 봅니다. */
const WAIT_GUIDANCE_SECONDS = 600;

/** 발급 알림 중 아직 나가지 못하고 큐에 남아 있는 비율 */
const NOTIFY_PENDING = 0.008;

/** 분당 건수는 정수로 반올림하면 계단처럼 보입니다. 소수 한 자리로 둡니다. */
const round1 = (n: number) => Math.round(n * 10) / 10;

function ratioOf(r: RoundState["round"]) {
  return r.totalQuantity > 0 ? remainingOf(r) / r.totalQuantity : 0;
}

function minutesUntilOpen(r: RoundState["round"], now: number) {
  return (Date.parse(r.openAt) - now) / MINUTE;
}

/** 남은 수량과 발급 속도로 소진까지 남은 분을 셉니다. 속도가 0 이면 셀 수 없습니다. */
function exhaustMinutes(s: RoundState) {
  if (s.ratePerMinute <= 0) return null;
  return Math.max(1, Math.round(remainingOf(s.round) / s.ratePerMinute));
}

function severityOf(s: RoundState, now: number): ActionSeverity | null {
  const r = s.round;
  if (r.status === "OPEN") {
    const ratio = ratioOf(r);
    if (s.queueEtaSeconds !== null && s.queueEtaSeconds > WAIT_GUIDANCE_SECONDS) return "URGENT";
    if (ratio <= 0.05) return "URGENT";
    if (ratio <= 0.2) return "WARNING";
    return null;
  }
  if (r.status === "SCHEDULED") {
    const mins = minutesUntilOpen(r, now);
    return mins >= 0 && mins <= OPENING_SOON_MINUTES ? "READY" : null;
  }
  return null;
}

function opsStateOf(r: RoundState["round"]): CampaignOpsState {
  if (r.status === "SCHEDULED") return "PREPARING";
  if (r.status === "OPEN") return "ISSUING";
  return remainingOf(r) <= 0 ? "SOLD_OUT" : "CLOSED";
}

function clockOf(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 오늘이 아닌 회차는 시각만 적으면 언제인지 알 수 없습니다. 날짜를 앞에 붙입니다. */
function scheduleOf(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? clockOf(iso) : `${d.getMonth() + 1}/${d.getDate()} ${clockOf(iso)}`;
}

/** 오픈까지 남은 시간 — 분·시간·일 중 읽기 쉬운 단위로 적습니다. */
function untilOpenText(mins: number) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}분 후`;
  if (m < 60 * 24) {
    const hours = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${hours}시간 ${rest}분 후` : `${hours}시간 후`;
  }
  return `${Math.round(m / (60 * 24))}일 후`;
}

function buildOverview(now: number, query: AdminOverviewQuery): AdminOverviewResponse {
  const all = listRoundStates(now).filter(
    (s) => !query.brandId || s.round.brandId === query.brandId,
  );

  const open = all.filter((s) => s.round.status === "OPEN");
  const scheduled = all
    .filter((s) => s.round.status === "SCHEDULED")
    .sort((a, b) => Date.parse(a.round.openAt) - Date.parse(b.round.openAt));

  const withSeverity = all
    .map((s) => ({ state: s, severity: severityOf(s, now) }))
    .filter((x): x is { state: RoundState; severity: ActionSeverity } => x.severity !== null);

  const rank: Record<ActionSeverity, number> = { URGENT: 0, WARNING: 1, READY: 2 };
  const actionsSorted = withSeverity.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] || ratioOf(a.state.round) - ratioOf(b.state.round),
  );

  const openingSoon = scheduled.filter(
    (s) => minutesUntilOpen(s.round, now) <= OPENING_SOON_MINUTES,
  );
  const waitOver = open.filter(
    (s) => s.queueEtaSeconds !== null && s.queueEtaSeconds > WAIT_GUIDANCE_SECONDS,
  );
  const atRisk = open.filter((s) => ratioOf(s.round) <= 0.2);
  const urgent = actionsSorted.filter((a) => a.severity === "URGENT").length;
  const warning = actionsSorted.filter((a) => a.severity === "WARNING").length;

  // 최근 10분 동안 고객이 받은 응답. 회차별 시도 구성을 그대로 합칩니다.
  const mix = all.reduce(
    (acc, s) => {
      const m = attemptMixPerMinute(s, now);
      acc.issued += m.issued * 10;
      acc.queueAccepted += m.queueAccepted * 10;
      acc.alreadyIssued += m.alreadyIssued * 10;
      acc.soldOut += m.soldOut * 10;
      acc.notEligible += m.notEligible * 10;
      acc.entryExpired += m.entryExpired * 10;
      acc.systemFailure += m.systemFailure * 10;
      return acc;
    },
    {
      issued: 0,
      queueAccepted: 0,
      alreadyIssued: 0,
      soldOut: 0,
      notEligible: 0,
      entryExpired: 0,
      systemFailure: 0,
    },
  );
  const attemptTotal = Math.max(
    1,
    mix.issued +
      mix.queueAccepted +
      mix.alreadyIssued +
      mix.soldOut +
      mix.notEligible +
      mix.entryExpired +
      mix.systemFailure,
  );

  const outcomes: OutcomeItem[] = (
    [
      ["ISSUED", "발급 완료", mix.issued, false],
      ["QUEUE_ACCEPTED", "대기 등록", mix.queueAccepted, false],
      ["ALREADY_ISSUED", "이미 발급", mix.alreadyIssued, false],
      ["SOLD_OUT", "재고 소진", mix.soldOut, false],
      ["NOT_ELIGIBLE", "대상 아님", mix.notEligible, false],
      ["ENTRY_EXPIRED", "입장 시간 만료", mix.entryExpired, false],
      ["SYSTEM_FAILURE", "시스템 문제", mix.systemFailure, true],
    ] as [OutcomeKey, string, number, boolean][]
  ).map(([key, label, count, isFailure]) => ({
    key,
    label,
    count: Math.round(count),
    ratio: count / attemptTotal,
    isFailure,
  }));

  // 최근 30분 발급량에 수명 비율을 적용해 상태 변경 건수를 만듭니다.
  const issued30 = Math.round(all.reduce((acc, s) => acc + s.ratePerMinute, 0) * 30);
  const expiredBatch = Math.round(issued30 * LIFECYCLE.expired);

  const meta30 = meta(now, "15m", {
    REDIS: "VALID",
    MYSQL: "VALID",
    MICROMETER: "VALID",
    IN_MEMORY: "VALID",
    KAFKA: "VALID",
  });

  const nextActionFor = (s: RoundState, severity: ActionSeverity | null) => {
    if (severity === "READY") return "준비 확인";
    if (s.round.status === "OPEN" && ratioOf(s.round) <= 0.2) return "추가 수량 검토";
    if (s.round.status === "OPEN") return "조치 불필요";
    return "종료 안내 확인";
  };

  const filter = query.filter ?? "ALL";
  const passesFilter = (s: RoundState, severity: ActionSeverity | null) => {
    if (filter === "ACTION") return severity === "URGENT" || severity === "WARNING";
    if (filter === "OPENING") return s.round.status === "SCHEDULED";
    if (filter === "RUNNING") return s.round.status === "OPEN";
    return true;
  };

  const boardOrder = [...open.sort((a, b) => ratioOf(a.round) - ratioOf(b.round)), ...scheduled];

  return {
    meta: meta30,
    dataStatus: "VALID",
    counts: {
      actionRequired: urgent + warning,
      actionRequiredDetail: `긴급 ${urgent}건 · 주의 ${warning}건`,
      openingSoon: openingSoon.length,
      openingSoonDetail: openingSoon[0]
        ? `가장 이른 회차 ${untilOpenText(minutesUntilOpen(openingSoon[0]!.round, now))}`
        : "예정 없음",
      waitOverThreshold: waitOver.length,
      waitOverThresholdDetail: waitOver.length
        ? `최장 대기 ${Math.round((waitOver[0]!.queueEtaSeconds ?? 0) / 60)}분`
        : "기준 이내",
      stockAtRisk: atRisk.length,
      stockAtRiskDetail: atRisk.length
        ? `가장 이른 소진 ${exhaustMinutes(atRisk[0]!) ?? "?"}분 후`
        : "여유 있음",
    },

    actions: actionsSorted.slice(0, 4).map(({ state: s, severity }) => {
      const r = s.round;
      const eta = exhaustMinutes(s);
      const mins = Math.max(0, Math.round(minutesUntilOpen(r, now)));
      return {
        couponRoundId: r.id,
        severity,
        campaign: r.name,
        brandId: r.brandId,
        phase:
          r.status === "OPEN"
            ? `진행 중 · ${clockOf(r.openAt)} 오픈`
            : `${untilOpenText(mins)} 오픈`,
        impact:
          severity === "READY"
            ? "오픈 준비 상태가 아직 확인되지 않았습니다. 오픈 시각에 고객이 발급받지 못할 수 있습니다."
            : eta !== null
              ? `지금 속도라면 ${eta}분 뒤에 수량이 떨어집니다. 그 뒤로는 신규 고객이 발급받을 수 없습니다.`
              : "발급이 멈춰서 남은 수량이 줄지 않습니다.",
        duration:
          severity === "READY"
            ? `오픈까지 ${untilOpenText(mins).replace(" 후", "")}`
            : `잔여 ${remainingOf(r).toLocaleString("ko-KR")}장 · ${s.ratePerMinute.toLocaleString("ko-KR")}장/분`,
        link: severity === "URGENT" && s.queueEtaSeconds !== null ? "system" : "detail",
        linkLabel: severity === "READY" ? "준비 확인" : "상세 보기",
      };
    }),

    campaigns: boardOrder
      .filter((s) => passesFilter(s, severityOf(s, now)))
      .slice(0, 6)
      .map((s, index) => {
        const r = s.round;
        const eta = exhaustMinutes(s);
        return {
          priority: index + 1,
          couponRoundId: r.id,
          campaign: r.name,
          brandId: r.brandId,
          phase:
            r.status === "OPEN" ? "진행 중" : `${untilOpenText(minutesUntilOpen(r, now))} 오픈`,
          openAt: scheduleOf(r.openAt, now),
          closeAt: scheduleOf(r.closeAt, now),
          remaining: remainingOf(r),
          total: r.totalQuantity,
          opsState: opsStateOf(r),
          waiting: r.queueActive
            ? sv(s.waiting, "VALID", now)
            : r.status === "OPEN"
              ? sv(0, "NO_TRAFFIC", now)
              : absent<number>("N_A", now),
          etaText: eta !== null ? `${eta}분 후 소진 예상` : null,
          customerImpact:
            ratioOf(r) <= 0.2 && r.status === "OPEN"
              ? "소진 후 신규 발급 불가"
              : r.status === "SCHEDULED"
                ? "오픈 시 발급 실패 가능"
                : "정상",
          nextAction: nextActionFor(s, severityOf(s, now)),
        };
      }),

    flow: open.slice(0, 4).map((s) => ({
      couponRoundId: s.round.id,
      campaign: s.round.name,
      perMinute: sv(s.ratePerMinute, "VALID", now),
      verdict:
        ratioOf(s.round) <= 0.2
          ? "발급 지속 · 수량 소진 임박"
          : s.round.queueActive
            ? "대기열 운영 중"
            : "정상 발급",
      series: windowSeries(now, "5m", (x) => ({
        v: Math.max(
          0,
          Math.round(s.ratePerMinute + wobble(x, s.round.id * 13, s.ratePerMinute * 0.12)),
        ),
      })),
    })),

    queues: open.slice(0, 4).map((s) => ({
      couponRoundId: s.round.id,
      campaign: s.round.name,
      waiting: s.round.queueActive ? sv(s.waiting, "VALID", now) : sv(0, "NO_TRAFFIC", now),
      trendPerMinute: s.round.queueActive ? s.demandPerMinute - s.admittedPerMinute : 0,
      admittedPerMinute: s.round.queueActive
        ? sv(s.admittedPerMinute, "VALID", now)
        : sv(0, "NO_TRAFFIC", now),
      etaSeconds: s.round.queueActive ? s.queueEtaSeconds : 0,
      verdict: !s.round.queueActive
        ? "대기 없음"
        : (s.queueEtaSeconds ?? 0) > WAIT_GUIDANCE_SECONDS
          ? "대기 기준 초과"
          : "정상",
      healthy: !s.round.queueActive || (s.queueEtaSeconds ?? 0) <= WAIT_GUIDANCE_SECONDS,
    })),

    outcomes,

    stock: [...open, ...scheduled.slice(0, 2)].slice(0, 5).map((s) => ({
      couponRoundId: s.round.id,
      campaign: s.round.name,
      remaining: remainingOf(s.round),
      total: s.round.totalQuantity,
      ratePerMinute:
        s.round.status === "OPEN" ? sv(s.ratePerMinute, "VALID", now) : absent<number>("N_A", now),
      exhaustEtaMinutes: exhaustMinutes(s),
      nextAction:
        ratioOf(s.round) <= 0.2 && s.round.status === "OPEN"
          ? "추가 수량 정책 확인"
          : s.round.status === "SCHEDULED"
            ? "오픈 전 준비 확인"
            : "조치 불필요",
    })),

    statusSummary: {
      used: Math.round(issued30 * LIFECYCLE.used),
      cancelUse: Math.round(issued30 * LIFECYCLE.used * 0.07),
      cancelIssue: Math.round(issued30 * LIFECYCLE.cancelled * 0.3),
      expired: expiredBatch,
      stockRestored: expiredBatch,
      failed: 0,
      batches: [
        {
          at: clockOf(new Date(now - 12 * MINUTE).toISOString()),
          title: "만료 배치 완료",
          detail: `만료 ${expiredBatch.toLocaleString("ko-KR")}건 · 재고 복원 ${expiredBatch.toLocaleString("ko-KR")}건 · 실패 0건`,
        },
      ],
    },

    notifications: (() => {
      // 발급 한 건마다 알림이 한 통 나갑니다. 아직 안 나간 것이 대기입니다.
      const pending = Math.round(issued30 * NOTIFY_PENDING);
      return { sent: issued30 - pending, pending, failed: 0 };
    })(),
  };
}

/* ══ D1 캠페인 상세 ════════════════════════════════ */

function buildCouponMetrics(
  now: number,
  couponRoundId: number,
  window: MetricsWindow,
): CouponMetricsResponse {
  const state = listRoundStates(now).find((s) => s.round.id === couponRoundId);
  if (!state) {
    throw new Error(`알 수 없는 쿠폰 회차: ${couponRoundId}`);
  }
  const r = state.round;
  const issued = r.activeCount;
  const open = r.status === "OPEN";

  // 발급된 쿠폰이 지금 어떤 상태인지는 한 곳(lifecycleOf)에서만 정합니다.
  const { used, expired, cancelled, held } = lifecycleOf(r, now);
  // 지금 이 순간의 전이 속도 — 위 누적값이 시간에 따라 늘어나는 기울기입니다.
  const openHours = Math.max(0, (now - Date.parse(r.openAt)) / HOUR);
  const usePerMinute = (issued * LIFECYCLE.used * Math.exp(-openHours / 36)) / (36 * 60);
  const cancelPerMinute = (issued * LIFECYCLE.cancelled * Math.exp(-openHours / 6)) / (6 * 60);

  // 알림 적체 비율은 운영 현황과 같은 값을 씁니다.
  const pending = Math.round(issued * NOTIFY_PENDING);
  const notified = issued - pending;

  return {
    meta: meta(now, window, {
      REDIS: "VALID",
      MICROMETER: "VALID",
      MYSQL: "VALID",
      IN_MEMORY: "VALID",
      KAFKA: "VALID",
    }),
    couponRoundId,
    campaign: r.name,
    brandId: r.brandId,
    remainingStock: sv({ remaining: remainingOf(r), total: r.totalQuantity }, "VALID", now),
    progress: sv({ issued, total: r.totalQuantity, ratio: issued / r.totalQuantity }, "VALID", now),
    issueRate: open
      ? sv(
          { current: state.ratePerMinute, peak: Math.round(state.demandPerMinute * 1.4) },
          "VALID",
          now,
        )
      : absent<{ current: number; peak: number }>("NO_TRAFFIC", now),
    queue: r.queueActive
      ? sv({ waiting: state.waiting, etaSeconds: state.queueEtaSeconds }, "VALID", now)
      : sv({ waiting: 0, etaSeconds: 0 }, "NO_TRAFFIC", now),
    roundStatus: sv({ status: r.status, openAt: clockOf(r.openAt) }, "VALID", now),
    usageRate: issued > 0 ? sv(used / issued, "VALID", now) : absent<number>("NO_TRAFFIC", now),
    statusBreakdown: sv(
      {
        ISSUED: held,
        USED: used,
        CANCELLED: cancelled,
        EXPIRED: expired,
      },
      "VALID",
      now,
    ),
    notification: sv(
      {
        sentRate: issued > 0 ? notified / issued : 0,
        sent: notified,
        total: issued,
        pending,
        failed: 0,
        dlq: 0,
      },
      "VALID",
      now,
    ),
    transitionRate: sv(
      windowSeries(now, window, (x) => ({
        USE: round1(Math.max(0, usePerMinute + wobble(x, 31, usePerMinute * 0.15))),
        CANCEL_USE: round1(Math.max(0, usePerMinute * 0.07 + wobble(x, 32, usePerMinute * 0.02))),
        CANCEL: round1(Math.max(0, cancelPerMinute + wobble(x, 33, cancelPerMinute * 0.2))),
        // 만료는 배치가 한꺼번에 처리해서 주기적으로 솟습니다.
        EXPIRE: expired > 0 && Math.floor(x) % 60 < 3 ? Math.round(expired * 0.4) : 0,
      })),
      "VALID",
      now,
    ),
  };
}

/* ══ 스트림 ════════════════════════════════════════ */

const GRADE_POOL = ["WELCOME", "SILVER", "GOLD", "VIP"];

/** 응답 하나를 뽑습니다. 결과 비율은 집계와 같은 모형(attemptMixPerMinute)에서 옵니다. */
function pickAttempt(s: RoundState, now: number, rand: () => number) {
  const mix = attemptMixPerMinute(s, now);
  const buckets: { weight: number; status: number; reason: string | null }[] = [
    { weight: mix.issued, status: 201, reason: null },
    { weight: mix.queueAccepted, status: 202, reason: "QUEUE_ACCEPTED" },
    { weight: mix.alreadyIssued, status: 409, reason: "ALREADY_ISSUED" },
    { weight: mix.soldOut, status: 409, reason: "SOLD_OUT" },
    { weight: mix.notEligible, status: 403, reason: "GRADE_NOT_ELIGIBLE" },
    { weight: mix.entryExpired, status: 410, reason: "ENTRY_TOKEN_EXPIRED" },
  ];
  const total = buckets.reduce((acc, b) => acc + b.weight, 0);
  if (total <= 0) return { status: 409, reason: "SOLD_OUT" as string | null };
  let roll = rand() * total;
  for (const b of buckets) {
    roll -= b.weight;
    if (roll <= 0) return { status: b.status, reason: b.reason };
  }
  return { status: 201, reason: null as string | null };
}

function buildEvents(now: number, couponRoundId: number | null, limit: number): EventSlice {
  const states = listRoundStates(now).filter((s) =>
    couponRoundId ? s.round.id === couponRoundId : s.round.status === "OPEN",
  );
  const events: IssuanceAttemptEvent[] = [];
  const base = Math.floor(now / 40) * 40;

  for (let i = 0; i < limit && states.length > 0; i += 1) {
    const at = base - i * 40;
    const rand = mulberry32(at + i * 31 + 5);
    const state = states[Math.floor(rand() * states.length)]!;
    const result = pickAttempt(state, now, rand);
    events.push({
      eventId: `ev_${at}_${i}`,
      occurredAt: new Date(at).toISOString(),
      memberId: 100000 + Math.floor(rand() * 899999),
      couponRoundId: state.round.id,
      campaign: state.round.name,
      code: result.status === 201 ? makeCode(rand).slice(0, 12) : null,
      httpStatus: result.status,
      reasonCode: result.reason,
      grade:
        state.round.eligibleGrades[Math.floor(rand() * state.round.eligibleGrades.length)] ??
        GRADE_POOL[0]!,
      queuePosition: result.status === 202 ? Math.max(1, Math.round(state.waiting * rand())) : null,
    });
  }

  const perMinute = states.reduce((acc, s) => acc + attemptMixPerMinute(s, now).issued, 0);
  return {
    meta: meta(now, "1m", { IN_MEMORY: "VALID", KAFKA: "VALID" }),
    events,
    nextCursor: `cur_${base}`,
    // 초당 수천 건이라 층화 샘플링을 거칩니다. 생략분을 숨기지 않고 그대로 알립니다.
    droppedCount: Math.max(0, Math.round(perMinute / 60) * 10 - limit),
    sampled: true,
  };
}

/** 어떤 전이가 얼마나 자주 찍히는지는 회차의 보유 상태 구성에서 따옵니다. */
function transitionsOf(state: RoundState, now: number) {
  const { used, cancelled, expired } = lifecycleOf(state.round, now);
  return [
    { from: "ISSUED", to: "USED", note: "주문 사용", weight: used },
    { from: "USED", to: "ISSUED", note: "주문 취소", weight: used * 0.07 },
    { from: "ISSUED", to: "CANCELLED", note: "사용자 취소", weight: cancelled },
    { from: "ISSUED", to: "EXPIRED", note: "만료 배치", weight: expired },
  ];
}

function buildHistories(now: number, couponRoundId: number | null, limit: number): HistorySlice {
  const states = listRoundStates(now).filter((s) =>
    couponRoundId ? s.round.id === couponRoundId : s.round.activeCount > 0,
  );
  const rows: IssuanceHistoryRow[] = [];
  const base = Math.floor(now / 1400) * 1400;

  for (let i = 0; i < limit && states.length > 0; i += 1) {
    const at = base - i * 1400;
    const rand = mulberry32(at + 17);
    const state = states[Math.floor(rand() * states.length)]!;
    const options = transitionsOf(state, now);
    const total = options.reduce((acc, o) => acc + o.weight, 0);
    if (total <= 0) continue;
    let roll = rand() * total;
    const tr = options.find((o) => (roll -= o.weight) <= 0) ?? options[0]!;
    rows.push({
      id: 900000 - i,
      occurredAt: new Date(at).toISOString(),
      code: makeCode(rand).slice(0, 12),
      from: tr.from,
      to: tr.to,
      note: `${state.round.name} · ${tr.note}`,
    });
  }

  return {
    meta: meta(now, "1m", { MYSQL: "VALID" }),
    histories: rows,
    nextCursor: `id_${900000 - limit}`,
    droppedCount: 0,
  };
}

/** 측정 대상 회차. 지금 트래픽이 가장 많은 회차를 대상으로 잡습니다. */
function measuredCampaign(now: number) {
  const target = listRoundStates(now)
    .filter((s) => s.round.status === "OPEN")
    .sort((a, b) => b.demandPerMinute - a.demandPerMinute)[0];
  return target ? `${target.round.name} #${target.round.id}` : "대상 없음";
}

function buildMetrics(now: number, window: MetricsWindow): AdminMetricsResponse {
  const t = elapsed(now);
  const lag = persistLag(t);
  // 부하가 끝난 뒤 영속화가 남아 있는 구간만 DRAINING 입니다.
  // 부하 중에도 lag 은 쌓이지만 그건 RUNNING 입니다.
  const loadRunning = t < LOAD_END_T;
  const draining = lag > 0;
  const runState = loadRunning ? "RUNNING" : draining ? "DRAINING" : "DONE";
  // 유휴 구간 끝자락에 원천 접근 실패를 한 번 재현합니다.
  // UNAVAILABLE 이 실제로 관측돼야 후속 티켓이 렌더를 검증할 수 있습니다.
  const idle = !loadRunning && !draining && t >= 78;
  const p99 = successP99(t);
  const attempts = issueAttemptRps(t);
  const failures = systemFailureRps(t);
  const arrivalRps = issueSuccessTps(t);
  // 밀린 게 있으면 컨슈머는 능력껏 돌고, 없으면 들어온 만큼만 씁니다.
  const consumeRps = lag > 0 ? CONSUME_RPS : Math.min(CONSUME_RPS, arrivalRps);

  // persist lag 이 0에 닿기 전에는 최종 gap 두 개를 판정할 수 없습니다.
  const gapValue = (type: GapType): GapValue => {
    // DB 카운터는 Redis 를 거쳐 읽습니다 — 유휴 구간에서 원천이 끊긴 상황을 재현합니다.
    if (type === "DB_COUNTER_GAP" && idle) {
      return gapAbsent("UNAVAILABLE", now, "Redis 조회 실패");
    }
    if (type === "LUA_GAP" || type === "ACTIVE_DB_GAP") return gv(0, "VALID", now);
    return draining ? gapAbsent("PENDING", now) : gv(0, "VALID", now);
  };

  // 트래픽이 0 인 것은 장애가 아닙니다 — NO_TRAFFIC 은 값 0 을 그대로 싣습니다(carriesValue).
  const trafficCounter = (value: number) =>
    value === 0 && t > LOAD_END_T ? sv(0, "NO_TRAFFIC", now) : sv(value, "VALID", now);

  return {
    meta: meta(now, window, {
      MICROMETER: "VALID",
      REDIS: "VALID",
      MYSQL: "VALID",
      KAFKA: draining ? "PENDING" : "VALID",
      IN_MEMORY: "VALID",
    }),
    window: WINDOW_NAME[window],
    snapshotAt: new Date(now).toISOString(),
    scope: {
      type: "GLOBAL",
      runId: "bm_20260820_soak_v3",
      engine: "v3",
      queueMode: readQueueSettings().mode,
      campaign: measuredCampaign(now),
      instances: 4,
      aggregation: "max",
      runState,
    },
    consistency: {
      phase: draining ? "LIVE" : "FINAL",
      // LIVE 국면에서는 PASS 를 낼 수 없습니다. 판정은 lag=0 이후에만.
      verdict: draining ? null : "PASS",
      // LIVE 국면에서는 평가 가능한 gap 이 없습니다 — null 이고 NONE 으로 치환하지 않습니다.
      severity: draining ? null : "NONE",
      overIssued: draining ? gapAbsent("PENDING", now) : gv(0, "VALID", now),
      issuedPlusUsed: issuedByTime(t),
      totalQuantity: RUN_STOCK,
      // 서버는 gap 을 평탄한 필드로 내려줍니다 (admin-api-spec §6.1)
      luaGap: gapValue("LUA_GAP"),
      activeDbGap: gapValue("ACTIVE_DB_GAP"),
      dbCounterGap: gapValue("DB_COUNTER_GAP"),
      persistGap: gapValue("PERSIST_GAP"),
    },
    latency: {
      // 백분위 3종은 한 원천에서 같이 나옵니다 — 상태도 하나입니다.
      success: sv(
        {
          p50Millis: Math.round(p99 * 0.137),
          p95Millis: Math.round(p99 * 0.394),
          p99Millis: p99,
        },
        "VALID",
        now,
      ),
      // 실패 경로는 OBS-4 Timer 가 outcome 을 둘로만 등록해 아직 분리되지 않습니다.
      policyReject: pending<Percentiles>(),
      systemFailure: pending<Percentiles>(),
    },
    dependencies: {
      redis: pending(),
      hikari: pending(),
      kafka: pending(),
    },
    persistence: sv(
      {
        lagTotal: lag,
        partitionMax: Math.round(lag / 12),
        arrivalRate: issueSuccessTps(t),
        consumeRate: CONSUME_RPS,
        netDrainRate: issueSuccessTps(t) - CONSUME_RPS,
        drainEtaMillis: draining ? Math.ceil(lag / CONSUME_RPS) * 1000 : null,
      },
      "VALID",
      now,
    ),
    circuitBreakers: [
      { name: "dbCB", state: "CLOSED" as const },
      { name: "redisCB", state: "CLOSED" as const },
    ],
    traffic: {
      issueAttemptRps: trafficCounter(attempts),
      issueSuccessTps: trafficCounter(issueSuccessTps(t)),
      queueAcceptedRps: trafficCounter(queueAcceptedRps(t)),
      policyRejectRps: trafficCounter(policyRejectRps(t)),
      systemFailureRps: trafficCounter(failures),
      series: windowSeries(now, window, (x) => ({
        issueSuccessTps: issueSuccessTps(x),
        queueAcceptedRps: queueAcceptedRps(x),
        policyRejectRps: policyRejectRps(x),
        systemFailureRps: systemFailureRps(x),
      })),
      markers: [
        { t: realTimeOfPhase(now, STOCK_EXHAUST_T), label: "재고 소진" },
        { t: realTimeOfPhase(now, LOAD_END_T), label: "부하 종료" },
      ],
    },
    errors: {
      denominator: "issueAttemptRps",
      classes: [
        {
          key: "dependencyFailure",
          label: "dependencyFailure",
          definition: "httpStatus >= 500 && dependency != NONE",
          excludedFromNumerator: false,
          // 요청이 0건이면 나눌 것이 없어 비율이 "0" 이 아니라 정의되지 않습니다
          rate:
            attempts === 0
              ? absent<number>("N_A", now, "요청 없음 — 발급 시도 0건이라 비율이 정의되지 않습니다")
              : sv(0, "VALID", now),
        },
        {
          key: "applicationFailure",
          label: "applicationFailure",
          definition: "httpStatus >= 500 && dependency == NONE (뺄셈 아닌 독립 판정)",
          excludedFromNumerator: false,
          rate:
            attempts === 0
              ? absent<number>("N_A", now, "요청 없음 — 발급 시도 0건이라 비율이 정의되지 않습니다")
              : sv(Number(((failures / attempts) * 100).toFixed(3)), "VALID", now),
        },
        {
          key: "clientObservedFailure",
          label: "clientObservedFailure",
          definition: "k6 timeout · connection error · 기대 밖 응답",
          excludedFromNumerator: true,
          // 부하 생성기 업로드가 범위 밖이라 원천이 없습니다. 0 으로 그리면 "클라이언트 실패 없음" 이라는 거짓 신호가 됩니다
          rate: absent<number>("N_A", now, "부하 생성기 지표 업로드 범위 밖"),
        },
        {
          key: "policyReject",
          label: "policyReject",
          definition: "의도된 403 · 409",
          excludedFromNumerator: true,
          rate:
            attempts === 0
              ? absent<number>("N_A", now, "요청 없음 — 발급 시도 0건이라 비율이 정의되지 않습니다")
              : sv(Number(((policyRejectRps(t) / attempts) * 100).toFixed(1)), "VALID", now),
        },
      ],
      series: windowSeries(now, window, (x) => {
        const a = issueAttemptRps(x) || 1;
        return {
          dependencyFailure: 0,
          applicationFailure: Number(((systemFailureRps(x) / a) * 100).toFixed(3)),
          // clientObservedFailure 는 N_A 라 계열을 만들지 않습니다 (없는 값을 선으로 그리지 않음)
        };
      }),
      // 차단기가 모두 CLOSED 라 의존성 실패는 0 입니다. 원인도 애플리케이션 쪽만 남습니다.
      topReasons: (() => {
        // 클라이언트 관측 실패는 원천이 없어(N_A) 원인 목록에도 지어내지 않습니다
        const appWindow = Math.round(failures * 60);
        // 0 건 행을 거르는 건 서버가 아니라 화면 몫입니다 (백엔드 3차 회신 2절)
        const rows = [
          {
            httpStatus: 500,
            reasonCode: "APP_REDIS_COMMAND_TIMEOUT · i-3",
            count: Math.round(appWindow * 0.58),
          },
          {
            httpStatus: 504,
            reasonCode: "APP_UPSTREAM_TIMEOUT",
            count: Math.round(appWindow * 0.27),
          },
          {
            httpStatus: 500,
            reasonCode: "APP_SERIALIZATION_ERROR",
            count: Math.round(appWindow * 0.15),
          },
        ];
        return rows.sort((a, b) => b.count - a.count);
      })(),
    },
    saturation: {
      resources: [
        {
          name: "Hikari",
          detail: `pending ${Math.max(0, Math.round(87 - (t - LOAD_END_T) * 3))}`,
          utilization: sv(
            Math.max(12, Math.round(98 - Math.max(0, t - LOAD_END_T) * 2)),
            "VALID",
            now,
          ),
          // PRD 대기열 진입 조건이 DB풀 > 80% 라 화면과 실제 동작을 맞춥니다
          warnAt: 80,
        },
        {
          name: "Tomcat",
          detail: "worker",
          utilization: sv(
            Math.max(8, Math.round(76 - Math.max(0, t - LOAD_END_T) * 1.6)),
            "VALID",
            now,
          ),
          warnAt: 75,
        },
        {
          name: "CPU",
          detail: "knee 미정",
          utilization: sv(
            Math.max(6, Math.round(58 - Math.max(0, t - LOAD_END_T) * 1.2)),
            "VALID",
            now,
          ),
          warnAt: 75,
        },
        {
          name: "Heap",
          detail: "after-GC",
          utilization: sv(Math.round(44 + wobble(t, 81, 4)), "VALID", now),
          warnAt: 75,
        },
        {
          name: "Redis",
          detail: "command p99 1.2ms",
          utilization: sv(Math.round(18 + wobble(t, 82, 4)), "VALID", now),
          warnAt: 75,
        },
        {
          name: "디스크 · 네트워크",
          detail: "간접 지표로 대체",
          utilization: absent<number>("N_A", now),
          warnAt: 75,
        },
      ],
      inFlight: {
        globalSum: sv(inFlightGlobal(t), "VALID", now),
        instanceMax: sv(Math.round(inFlightGlobal(t) * 0.396), "VALID", now),
        instanceId: "i-3",
        activeInstances: 4,
        mode: "ON",
        admitThreshold: 2000,
        releaseThreshold: 1000,
        series: windowSeries(now, window, (x) => ({ global: inFlightGlobal(x) })),
      },
      queues: [
        {
          zone: "Admission",
          metrics: [
            { label: "대기 인원", value: sv(admissionQueueDepth(t), "VALID", now) },
            { label: "입장 처리", value: sv(queueAcceptedRps(t), "VALID", now) },
            { label: "증가율", value: sv(admissionGrowth(t), "VALID", now) },
            {
              label: "해소 예상",
              value:
                admissionGrowth(t) < 0
                  ? sv(admissionEta(t), "VALID", now, "초")
                  : absent<number>("N_A", now),
            },
          ],
          series: windowSeries(now, window, (x) => ({ depth: admissionQueueDepth(x) })),
        },
        {
          zone: "Persistence",
          metrics: [
            { label: "저장 대기", value: sv(lag, "VALID", now) },
            { label: "들어오는 양", value: sv(arrivalRps, "VALID", now) },
            { label: "저장 처리", value: sv(consumeRps, "VALID", now) },
            { label: "증가율", value: sv(arrivalRps - consumeRps, "VALID", now) },
          ],
          series: windowSeries(now, window, (x) => ({ lag: persistLag(x) })),
        },
        {
          zone: "Telemetry",
          metrics: [{ label: "화면 표시 지연", value: sv(0.4, "VALID", now, "초") }],
          series: windowSeries(now, window, (x) => ({
            lagMs: Math.round(400 + wobble(x, 91, 60)),
          })),
        },
      ],
      thresholds: { warn: 60, high: 75, critical: 85 },
    },
  };
}

/* ══ D3 ════════════════════════════════════════════ */

function buildBenchmarks(now: number): AdminBenchmarksResponse {
  const stockCurve: Point[] = [];
  for (const s of [0.5, 1, 2, 3, 5, 8, 11.2, 15, 18.7, 30, 60, 100, 142.3, 200]) {
    stockCurve.push({
      t: s,
      v1: Math.max(0, Math.round(10000 * (1 - s / 142.3))),
      v2: s <= 18.7 ? Math.max(0, Math.round(10000 * (1 - s / 18.7))) : 0,
      v3: s <= 11.2 ? Math.max(0, Math.round(10000 * (1 - s / 11.2))) : 0,
    });
  }

  const p99Curve: Point[] = [];
  for (let p = 0; p <= 100; p += 5) {
    p99Curve.push({
      t: p,
      v1: Math.round(600 + 3580 * (p / 100) ** 1.6),
      v2: Math.round(140 + 472 * (p / 100) ** 1.4),
      v3: Math.round(90 + 198 * (p / 100) ** 1.3),
    });
  }

  const bottleneckSeries = (peak: number, seed: number): Point[] =>
    Array.from({ length: 21 }, (_, i) => ({
      t: i * 5,
      v: Math.max(0, Math.round(peak * Math.min(1, (i / 12) ** 1.4) + wobble(i, seed, 4))),
    }));

  return {
    meta: meta(now, "15m", { MYSQL: "VALID" }),
    conditionsMatch: true,
    conditions: (["v1", "v2", "v3"] as const).map((version, i) => ({
      version,
      runId: `bm_0814_${version}_0${[3, 7, 7][i]}`,
      stock: 10000,
      vu: 3000,
      rampSeconds: 10,
      instances: 4,
      queueMode: "OFF" as const,
      repeats: "3회 · 중앙값",
      dataset: "seed_v3",
    })),
    verdicts: [
      { version: "v1", verdict: "PASS", overIssued: 0, note: "초과 발급 0 · gap 4종 VALID" },
      { version: "v2", verdict: "PASS", overIssued: 0, note: "초과 발급 0 · gap 4종 VALID" },
      {
        version: "v3",
        verdict: "PENDING",
        overIssued: 0,
        note: "초과 발급은 0이지만 최종 집계가 끝나지 않았습니다",
      },
    ],
    comparison: [
      {
        group: "판정",
        rows: [
          {
            metric: "초과 발급",
            values: { v1: { text: "0" }, v2: { text: "0" }, v3: { text: "0" } },
            delta: "동일",
          },
          {
            metric: "luaGap · activeDbGap",
            values: { v1: { text: "0 · 0" }, v2: { text: "0 · 0" }, v3: { text: "0 · 0" } },
            delta: "동일",
          },
          {
            metric: "persistGap · dbCounterGap",
            values: {
              v1: { text: "—", state: "N_A" },
              v2: { text: "—", state: "N_A" },
              v3: { text: "—", state: "PENDING" },
            },
            delta: "v3만 해당",
          },
          {
            metric: "최종 판정",
            values: {
              v1: { text: "합격" },
              v2: { text: "합격" },
              v3: { text: "판정 대기", state: "PENDING" },
            },
            delta: "",
          },
        ],
      },
      {
        group: "성능",
        rows: [
          {
            metric: "소진 시간",
            values: { v1: { text: "142.3s" }, v2: { text: "18.7s" }, v3: { text: "11.2s" } },
            delta: "12.7배",
          },
          {
            metric: "k6 p99",
            values: { v1: { text: "4,180ms" }, v2: { text: "612ms" }, v3: { text: "288ms" } },
            delta: "14.5배",
          },
          {
            metric: "k6 p50",
            values: { v1: { text: "1,240ms" }, v2: { text: "84ms" }, v3: { text: "41ms" } },
            delta: "30.2배",
          },
          {
            metric: "발급 성공 TPS",
            values: { v1: { text: "70" }, v2: { text: "535" }, v3: { text: "893" } },
            delta: "12.8배",
          },
          {
            metric: "클라이언트 관측 실패",
            values: { v1: { text: "0.31%" }, v2: { text: "0.02%" }, v3: { text: "0.00%" } },
            delta: "서버 미관측",
          },
          {
            metric: "시스템 실패율",
            values: { v1: { text: "0.00%" }, v2: { text: "0.00%" }, v3: { text: "0.00%" } },
            delta: "세 버전 동일",
          },
        ],
      },
      {
        group: "비용",
        rows: [
          {
            metric: "DB 풀 최대",
            values: { v1: { text: "100%" }, v2: { text: "34%" }, v3: { text: "22%" } },
            delta: "",
          },
          {
            metric: "in-flight 최대",
            values: { v1: { text: "2,980" }, v2: { text: "1,120" }, v3: { text: "918" } },
            delta: "",
          },
          {
            metric: "저장 지연 해소",
            values: { v1: { text: "없음" }, v2: { text: "없음" }, v3: { text: "+15s" } },
            delta: "v3 비용",
          },
          {
            metric: "추가 구성요소",
            values: {
              v1: { text: "없음" },
              v2: { text: "Redis" },
              v3: { text: "Redis · Kafka · 컨슈머 · 정합성 배치" },
            },
            delta: "",
          },
          {
            metric: "정합성 판정 시점",
            values: { v1: { text: "즉시" }, v2: { text: "즉시" }, v3: { text: "부하 종료 +15s" } },
            delta: "",
          },
        ],
      },
    ],
    stockCurve,
    p99Curve,
    bottleneck: [
      { version: "v1", resource: "DB 커넥션 풀", peak: 100, series: bottleneckSeries(100, 101) },
      { version: "v2", resource: "Redis 명령 지연", peak: 34, series: bottleneckSeries(34, 102) },
      {
        version: "v3",
        resource: "Kafka consumer lag",
        peak: 22,
        series: bottleneckSeries(22, 103),
      },
    ],
    queueModes: [
      {
        mode: "OFF",
        exhaustSeconds: 11.2,
        p99Ms: 288,
        inFlightMax: 918,
        rejected: 0,
        note: "최고 속도 · 대기 없음",
      },
      {
        mode: "ALWAYS",
        exhaustSeconds: 14.8,
        p99Ms: 121,
        inFlightMax: 640,
        rejected: 0,
        note: "가장 안정 · 소진은 느림",
      },
      {
        mode: "ADAPTIVE",
        exhaustSeconds: 12.1,
        p99Ms: 156,
        inFlightMax: 712,
        rejected: 1204,
        note: "속도 유지 + 진입 제한",
      },
    ],
  };
}

/* ══ 기획 참고 ═════════════════════════════════════ */

const TREND_BRANDS = [
  { brandId: 9, name: "딜리버리고", base: 300, slope: 18 },
  { brandId: 1, name: "모카빈", base: 220, slope: 4 },
  { brandId: 5, name: "북스토리", base: 120, slope: 2 },
  { brandId: 7, name: "스포츠존", base: 160, slope: 9 },
];

function brandNameOf(brandId: number) {
  return brandOf(brandId).name;
}

function buildAnalytics(now: number): AdminAnalyticsResponse {
  const ref = new Date(now);
  const months: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    months.push(`${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // 수량이 큰 브랜드 네 곳의 추이입니다. 실제 템플릿에서 뽑습니다.
  const top = listTemplates()
    .filter((t) => t.active)
    .sort((a, b) => b.stockPerOccurrence - a.stockPerOccurrence)
    .slice(0, 4);

  const series = top.map((t) => {
    const rand = worldRandom(t.id * 101 + 7);
    const seasonalMonth = 2 + Math.floor(rand() * 3); // 브랜드마다 성수기가 다릅니다
    // 회차 수량이 곧 그 달의 발급량입니다. 차트 단위가 천 건이라 1000 으로 나눕니다.
    const base = t.stockPerOccurrence / 1000;
    const slope = (rand() - 0.35) * base * 0.08;
    return {
      brandId: t.brandId,
      name: brandNameOf(t.brandId),
      values: months.map((_, i) => {
        const month = new Date(ref.getFullYear(), ref.getMonth() - (11 - i), 1).getMonth();
        const seasonal = month === seasonalMonth ? base * 0.45 : 0;
        return round1(
          Math.max(1, base + slope * i + seasonal + wobble(i * 13 + t.id, 111, base * 0.08)),
        );
      }),
    };
  });

  // 히트맵은 실제 템플릿 일정에서 만듭니다. 어느 요일·시간에 회차가 몰려 있는지가 보여야
  // "다음 회차의 오픈 시각을 언제로 잡을까"에 쓸 수 있습니다.
  const hours = Array.from({ length: 12 }, (_, i) => i + 10);
  const active = listTemplates().filter((t) => t.active);
  const grid = Array.from({ length: 7 }, (_, day) =>
    hours.map((hour) => {
      const lunch = Math.exp(-((hour - 12.5) ** 2) / 1.6) * 62;
      const evening = Math.exp(-((hour - 19.5) ** 2) / 2.2) * 56;
      const weekday = day < 5 ? 1 : 0.6;
      const boost = active
        .filter(
          (t) =>
            DAY_INDEX[t.dayOfWeek] === day && Math.abs(Number(t.startTime.slice(0, 2)) - hour) <= 1,
        )
        .reduce((acc, t) => acc + t.stockPerOccurrence / 400, 0);
      return Math.max(
        2,
        Math.round((lunch + evening) * weekday + boost + wobble(day * 31 + hour, 121, 5)),
      );
    }),
  );

  let peak = { day: 0, hour: hours[0]!, value: 0 };
  grid.forEach((row, day) =>
    row.forEach((v, i) => {
      if (v > peak.value) peak = { day, hour: hours[i]!, value: v };
    }),
  );

  // 상태 전이 비율은 운영 현황·캠페인 상세와 같은 값을 씁니다.
  // 누적 발급은 한 달치 회차 수량 합계를 서비스 운영 3년치로 늘린 값입니다.
  const monthlyIssued = active.reduce((acc, t) => acc + t.stockPerOccurrence, 0);
  const issuedTotal = monthlyIssued * 36;
  return {
    meta: meta(now, "15m", { MYSQL: "VALID" }),
    asOf: new Date(now).toISOString(),
    brandTrend: { months, series },
    heatmap: { hours, grid, peak },
    funnel: [
      { stage: "ISSUED", label: "발급", count: issuedTotal, ratio: 1 },
      {
        stage: "USED",
        label: "사용",
        count: Math.round(issuedTotal * LIFECYCLE.used),
        ratio: LIFECYCLE.used,
      },
      {
        stage: "EXPIRED",
        label: "만료",
        count: Math.round(issuedTotal * LIFECYCLE.expired),
        ratio: LIFECYCLE.expired,
      },
      {
        stage: "CANCELLED",
        label: "취소",
        count: Math.round(issuedTotal * LIFECYCLE.cancelled),
        ratio: LIFECYCLE.cancelled,
      },
    ],
  };
}

/* ══ 회원 발급 문의 ════════════════════════════════
   그 회원이 실제로 들고 있는 쿠폰을 읽습니다. 상담 화면의 내역과
   고객이 쿠폰함에서 보는 내역이 달라지면 안 됩니다. */

function buildInquiry(now: number, memberId: number): MemberInquiryResponse {
  const owned = memberIssuances(memberId);
  const byRound = new Map(listRoundStates(now).map((s) => [s.round.id, s.round]));
  const rows: MemberInquiryResponse["rows"] = [];

  for (const i of owned) {
    const name = byRound.get(i.couponRoundId)?.name ?? "지난 브랜드 데이";
    rows.push({
      occurredAt: i.issuedAt,
      campaign: name,
      kind: "ATTEMPT",
      result: "발급",
      note: i.code,
      httpStatus: 201,
    });
    // 사용과 사용 취소는 짝으로 남습니다. 취소된 사용도 이력에서 지우지 않습니다.
    for (const u of i.usages) {
      rows.push({
        occurredAt: u.usedAt,
        campaign: name,
        kind: "TRANSITION",
        result: "ISSUED → USED",
        note: `주문 #${u.orderId} · ${u.discountAmount.toLocaleString("ko-KR")}원 할인`,
        httpStatus: null,
      });
      if (u.canceledAt) {
        rows.push({
          occurredAt: u.canceledAt,
          campaign: name,
          kind: "TRANSITION",
          result: "USED → ISSUED",
          note: `주문 #${u.orderId} 사용 취소`,
          httpStatus: null,
        });
      }
    }
    if (i.status === "EXPIRED") {
      rows.push({
        occurredAt: i.expiresAt,
        campaign: name,
        kind: "TRANSITION",
        result: "ISSUED → EXPIRED",
        note: "만료 배치",
        httpStatus: null,
      });
    }
    if (i.status === "CANCELLED") {
      rows.push({
        occurredAt: i.canceledAt ?? i.issuedAt,
        campaign: name,
        kind: "TRANSITION",
        result: "ISSUED → CANCELLED",
        note: "발급 취소",
        httpStatus: null,
      });
    }
  }

  // 실패한 시도는 발급 이력에 남지 않으므로 이미 마감된 회차에서 만들어 붙입니다.
  const rand = worldRandom(memberId);
  const closed = listRoundStates(now).filter(
    (s) => s.round.status === "CLOSED" && Date.parse(s.round.openAt) < now,
  );
  // 이 서비스를 쓴 적 없는 회원은 실패 기록도 없습니다. 없는 이력을 지어내지 않습니다.
  const failedAttempts =
    owned.length === 0 ? 0 : Math.min(6, Math.round(owned.length * 2 + rand() * 5));
  for (let i = 0; i < failedAttempts && closed.length > 0; i += 1) {
    const s = closed[Math.floor(rand() * closed.length)]!;
    // 지난 일만 이력이 됩니다. 오픈 40초 뒤와 지금 중 이른 쪽에 찍습니다.
    const at = Math.min(now - 1000, Date.parse(s.round.openAt) + 40_000 + i * 900);
    rows.push({
      occurredAt: new Date(at).toISOString(),
      campaign: s.round.name,
      kind: "ATTEMPT",
      result: "SOLD_OUT",
      note: "-",
      httpStatus: 409,
    });
  }

  rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    meta: meta(now, "15m", { MYSQL: "VALID", KAFKA: "VALID" }),
    member: { memberId, grade: owned[0]?.issuedGrade ?? "WELCOME" },
    totals: {
      held: owned.filter((i) => i.status === "ISSUED").length,
      used: owned.filter((i) => i.status === "USED").length,
      expired: owned.filter((i) => i.status === "EXPIRED").length,
      cancelled: owned.filter((i) => i.status === "CANCELLED").length,
      attempts: owned.length + failedAttempts,
      failures: failedAttempts,
    },
    rows: rows.slice(0, 12),
  };
}

/* ══ 어댑터 ════════════════════════════════════════ */

export function createMockAdminApi(): AdminApi {
  return {
    async getOverview(query = {}, signal) {
      await wait(90, signal);
      return buildOverview(Date.now(), query);
    },
    async getCouponMetrics(couponRoundId, window, signal) {
      await wait(80, signal);
      return buildCouponMetrics(Date.now(), couponRoundId, window);
    },
    async getEvents(params, signal) {
      await wait(70, signal);
      return buildEvents(Date.now(), params.couponRoundId ?? null, params.limit ?? 24);
    },
    async getHistories(params, signal) {
      await wait(70, signal);
      return buildHistories(Date.now(), params.couponRoundId ?? null, params.limit ?? 20);
    },
    async getMetrics(window, signal) {
      await wait(85, signal);
      return buildMetrics(Date.now(), window);
    },
    async getBenchmarks() {
      await wait(140);
      return buildBenchmarks(Date.now());
    },
    async getAnalytics() {
      await wait(140);
      return buildAnalytics(Date.now());
    },
    async inquireMember(memberId) {
      await wait(160);
      return buildInquiry(Date.now(), memberId);
    },
    async getQueueSettings() {
      await wait(60);
      return readQueueSettings();
    },
    async updateQueueSettings(input) {
      await wait(140);
      return writeQueueSettings(input);
    },
  };
}

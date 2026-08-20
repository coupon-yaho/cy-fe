/**
 * 데모 세계.
 *
 * 목 어댑터가 둘(고객 쿠폰 API · 관리자 관제 API)이지만 백엔드는 하나여야 합니다.
 * 회차·재고·발급 이력을 여기 한 곳에 두고 두 어댑터가 같은 값을 읽습니다.
 * 그래야 운영 현황에서 본 잔여 재고와 고객 화면의 잔여 수량이 어긋나지 않습니다.
 *
 * 실서버가 붙으면 이 파일은 통째로 사라집니다.
 */
import { isQueueActive } from "@/lib/runtime-config";
import {
  DAYS_OF_WEEK,
  GRADES,
  calcDiscount,
  type CouponDayOfWeek,
  type CouponPolicyType,
  type CouponRoundStatus,
  type CouponRoundView,
  type CouponTemplateDetail,
  type IssuanceStatus,
  type MembershipGrade,
} from "./coupon/types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 화면을 연 시각. 재고는 여기서부터 줄어듭니다. */
export const BOOT = Date.now();

/**
 * 발급된 쿠폰이 시간이 지나 어떻게 끝나는지의 비율.
 *
 * 운영 현황의 상태 변경 요약, 캠페인 상세의 상태별 보유량, 분석의 상태 전이 퍼널이
 * 모두 이 값을 씁니다. 세 화면이 서로 다른 사용률을 말하면 안 되기 때문입니다.
 */
export const LIFECYCLE = { used: 0.35, expired: 0.15, cancelled: 0.1 } as const;

/**
 * 한 회차에서 발급된 쿠폰이 지금 어떤 상태로 나뉘어 있는지.
 *
 * 방금 오픈한 회차의 쿠폰은 아직 쓰이지도, 만료되지도 않았습니다. 유효기간이
 * 얼마나 지났는지에 따라 위 LIFECYCLE 비율에 차츰 다가갑니다.
 */
export function lifecycleOf(r: CouponRoundView, now: number) {
  const issued = r.activeCount;
  const hours = Math.max(0, now - Date.parse(r.openAt)) / HOUR;
  // 쓸 사람은 대부분 받은 당일에 씁니다. 취소는 그보다 더 빨리 끝납니다.
  const used = Math.round(issued * LIFECYCLE.used * (1 - Math.exp(-hours / 36)));
  const cancelled = Math.round(issued * LIFECYCLE.cancelled * (1 - Math.exp(-hours / 6)));
  // 만료는 유효기간이 거의 다 지난 뒤에야 생깁니다.
  const life = Math.max(1, r.validDays * 24);
  const expired = Math.round(issued * LIFECYCLE.expired * Math.max(0, (hours / life - 0.8) / 0.2));
  return {
    issued,
    used,
    cancelled,
    expired,
    held: Math.max(0, issued - used - cancelled - expired),
  };
}

/* ── 결정론 난수 ────────────────────────────────────── */

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(rand: () => number): string {
  let out = "";
  for (let i = 0; i < 16; i += 1) out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return out;
}

/* ── 템플릿 ─────────────────────────────────────────── */

interface TemplateSeed {
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  validDays: number;
  nthWeek: number;
  dayOfWeek: CouponDayOfWeek;
  startTime: string;
  durationHours: number;
  stockPerOccurrence: number;
  eligibleGrades: MembershipGrade[];
}

const ALL = GRADES;
const SILVER_UP: MembershipGrade[] = ["SILVER", "GOLD", "VIP"];
const GOLD_UP: MembershipGrade[] = ["GOLD", "VIP"];
const VIP_ONLY: MembershipGrade[] = ["VIP"];

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    brandId: 1,
    name: "모카빈 브랜드데이",
    policyType: "PERCENT_CAPPED",
    discountRate: 40,
    maxDiscountAmount: 8000,
    discountAmount: null,
    validDays: 14,
    nthWeek: 1,
    dayOfWeek: "TUE",
    startTime: "14:00:00",
    durationHours: 4,
    stockPerOccurrence: 10000,
    eligibleGrades: ALL,
  },
  {
    brandId: 2,
    name: "씨네플러스 관람권 할인",
    policyType: "FIXED_AMOUNT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: 5000,
    validDays: 30,
    nthWeek: 1,
    dayOfWeek: "THU",
    startTime: "18:00:00",
    durationHours: 3,
    stockPerOccurrence: 8000,
    eligibleGrades: ALL,
  },
  {
    brandId: 3,
    name: "버거하우스 점심 특가",
    policyType: "PERCENT_CAPPED",
    discountRate: 15,
    maxDiscountAmount: 4000,
    discountAmount: null,
    validDays: 7,
    nthWeek: 1,
    dayOfWeek: "FRI",
    startTime: "11:00:00",
    durationHours: 2,
    stockPerOccurrence: 12000,
    eligibleGrades: ALL,
  },
  {
    brandId: 4,
    name: "프레시마트 장보기 쿠폰",
    policyType: "FIXED_AMOUNT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: 10000,
    validDays: 21,
    nthWeek: 2,
    dayOfWeek: "TUE",
    startTime: "10:00:00",
    durationHours: 6,
    stockPerOccurrence: 6000,
    eligibleGrades: SILVER_UP,
  },
  {
    brandId: 5,
    name: "북스토리 새학기 쿠폰",
    policyType: "PERCENT_CAPPED",
    discountRate: 10,
    maxDiscountAmount: 5000,
    discountAmount: null,
    validDays: 30,
    nthWeek: 2,
    dayOfWeek: "WED",
    startTime: "15:00:00",
    durationHours: 3,
    stockPerOccurrence: 7000,
    eligibleGrades: ALL,
  },
  {
    brandId: 6,
    name: "필름아레나 심야 상영",
    policyType: "FIXED_AMOUNT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: 8000,
    validDays: 14,
    nthWeek: 2,
    dayOfWeek: "FRI",
    startTime: "19:00:00",
    durationHours: 3,
    stockPerOccurrence: 4000,
    eligibleGrades: GOLD_UP,
  },
  {
    brandId: 7,
    name: "스포츠존 결승전 쿠폰",
    policyType: "PERCENT_CAPPED",
    discountRate: 25,
    maxDiscountAmount: 30000,
    discountAmount: null,
    validDays: 10,
    nthWeek: 3,
    dayOfWeek: "MON",
    startTime: "12:00:00",
    durationHours: 5,
    stockPerOccurrence: 9000,
    eligibleGrades: ALL,
  },
  {
    brandId: 8,
    name: "뷰티랩 시즌오프",
    policyType: "PERCENT_CAPPED",
    discountRate: 30,
    maxDiscountAmount: 25000,
    discountAmount: null,
    validDays: 14,
    nthWeek: 3,
    dayOfWeek: "WED",
    startTime: "16:00:00",
    durationHours: 4,
    stockPerOccurrence: 5000,
    eligibleGrades: SILVER_UP,
  },
  {
    brandId: 9,
    name: "딜리버리고 여름특가",
    policyType: "FIXED_AMOUNT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: 4000,
    validDays: 7,
    nthWeek: 3,
    dayOfWeek: "SAT",
    startTime: "17:00:00",
    durationHours: 4,
    stockPerOccurrence: 15000,
    eligibleGrades: ALL,
  },
  {
    brandId: 10,
    name: "트래블온 항공권 쿠폰",
    policyType: "PERCENT_CAPPED",
    discountRate: 12,
    maxDiscountAmount: 50000,
    discountAmount: null,
    validDays: 60,
    nthWeek: 4,
    dayOfWeek: "TUE",
    startTime: "13:00:00",
    durationHours: 6,
    stockPerOccurrence: 3000,
    eligibleGrades: GOLD_UP,
  },
  {
    brandId: 11,
    name: "헬스클럽 3개월권",
    policyType: "FIXED_AMOUNT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: 30000,
    validDays: 45,
    nthWeek: 4,
    dayOfWeek: "THU",
    startTime: "20:00:00",
    durationHours: 2,
    stockPerOccurrence: 1500,
    eligibleGrades: VIP_ONLY,
  },
  {
    brandId: 12,
    name: "게임스테이션 주말팩",
    policyType: "PERCENT_CAPPED",
    discountRate: 20,
    maxDiscountAmount: 12000,
    discountAmount: null,
    validDays: 14,
    nthWeek: 4,
    dayOfWeek: "SAT",
    startTime: "21:00:00",
    durationHours: 3,
    stockPerOccurrence: 11000,
    eligibleGrades: ALL,
  },
];

let templates: CouponTemplateDetail[] = TEMPLATE_SEEDS.map((seed, i) => ({
  id: i + 1,
  active: true,
  ...seed,
}));
let nextTemplateId = templates.length + 1;

export function listTemplates(): CouponTemplateDetail[] {
  return templates;
}

export function findTemplate(id: number): CouponTemplateDetail | undefined {
  return templates.find((t) => t.id === id);
}

export function addTemplate(t: Omit<CouponTemplateDetail, "id" | "active">): CouponTemplateDetail {
  const created: CouponTemplateDetail = { id: nextTemplateId++, active: true, ...t };
  templates = [...templates, created];
  return created;
}

export function putTemplate(t: CouponTemplateDetail): CouponTemplateDetail {
  templates = templates.map((x) => (x.id === t.id ? t : x));
  return t;
}

/* ── 회차 ───────────────────────────────────────────
   배치(CouponRoundGenerator)가 하는 일입니다. "매월 N번째 X요일 HH:MM" 규칙에서
   발생 시각을 뽑고, 데모에서 확인해야 하는 국면은 오프셋으로 지금 근처에 배치합니다. */

function nthWeekdayOf(
  year: number,
  month: number,
  nthWeek: number,
  day: CouponDayOfWeek,
  startTime: string,
) {
  // JS 의 getDay() 는 일요일이 0, DAYS_OF_WEEK 는 월요일이 0
  const targetDow = (DAYS_OF_WEEK.indexOf(day) + 1) % 7;
  const first = new Date(year, month, 1);
  const shift = (targetDow - first.getDay() + 7) % 7;
  const date = 1 + shift + (nthWeek - 1) * 7;
  const [h, m] = startTime.split(":").map(Number);
  return new Date(year, month, date, h, m, 0, 0).getTime();
}

interface DemoState {
  /** now 기준 오픈 시각 오프셋(분). 없으면 반복 규칙을 그대로 씁니다. */
  openOffsetMin?: number;
  /** 화면을 연 시점의 소진 비율 */
  consumed: number;
  /** 이 회차에 분당 몰리는 발급 수요. 재고가 남아 있으면 그대로 발급됩니다. */
  demandPerMinute: number;
}

const DEMO: Record<number, DemoState> = {
  3: { openOffsetMin: -25, consumed: 0.48, demandPerMinute: 40 }, //   점심 특가 · 여유 있게 발급 중
  9: { openOffsetMin: -10, consumed: 0.69, demandPerMinute: 180 }, //  가장 혼잡한 회차
  5: { openOffsetMin: -45, consumed: 0.94, demandPerMinute: 18 }, //   수량 소진 임박
  7: { openOffsetMin: 12, consumed: 0, demandPerMinute: 95 }, //       곧 오픈
  2: { openOffsetMin: 95, consumed: 0, demandPerMinute: 60 }, //       오늘 낮 오픈
  1: { openOffsetMin: -260, consumed: 1, demandPerMinute: 70 }, //     오전에 마감 · 완판
  4: { openOffsetMin: -1500, consumed: 1, demandPerMinute: 55 }, //    어제 마감 · 완판
};

function demoOf(templateId: number, brandId: number): DemoState {
  const fixed = DEMO[brandId];
  if (fixed) return fixed;
  const rand = mulberry32(templateId * 977 + 41);
  return { consumed: 0.2 + rand() * 0.45, demandPerMinute: 6 + Math.floor(rand() * 40) };
}

/** 오프셋으로 만든 시각은 5분 단위로 맞춥니다. 19:06 오픈은 일정표처럼 보이지 않습니다. */
function snap5(ms: number) {
  return Math.floor(ms / (5 * MINUTE)) * 5 * MINUTE;
}

/** 회차 하나의 현재 모습. 두 어댑터가 이 값을 그대로 씁니다. */
export interface RoundState {
  round: CouponRoundView;
  /** 실제로 나가고 있는 분당 발급 장수. 마감·오픈 전이면 0 입니다. */
  ratePerMinute: number;
  /** 재고와 무관하게 이 회차에 몰리는 분당 수요 */
  demandPerMinute: number;
  /** 대기 인원. 대기열이 꺼져 있으면 0 입니다. */
  waiting: number;
  /** 분당 입장 처리 인원 */
  admittedPerMinute: number;
  /** 입장까지 예상 시간(초). 처리율이 0 이면 null 입니다. */
  queueEtaSeconds: number | null;
}

function buildRoundState(t: CouponTemplateDetail, now: number): RoundState {
  const demo = demoOf(t.id, t.brandId);
  const ref = new Date(now);

  let openAt: number;
  if (demo.openOffsetMin !== undefined) {
    openAt = snap5(now + demo.openOffsetMin * MINUTE);
  } else {
    const thisMonth = nthWeekdayOf(
      ref.getFullYear(),
      ref.getMonth(),
      t.nthWeek,
      t.dayOfWeek,
      t.startTime,
    );
    const nextMonth = nthWeekdayOf(
      ref.getFullYear(),
      ref.getMonth() + 1,
      t.nthWeek,
      t.dayOfWeek,
      t.startTime,
    );
    openAt = thisMonth + t.durationHours * HOUR > now ? thisMonth : nextMonth;
  }
  const closeAt = openAt + t.durationHours * HOUR;
  const total = t.stockPerOccurrence;

  // 오픈 전에는 아무도 못 받았고, 마감이 지난 회차는 완판으로 둡니다.
  const opened = now >= openAt;
  const finished = now >= closeAt;
  const sinceBootMin = Math.max(0, (Math.min(now, closeAt) - BOOT) / MINUTE);
  const simulated = !opened
    ? 0
    : finished
      ? total
      : Math.floor(total * demo.consumed + sinceBootMin * demo.demandPerMinute);
  const activeCount = Math.max(0, Math.min(total, simulated + issuedCountOf(t.id)));

  let status: CouponRoundStatus;
  if (now < openAt) status = "SCHEDULED";
  else if (now >= closeAt || activeCount >= total) status = "CLOSED";
  else status = "OPEN";

  const queueActive = status === "OPEN" && isQueueActive(demo.demandPerMinute);
  const ratePerMinute = status === "OPEN" ? demo.demandPerMinute : 0;
  // 대기열이 켜지면 수요가 줄을 서고, 입장은 수요보다 조금 빠르게 처리됩니다.
  const admittedPerMinute = queueActive ? Math.round(demo.demandPerMinute * 1.15) : 0;
  // 대기 줄의 길이는 1분치 수요만큼입니다. 입장이 수요보다 빨라서 줄은 조금씩 짧아집니다.
  const waiting = queueActive ? demo.demandPerMinute : 0;

  return {
    round: {
      id: t.id,
      templateId: t.id,
      brandId: t.brandId,
      name: t.name,
      policyType: t.policyType,
      discountRate: t.discountRate,
      maxDiscountAmount: t.maxDiscountAmount,
      discountAmount: t.discountAmount,
      validDays: t.validDays,
      eligibleGrades: t.eligibleGrades,
      openAt: new Date(openAt).toISOString(),
      closeAt: new Date(closeAt).toISOString(),
      totalQuantity: total,
      activeCount,
      status,
      queueActive,
    },
    ratePerMinute,
    demandPerMinute: demo.demandPerMinute,
    waiting,
    admittedPerMinute,
    queueEtaSeconds:
      queueActive && admittedPerMinute > 0
        ? Math.max(1, Math.round((waiting / admittedPerMinute) * 60))
        : null,
  };
}

export function listRoundStates(now: number): RoundState[] {
  return templates.filter((t) => t.active).map((t) => buildRoundState(t, now));
}

export function findRoundState(couponRoundId: number, now: number): RoundState | undefined {
  const t = templates.find((x) => x.id === couponRoundId && x.active);
  return t ? buildRoundState(t, now) : undefined;
}

export function remainingOf(r: CouponRoundView): number {
  return Math.max(0, r.totalQuantity - r.activeCount);
}

/**
 * 회차 하나에 분당 들어오는 발급 시도의 구성.
 *
 * 성공 건수는 그 회차가 실제로 내보내는 발급 수이고, 나머지는 회차의 상태에서 나옵니다.
 * 재고가 바닥일수록 같은 트래픽이 품절 응답으로 바뀌고, 참여 등급이 좁을수록 등급 미달이 늡니다.
 */
export function attemptMixPerMinute(s: RoundState, now: number) {
  const r = s.round;
  const empty = {
    issued: 0,
    queueAccepted: 0,
    alreadyIssued: 0,
    soldOut: 0,
    notEligible: 0,
    entryExpired: 0,
    systemFailure: 0,
  };
  if (r.status === "SCHEDULED") return empty;

  if (r.status !== "OPEN") {
    // 마감 직후에도 한동안 뒤늦은 요청이 들어옵니다. 두 시간이 지나면 잦아듭니다.
    const closedAgoMin = (now - Date.parse(r.closeAt)) / MINUTE;
    const late = Math.round(s.demandPerMinute * Math.max(0, 1 - closedAgoMin / 120));
    if (late <= 0) return empty;
    // 재고가 남아 있지 않으므로 전부 되돌려 보냅니다.
    return { ...empty, soldOut: late, alreadyIssued: Math.round(late * 0.06) };
  }

  const issued = Math.round(s.ratePerMinute);
  const queueAccepted = r.queueActive ? Math.round(s.admittedPerMinute) : 0;
  const remainRatio = r.totalQuantity > 0 ? remainingOf(r) / r.totalQuantity : 0;
  // 재고가 10% 아래로 내려가야 발급 직전에 밀려나는 요청이 생깁니다.
  const scarcity = Math.max(0, Math.min(1, 1 - remainRatio / 0.1));
  // 등급 제한이 걸린 회차에는 자격이 없는 회원도 같은 비율로 눌러 봅니다.
  const gradeCoverage = r.eligibleGrades.length / GRADES.length;
  const excluded = gradeCoverage > 0 ? (1 - gradeCoverage) / gradeCoverage : 0;

  return {
    issued,
    queueAccepted,
    alreadyIssued: Math.round(issued * 0.06),
    soldOut: Math.round(issued * scarcity),
    notEligible: Math.round(issued * excluded * 0.9),
    entryExpired: Math.round(queueAccepted * 0.012),
    systemFailure: 0,
  };
}

/* ── 발급 이력 저장소 ───────────────────────────────── */

/** 사용 한 건. 사용 취소를 하면 취소 시각이 찍히고 새 사용을 다시 붙일 수 있습니다. */
export interface CouponUsage {
  orderId: number;
  discountAmount: number;
  usedAt: string;
  canceledAt: string | null;
}

export interface StoredIssuance {
  issuanceId: number;
  couponRoundId: number;
  memberId: number;
  code: string;
  issuedGrade: MembershipGrade;
  status: IssuanceStatus;
  issuedAt: string;
  expiresAt: string;
  /* 아래 셋은 지금 살아 있는 사용의 스냅샷입니다. 사용 취소를 하면 다시 비워집니다. */
  usedAt: string | null;
  orderId: number | null;
  discountAmount: number | null;
  /** 취소된 것까지 포함한 사용 이력 */
  usages: CouponUsage[];
  /** 발급 취소 시각 */
  canceledAt: string | null;
}

interface Persisted {
  issuances: StoredIssuance[];
  nextIssuanceId: number;
  seededMembers: number[];
}

const STORE_KEY = "coupon-yaho.mock.v5";

function emptyState(): Persisted {
  return { issuances: [], nextIssuanceId: 90001, seededMembers: [] };
}

let store: Persisted | null = null;

export function loadStore(): Persisted {
  if (store) return store;
  if (typeof window === "undefined") {
    store = emptyState();
    return store;
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    store = raw ? (JSON.parse(raw) as Persisted) : emptyState();
  } catch {
    store = emptyState();
  }
  return store;
}

export function saveStore() {
  if (typeof window === "undefined" || !store) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* 저장 실패는 무시합니다 */
  }
}

/** 만료 배치가 하는 일 — 읽는 시점에 유효기간이 지난 건을 EXPIRED 로 넘깁니다. */
export function applyExpiry(now: number) {
  const s = loadStore();
  let changed = false;
  for (const i of s.issuances) {
    if (i.status === "ISSUED" && Date.parse(i.expiresAt) <= now) {
      i.status = "EXPIRED";
      changed = true;
    }
  }
  if (changed) saveStore();
}

export function issuedCountOf(couponRoundId: number): number {
  return loadStore().issuances.filter(
    (i) =>
      i.couponRoundId === couponRoundId &&
      (i.status === "ISSUED" || i.status === "USED" || i.status === "EXPIRED"),
  ).length;
}

export function memberIssuances(memberId: number): StoredIssuance[] {
  return loadStore().issuances.filter((i) => i.memberId === memberId);
}

/** 처음 보는 회원에게는 지난 회차에서 받은 이력을 심어 둡니다. */
export function seedMember(memberId: number, grade: MembershipGrade, now: number) {
  const s = loadStore();
  if (s.seededMembers.includes(memberId)) return;
  s.seededMembers.push(memberId);

  const rand = mulberry32(memberId * 7919 + 13);
  // 이미 마감된 회차에서만 만들어 둡니다. 열려 있는 회차는 직접 눌러서 받게 둡니다.
  const closed = listRoundStates(now).filter((r) => Date.parse(r.round.closeAt) < now);
  if (closed.length === 0) {
    saveStore();
    return;
  }

  // 보유 · 사용 완료 · 만료 세 가지를 하나씩 둡니다. 쿠폰함에서 세 상태를 다 볼 수 있습니다.
  const statuses: IssuanceStatus[] = ["ISSUED", "USED", "EXPIRED"];
  statuses.forEach((status, idx) => {
    const r = closed[idx % closed.length]!;
    // 만료 건은 유효기간이 끝난 뒤여야 하므로 지난달 회차에서 받은 것으로 둡니다.
    const issuedAt =
      status === "EXPIRED"
        ? now - (r.round.validDays + 3) * DAY
        : Date.parse(r.round.openAt) + 3 * MINUTE;
    const expiresAt = issuedAt + r.round.validDays * DAY;
    const usedAt = Math.min(issuedAt + 2 * DAY, now - 5 * MINUTE);

    s.issuances.push({
      issuanceId: s.nextIssuanceId++,
      couponRoundId: r.round.id,
      memberId,
      code: makeCode(rand),
      issuedGrade: grade,
      status,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      usedAt: status === "USED" ? new Date(usedAt).toISOString() : null,
      orderId: status === "USED" ? 88000 + idx : null,
      discountAmount: status === "USED" ? calcDiscount(r.round, 42000) : null,
      usages:
        status === "USED"
          ? [
              {
                orderId: 88000 + idx,
                discountAmount: calcDiscount(r.round, 42000),
                usedAt: new Date(usedAt).toISOString(),
                canceledAt: null,
              },
            ]
          : [],
      canceledAt: null,
    });
  });

  saveStore();
}

export function appendIssuance(i: Omit<StoredIssuance, "issuanceId">): StoredIssuance {
  const s = loadStore();
  const created: StoredIssuance = { issuanceId: s.nextIssuanceId++, ...i };
  s.issuances.unshift(created);
  saveStore();
  return created;
}

export function findIssuance(issuanceId: number): StoredIssuance | undefined {
  return loadStore().issuances.find((i) => i.issuanceId === issuanceId);
}

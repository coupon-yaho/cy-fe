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
  gradesToMask,
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
  /** DATA_GRANT 전용 */
  dataGrantMb?: number | null;
  minOrderAmount?: number | null;
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
    // 정책 3종 중 DATA_GRANT 를 실제로 관측할 수 있는 유일한 자리입니다.
    // 열거값만 타입에 넣고 아무 데서도 안 그리면 렌더를 검증할 방법이 없습니다.
    name: "게임스테이션 주말 데이터팩",
    policyType: "DATA_GRANT",
    discountRate: null,
    maxDiscountAmount: null,
    discountAmount: null,
    dataGrantMb: 1024,
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
  // 시드는 화면에 편한 배열로 쓰고, 계약 필드(마스크)는 여기서 한 번 만듭니다.
  // DB 는 eligible_grades_mask tinyint 하나만 들고 있습니다.
  ...seed,
  eligibleGradesMask: gradesToMask(seed.eligibleGrades),
  dataGrantMb: seed.dataGrantMb ?? null,
  minOrderAmount: seed.minOrderAmount ?? null,
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

function buildRoundState(
  t: CouponTemplateDetail,
  now: number,
  /* 예약으로 만들어진 회차는 규칙이 아니라 **지정된 시각**을 씁니다.
     이게 없으면 예약을 해도 화면에는 규칙에서 계산한 회차만 보여서,
     방금 예약한 것이 어디로 갔는지 알 수 없습니다. */
  fixed?: { id: number; openAt: number; closeAt: number },
): RoundState {
  const demo = demoOf(t.id, t.brandId);
  const ref = new Date(now);

  let openAt: number;
  if (fixed) {
    openAt = fixed.openAt;
  } else if (demo.openOffsetMin !== undefined) {
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
  const closeAt = fixed ? fixed.closeAt : openAt + t.durationHours * HOUR;
  const total = t.stockPerOccurrence;

  // 오픈 전에는 아무도 못 받았고, 마감이 지난 회차는 완판으로 둡니다.
  const opened = now >= openAt;
  const finished = now >= closeAt;
  const sinceBootMin = Math.max(0, (Math.min(now, closeAt) - BOOT) / MINUTE);
  const simulated =
    fixed || !opened
      ? 0
      : finished
        ? total
        : Math.floor(total * demo.consumed + sinceBootMin * demo.demandPerMinute);
  const roundId = fixed ? fixed.id : t.id;
  const activeCount = Math.max(0, Math.min(total, simulated + issuedCountOf(roundId)));

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
      id: roundId,
      templateId: t.id,
      brandId: t.brandId,
      name: t.name,
      policyType: t.policyType,
      discountRate: t.discountRate,
      maxDiscountAmount: t.maxDiscountAmount,
      dataGrantMb: t.dataGrantMb,
      minOrderAmount: t.minOrderAmount,
      eligibleGradesMask: t.eligibleGradesMask,
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

/* ── 예약된 회차 ───────────────────────────────────
   POST /admin/coupon-templates/{id}/rounds 가 만든 것들입니다.
   규칙에서 계산되는 회차와 달리 시각이 못 박혀 있어 따로 들고 있습니다.
   id 는 템플릿 id 와 겹치지 않게 9000번대에서 셉니다. */

interface ReservedRound {
  id: number;
  templateId: number;
  openAt: number;
  closeAt: number;
}

/** 예약 회차는 저장본에 들어 있습니다 — 새로고침해도 남아야 합니다. */
function reservedRounds(): ReservedRound[] {
  return loadStore().reservedRounds;
}

/** 24시간 — 백엔드 요청 DTO 의 @AssertTrue 와 같은 값입니다 */
export const MAX_ROUND_SPAN_MS = 24 * HOUR;

export type ReserveFailure =
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_INACTIVE"
  | "INVALID_SCHEDULE"
  | "ALREADY_EXISTS"
  | "SCHEDULE_CONFLICT";

/**
 * 회차 예약. 백엔드 CouponRoundReservationService 와 같은 순서로 검사합니다.
 * 성공하면 만들어진 회차를, 실패하면 사유를 돌려줍니다 —
 * 목이 화면용 문구를 정하지 않도록 사유만 주고 번역은 어댑터가 합니다.
 */
export function reserveRound(
  templateId: number,
  openAt: number,
  closeAt: number,
  now: number,
): { ok: true; state: RoundState } | { ok: false; reason: ReserveFailure } {
  const t = templates.find((x) => x.id === templateId);
  if (!t) return { ok: false, reason: "TEMPLATE_NOT_FOUND" };
  if (!t.active) return { ok: false, reason: "TEMPLATE_INACTIVE" };

  if (
    !Number.isFinite(openAt) ||
    !Number.isFinite(closeAt) ||
    closeAt <= openAt ||
    closeAt - openAt > MAX_ROUND_SPAN_MS ||
    openAt < now
  ) {
    return { ok: false, reason: "INVALID_SCHEDULE" };
  }

  const live = listRoundStates(now);

  // 같은 템플릿을 같은 시각에 두 번 열 수 없습니다 (COUPON_ROUND-201).
  // 백엔드 existsByTemplateIdAndOpenAt 와 같은 검사입니다.
  if (
    live.some((s) => s.round.templateId === templateId && Date.parse(s.round.openAt) === openAt)
  ) {
    return { ok: false, reason: "ALREADY_EXISTS" };
  }

  /* 시간이 겹치는 회차가 있으면 막습니다 (COUPON_ROUND-202).

     막는 단위는 **시간대이지 날짜가 아닙니다.** 같은 날에 브랜드가 여러 개 잡히는 건
     정상입니다 — 09-11 모카빈, 11-13 씨네플러스, 13-15 버거하우스처럼 이어서 열립니다.
     경계가 맞닿는 것도 겹침이 아닙니다(앞 회차가 11:00 에 닫히면 11:00 시작은 통과).
     여기서 날짜로 배제하도록 고치면 하루에 하나만 열리게 되어 사양이 바뀝니다.

     **브랜드는 가리지 않습니다** — 백엔드 existsOverlappingSchedule 은 브랜드 조건 없이
     전역으로 봅니다. 앞서 같은 브랜드만 보게 해 두어서 목이 백엔드보다 느슨했습니다.
     이미 끝난 회차(CLOSED)는 대상이 아닙니다 — 백엔드도 SCHEDULED·OPEN 만 셉니다. */
  const overlaps = live.some((s) => {
    if (s.round.status === "CLOSED") return false;
    const a = Date.parse(s.round.openAt);
    const b = Date.parse(s.round.closeAt);
    return openAt < b && closeAt > a;
  });
  if (overlaps) return { ok: false, reason: "SCHEDULE_CONFLICT" };

  const st = loadStore();
  const entry: ReservedRound = { id: st.nextReservedRoundId++, templateId, openAt, closeAt };
  st.reservedRounds.push(entry);
  saveStore();
  return { ok: true, state: buildRoundState(t, now, entry) };
}

function reservedStates(now: number): RoundState[] {
  return reservedRounds().flatMap((r) => {
    const t = templates.find((x) => x.id === r.templateId && x.active);
    return t ? [buildRoundState(t, now, r)] : [];
  });
}

export function listRoundStates(now: number): RoundState[] {
  return [
    ...templates.filter((t) => t.active).map((t) => buildRoundState(t, now)),
    ...reservedStates(now),
  ];
}

export function findRoundState(couponRoundId: number, now: number): RoundState | undefined {
  const r = reservedRounds().find((x) => x.id === couponRoundId);
  if (r) {
    const t = templates.find((x) => x.id === r.templateId && x.active);
    return t ? buildRoundState(t, now, r) : undefined;
  }
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
  /* 관리자가 예약한 회차. 새로고침에 사라지면 "예약했다" 는 화면이 거짓말이 됩니다 —
     실서버라면 DB 에 남는 것이라 목도 남겨야 같은 것을 보여 줍니다. */
  reservedRounds: ReservedRound[];
  nextReservedRoundId: number;
  /* 대기열 티켓과 입장 토큰. 실서버에서는 Redis 에 있고 새로고침해도 순번이
     유지됩니다(PRD 설계 규칙 5 — /entry 는 멱등). 목이 메모리에만 들고 있으면
     새로고침한 사람이 줄 맨 뒤로 밀려서 PRD 가 막으려던 일이 그대로 일어납니다. */
  queueTickets: Record<string, unknown>;
  entryTokens: Record<string, unknown>;
}

// 저장 형식이 바뀌었으므로 키를 올립니다. 옛 키는 그대로 두고 무시합니다.
const STORE_KEY = "coupon-yaho.mock.v7";

function emptyState(): Persisted {
  return {
    issuances: [],
    nextIssuanceId: 90001,
    seededMembers: [],
    reservedRounds: [],
    nextReservedRoundId: 9001,
    queueTickets: {},
    entryTokens: {},
  };
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
    // 저장본에 없는 필드는 메웁니다 — 형식이 늘어도 옛 저장본이 화면을 깨지 않게.
    store = raw ? { ...emptyState(), ...(JSON.parse(raw) as Partial<Persisted>) } : emptyState();
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

/* ── 캘린더 ─────────────────────────────────────────
   달력은 "지금 근처"가 아니라 **임의의 달**을 봅니다. 그래서 listRoundStates 를
   못 씁니다 — 그쪽은 데모 국면을 지금 옆에 배치하느라 회차마다 오프셋이 걸려 있습니다.

   여기서는 템플릿의 반복 규칙(매월 N번째 X요일 HH:MM)에서 그 달의 발생만 계산합니다.
   재고는 **그 달의 발생이 지금 살아 있는 회차와 같은 날일 때만** 붙입니다.
   지난달·다음달 칸에 재고 게이지를 그리면 있지도 않은 수치를 지어내는 것이 됩니다. */

export interface CalendarOccurrence {
  templateId: number;
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  dataGrantMb: number | null;
  eligibleGradesMask: number;
  eligibleGrades: MembershipGrade[];
  /** ms */
  openAt: number;
  closeAt: number;
  /** 이 달의 발생이 지금 살아 있는 회차와 같으면 그 회차. 아니면 null */
  round: CouponRoundView | null;
  /** round 가 없을 때 시각만으로 매긴 상태 */
  status: CouponRoundStatus;
}

/**
 * year·monthIndex(0~11) 달에 열리는 회차들.
 *
 * ⚠️ 반복 규칙만으로 계산하면 **화면끼리 말이 달라집니다.**
 *
 * 이 데모는 방문자가 언제 들어와도 발급 중인 회차를 보도록 DEMO 오프셋으로 일부
 * 회차를 지금 옆에 끌어다 놓습니다(3·9·5 가 동시에 OPEN). 그런데 템플릿의 반복
 * 규칙(매월 N번째 X요일)은 12개가 전부 다른 날이라 **같은 날 두 개가 열리는 경우가
 * 한 번도 없습니다.** 규칙으로만 달력을 그리면 홈이 "3개 발급 중"이라고 말하는 그
 * 날짜에 달력은 빈 칸을 그립니다.
 *
 * 그래서 **살아 있는 회차의 실제 openAt 이 먼저**입니다. 그 회차가 이 달에 떨어지면
 * 그 날짜에 놓고, 아니면 그 달의 규칙 날짜에 일정만 놓습니다.
 */
export function listMonthOccurrences(
  year: number,
  monthIndex: number,
  now: number,
): CalendarOccurrence[] {
  const inMonth = (ms: number) => {
    const d = new Date(ms);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  };

  const live = new Map(listRoundStates(now).map((s) => [s.round.templateId, s.round]));

  return templates
    .filter((t) => t.active)
    .map((t) => {
      const round = live.get(t.id) ?? null;
      const liveOpenAt = round ? Date.parse(round.openAt) : null;

      // ① 살아 있는 회차가 이 달에 있으면 그 날짜가 진짜입니다
      if (liveOpenAt !== null && inMonth(liveOpenAt)) {
        return {
          ...base(t),
          openAt: liveOpenAt,
          closeAt: Date.parse(round!.closeAt),
          round,
          status: round!.status,
        } satisfies CalendarOccurrence;
      }

      // ② 아니면 이 달의 반복 규칙 날짜에 일정만 놓습니다 (재고 없음)
      const openAt = nthWeekdayOf(year, monthIndex, t.nthWeek, t.dayOfWeek, t.startTime);
      if (!inMonth(openAt)) return null; // 5번째 X요일처럼 그 달에 없는 날
      const closeAt = openAt + t.durationHours * HOUR;
      return {
        ...base(t),
        openAt,
        closeAt,
        round: null,
        status: now < openAt ? "SCHEDULED" : now < closeAt ? "OPEN" : "CLOSED",
      } satisfies CalendarOccurrence;
    })
    .filter((o): o is CalendarOccurrence => o !== null)
    .sort((a, b) => a.openAt - b.openAt);
}

/** 회차·일정 양쪽이 공통으로 쓰는 표시 필드 */
function base(t: CouponTemplateDetail) {
  return {
    templateId: t.id,
    brandId: t.brandId,
    name: t.name,
    policyType: t.policyType,
    discountRate: t.discountRate,
    maxDiscountAmount: t.maxDiscountAmount,
    discountAmount: t.discountAmount,
    dataGrantMb: t.dataGrantMb,
    eligibleGradesMask: t.eligibleGradesMask,
    eligibleGrades: t.eligibleGrades,
  };
}

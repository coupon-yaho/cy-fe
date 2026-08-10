// 인메모리 목 스토어. 실제 백엔드 연동 시 src/lib/api.ts 만 교체하면 됩니다.
import {
  DAY_LABEL,
  GRADE_SHARE,
  GRADES,
  MASK_ALL,
  MASK_GOLD_UP,
  MASK_SILVER_UP,
  MASK_VIP,
  maskUserId,
  type AppEvent,
  type Brand,
  type Coupon,
  type CouponStatus,
  type CouponTemplate,
  type Grade,
  type Issuance,
  type PolicyType,
} from "./domain";

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

const rand = mulberry32(20260810);

const HOUR = 3600_000;
const DAY = 24 * HOUR;

interface BrandSeed {
  name: string;
  category: string;
  emoji: string;
  color: string;
  nthWeek: number;
  dayOfWeek: number;
  startTime: string;
  policyType: PolicyType;
  policyValue: number;
  policyCap: number | null;
  mask: number;
  stock: number;
}

const BRAND_SEEDS: BrandSeed[] = [
  { name: "모카빈", category: "카페", emoji: "☕", color: "#8b5e3c", nthWeek: 1, dayOfWeek: 2, startTime: "14:00", policyType: "RATE_CAP", policyValue: 20, policyCap: 20000, mask: MASK_ALL, stock: 10000 },
  { name: "씨네플러스", category: "영화", emoji: "🎬", color: "#c0392b", nthWeek: 1, dayOfWeek: 4, startTime: "18:00", policyType: "FLAT", policyValue: 5000, policyCap: null, mask: MASK_ALL, stock: 8000 },
  { name: "버거하우스", category: "외식", emoji: "🍔", color: "#e67e22", nthWeek: 1, dayOfWeek: 5, startTime: "11:00", policyType: "RATE_CAP", policyValue: 15, policyCap: 10000, mask: MASK_ALL, stock: 12000 },
  { name: "프레시마트", category: "마트", emoji: "🛒", color: "#27ae60", nthWeek: 2, dayOfWeek: 2, startTime: "10:00", policyType: "FLAT", policyValue: 10000, policyCap: null, mask: MASK_SILVER_UP, stock: 6000 },
  { name: "북스토리", category: "서점", emoji: "📚", color: "#2d6cb5", nthWeek: 2, dayOfWeek: 3, startTime: "15:00", policyType: "RATE_CAP", policyValue: 10, policyCap: 5000, mask: MASK_ALL, stock: 7000 },
  { name: "필름아레나", category: "영화", emoji: "🍿", color: "#8e44ad", nthWeek: 2, dayOfWeek: 5, startTime: "19:00", policyType: "FLAT", policyValue: 8000, policyCap: null, mask: MASK_GOLD_UP, stock: 4000 },
  { name: "스포츠존", category: "스포츠", emoji: "⚽", color: "#16a085", nthWeek: 3, dayOfWeek: 1, startTime: "12:00", policyType: "RATE_CAP", policyValue: 25, policyCap: 30000, mask: MASK_ALL, stock: 9000 },
  { name: "뷰티랩", category: "뷰티", emoji: "💄", color: "#d81b60", nthWeek: 3, dayOfWeek: 3, startTime: "16:00", policyType: "RATE_CAP", policyValue: 30, policyCap: 25000, mask: MASK_SILVER_UP, stock: 5000 },
  { name: "딜리버리고", category: "배달", emoji: "🛵", color: "#f39c12", nthWeek: 3, dayOfWeek: 5, startTime: "17:00", policyType: "DATA", policyValue: 1, policyCap: null, mask: MASK_ALL, stock: 15000 },
  { name: "트래블온", category: "여행", emoji: "✈️", color: "#0097a7", nthWeek: 4, dayOfWeek: 2, startTime: "13:00", policyType: "FLAT", policyValue: 30000, policyCap: null, mask: MASK_GOLD_UP, stock: 3000 },
  { name: "게임패스", category: "게임", emoji: "🎮", color: "#5b3fd6", nthWeek: 4, dayOfWeek: 4, startTime: "20:00", policyType: "DATA", policyValue: 5, policyCap: null, mask: MASK_ALL, stock: 11000 },
  { name: "헬스클럽", category: "피트니스", emoji: "🏋️", color: "#455a64", nthWeek: 4, dayOfWeek: 5, startTime: "07:00", policyType: "RATE_CAP", policyValue: 40, policyCap: 50000, mask: MASK_VIP, stock: 2000 },
];

export interface Store {
  brands: Brand[];
  templates: CouponTemplate[];
  coupons: Coupon[];
  issuances: Issuance[];
  events: AppEvent[];
  eventSeq: number;
  overIssued: number;
  engine: EngineState;
}

export interface EngineState {
  version: "v1" | "v2" | "v3";
  redisCB: "CLOSED" | "OPEN" | "HALF_OPEN";
  dbCB: "CLOSED" | "OPEN" | "HALF_OPEN";
  kafkaCB: "CLOSED" | "OPEN" | "HALF_OPEN";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function nthWeekdayOf(year: number, month: number, nth: number, dow: number, time: string) {
  const [h, m] = time.split(":").map(Number);
  const first = new Date(year, month, 1);
  const shift = (dow - first.getDay() + 7) % 7;
  const day = 1 + shift + (nth - 1) * 7;
  return new Date(year, month, day, h ?? 0, m ?? 0, 0, 0).getTime();
}

let store: Store | null = null;

function makeCoupon(
  brand: Brand,
  tpl: CouponTemplate,
  openAt: number,
  seq: string,
): Coupon {
  const closeAt = openAt + tpl.durationHours * HOUR;
  return {
    couponId: `cp_${brand.brandId}_${seq}`,
    templateId: tpl.templateId,
    brandId: brand.brandId,
    title: `${brand.name} 브랜드 데이`,
    policyType: tpl.policyType,
    policyValue: tpl.policyValue,
    policyCap: tpl.policyCap,
    totalStock: tpl.stockPerOccurrence,
    issuedCount: 0,
    usedCount: 0,
    openAt,
    closeAt,
    eligibleGradesMask: tpl.eligibleGradesMask,
    status: "SCHEDULED",
  };
}

function pickGrade(r: number): Grade {
  let acc = 0;
  for (const g of GRADES) {
    acc += GRADE_SHARE[g];
    if (r <= acc) return g;
  }
  return "WELCOME";
}

function seed(): Store {
  const now = Date.now();
  const today = new Date(now);
  const brands: Brand[] = BRAND_SEEDS.map((s, i) => ({
    brandId: `b${i + 1}`,
    name: s.name,
    category: s.category,
    emoji: s.emoji,
    color: s.color,
  }));

  const templates: CouponTemplate[] = BRAND_SEEDS.map((s, i) => ({
    templateId: `tpl${i + 1}`,
    brandId: `b${i + 1}`,
    policyType: s.policyType,
    policyValue: s.policyValue,
    policyCap: s.policyCap,
    nthWeek: s.nthWeek,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    durationHours: 6,
    stockPerOccurrence: s.stock,
    eligibleGradesMask: s.mask,
    active: true,
  }));

  const coupons: Coupon[] = [];
  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i]!;
    const tpl = templates[i]!;
    for (let offset = -1; offset <= 1; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const openAt = nthWeekdayOf(
        d.getFullYear(),
        d.getMonth(),
        tpl.nthWeek,
        tpl.dayOfWeek,
        tpl.startTime,
      );
      const seq = `${d.getFullYear()}${pad(d.getMonth() + 1)}`;
      const c = makeCoupon(brand, tpl, openAt, seq);
      coupons.push(c);
    }
  }

  // 시연용: 지금 열려 있는 이벤트 3개를 강제로 만듭니다.
  const liveSeeds = [0, 8, 4];
  liveSeeds.forEach((idx, k) => {
    const brand = brands[idx]!;
    const tpl = templates[idx]!;
    const c = makeCoupon(brand, tpl, now - (10 + k * 5) * 60_000, `live${k}`);
    c.closeAt = now + (4 - k) * HOUR;
    c.totalStock = [10000, 15000, 7000][k]!;
    c.issuedCount = Math.floor(c.totalStock * [0.63, 0.31, 0.95][k]!);
    coupons.push(c);
  });
  // 곧 오픈하는 이벤트 (카운트다운 시연)
  {
    const brand = brands[6]!;
    const tpl = templates[6]!;
    const c = makeCoupon(brand, tpl, now + 3 * 60_000, "soon");
    c.closeAt = now + 6 * HOUR;
    coupons.push(c);
  }

  const issuances: Issuance[] = [];
  const events: AppEvent[] = [];
  let eventSeq = 1;

  for (const c of coupons) {
    if (c.openAt > now) continue;
    if (c.issuedCount === 0) {
      // 과거 회차: 소진율 60~100%
      c.issuedCount = Math.floor(c.totalStock * (0.6 + rand() * 0.4));
    }
    c.usedCount = Math.floor(c.issuedCount * (0.35 + rand() * 0.3));
    const sampleN = Math.min(24, c.issuedCount);
    for (let i = 0; i < sampleN; i++) {
      const uid = `u_${100000 + Math.floor(rand() * 899999)}`;
      const grade = pickGrade(rand());
      const issuedAt = c.openAt + Math.floor(rand() * Math.min(HOUR, c.closeAt - c.openAt));
      const used = rand() < 0.45;
      issuances.push({
        issuanceId: `is_${c.couponId}_${i}`,
        couponId: c.couponId,
        userId: uid,
        maskedUserId: maskUserId(uid),
        grade,
        status: c.closeAt < now && !used && rand() < 0.15 ? "EXPIRED" : used ? "USED" : "ISSUED",
        issuedAt,
        usedAt: used ? issuedAt + Math.floor(rand() * DAY) : null,
        expiresAt: c.closeAt + 30 * DAY,
      });
    }
  }

  for (const c of coupons) {
    if (now < c.openAt) c.status = "SCHEDULED";
    else if (now > c.closeAt || c.issuedCount >= c.totalStock) c.status = "CLOSED";
    else c.status = "OPEN";
  }

  const recent = [...issuances].sort((a, b) => b.issuedAt - a.issuedAt).slice(0, 40);
  for (const is of recent.reverse()) {
    events.push({
      id: eventSeq++,
      at: is.issuedAt,
      type: "ISSUE",
      couponId: is.couponId,
      maskedUserId: is.maskedUserId,
      grade: is.grade,
      message: "쿠폰 발급",
    });
  }

  return {
    brands,
    templates,
    coupons,
    issuances,
    events,
    eventSeq,
    overIssued: 0,
    engine: { version: "v3", redisCB: "CLOSED", dbCB: "CLOSED", kafkaCB: "CLOSED" },
  };
}

export function getStore(): Store {
  if (!store) store = seed();
  refreshStatuses(store);
  return store;
}

export function refreshStatuses(s: Store) {
  const now = Date.now();
  for (const c of s.coupons) {
    if (now < c.openAt) c.status = "SCHEDULED";
    else if (now > c.closeAt || c.issuedCount >= c.totalStock) c.status = "CLOSED";
    else c.status = "OPEN";
  }
}

export function pushEvent(
  s: Store,
  e: Omit<AppEvent, "id" | "at"> & { at?: number },
) {
  s.events.push({ id: s.eventSeq++, at: e.at ?? Date.now(), ...e });
  if (s.events.length > 400) s.events.splice(0, s.events.length - 400);
}

export function templateSummary(t: CouponTemplate): string {
  return `매월 ${t.nthWeek}주 ${DAY_LABEL[t.dayOfWeek]} ${t.startTime}`;
}

export function nextOccurrence(t: CouponTemplate, from = Date.now()): number {
  const d = new Date(from);
  for (let i = 0; i < 3; i++) {
    const at = nthWeekdayOf(
      d.getFullYear(),
      d.getMonth() + i,
      t.nthWeek,
      t.dayOfWeek,
      t.startTime,
    );
    if (at > from) return at;
  }
  return from;
}

export function statusOf(c: Coupon): CouponStatus {
  const now = Date.now();
  if (now < c.openAt) return "SCHEDULED";
  if (now > c.closeAt || c.issuedCount >= c.totalStock) return "CLOSED";
  return "OPEN";
}

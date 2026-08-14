// 목 API 레이어 — PRD §11.1 경로와 1:1 대응.
// 실제 스프링 서버 연동 시 각 함수 본문만 fetch로 교체하면 됩니다.
import {
  ERROR_COPY,
  isEligible,
  maskUserId,
  type ApiError,
  type Brand,
  type Coupon,
  type CouponTemplate,
  type Grade,
  type Issuance,
  type AppEvent,
} from "./domain";
import {
  getStore,
  nextOccurrence,
  pushEvent,
  refreshStatuses,
  type EngineState,
} from "./mock-store";
import type { Session } from "./auth-storage";

const latency = (ms = 180) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

function fail(status: number, code: string, extra: Partial<ApiError> = {}): never {
  const err: ApiError = {
    status,
    code,
    message: ERROR_COPY[code] ?? "요청을 처리하지 못했습니다.",
    ...extra,
  };
  throw err;
}

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "code" in e && "status" in e;
}

/* ---------- 조회 ---------- */

export interface BrandWithNext extends Brand {
  template: CouponTemplate;
  nextOpenAt: number;
}

export async function getBrands(): Promise<BrandWithNext[]> {
  await latency(120);
  const s = getStore();
  return s.brands.map((b) => {
    const template = s.templates.find((t) => t.brandId === b.brandId)!;
    return { ...b, template, nextOpenAt: nextOccurrence(template) };
  });
}

export interface CouponView extends Coupon {
  brand: Brand;
  remaining: number;
  eligible: boolean;
  alreadyIssued: boolean;
}

function toView(c: Coupon, session: Session | null): CouponView {
  const s = getStore();
  const brand = s.brands.find((b) => b.brandId === c.brandId)!;
  return {
    ...c,
    brand,
    remaining: Math.max(0, c.totalStock - c.issuedCount),
    eligible: session ? isEligible(c.eligibleGradesMask, session.grade) : false,
    alreadyIssued: session
      ? s.issuances.some((i) => i.couponId === c.couponId && i.userId === session.userId)
      : false,
  };
}

export async function getCoupons(session: Session | null): Promise<CouponView[]> {
  await latency(140);
  const s = getStore();
  refreshStatuses(s);
  return s.coupons
    .slice()
    .sort((a, b) => {
      const order = { OPEN: 0, SCHEDULED: 1, CLOSED: 2 } as const;
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return a.openAt - b.openAt;
    })
    .map((c) => toView(c, session));
}

export async function getCoupon(couponId: string, session: Session | null): Promise<CouponView> {
  await latency(100);
  const s = getStore();
  refreshStatuses(s);
  const c = s.coupons.find((x) => x.couponId === couponId);
  if (!c) fail(404, "NOT_FOUND");
  return toView(c, session);
}

/* ---------- 입장 · 대기열 · 발급 ---------- */

export interface EntryResult {
  admitted: boolean;
  entryToken?: string;
  queueToken?: string;
  position?: number;
  etaSeconds?: number;
}

interface QueueTicket {
  couponId: string;
  userId: string;
  position: number;
  createdAt: number;
  drainPerSec: number;
}

const queues = new Map<string, QueueTicket>();
const entryTokens = new Map<string, { couponId: string; userId: string; expiresAt: number }>();

export async function postEntry(couponId: string, session: Session | null): Promise<EntryResult> {
  await latency(220);
  if (!session) fail(401, "UNAUTHORIZED");
  const s = getStore();
  refreshStatuses(s);
  const c = s.coupons.find((x) => x.couponId === couponId);
  if (!c) fail(404, "NOT_FOUND");
  if (c.status === "SCHEDULED")
    fail(409, "NOT_OPENED", {
      openAt: c.openAt,
      retryAfterSeconds: Math.ceil((c.openAt - Date.now()) / 1000),
    });
  if (c.status === "CLOSED")
    fail(409, c.issuedCount >= c.totalStock ? "STOCK_EXHAUSTED" : "COUPON_CLOSED");
  if (!isEligible(c.eligibleGradesMask, session.grade))
    fail(403, "GRADE_NOT_ELIGIBLE", {
      requiredGrades: (["WELCOME", "SILVER", "GOLD", "VIP"] as Grade[]).filter((g) =>
        isEligible(c.eligibleGradesMask, g),
      ),
    });
  if (s.issuances.some((i) => i.couponId === couponId && i.userId === session.userId))
    fail(409, "ALREADY_ISSUED");

  const pressure = c.issuedCount / c.totalStock;
  const queued = pressure > 0.25;
  if (!queued) {
    const token = `et_${Math.random().toString(36).slice(2)}`;
    entryTokens.set(token, { couponId, userId: session.userId, expiresAt: Date.now() + 60_000 });
    return { admitted: true, entryToken: token, etaSeconds: 0 };
  }
  const position = 40 + Math.floor(Math.random() * 260 * pressure);
  const drainPerSec = 12 + Math.floor(Math.random() * 20);
  const key = `${couponId}:${session.userId}`;
  queues.set(key, { couponId, userId: session.userId, position, createdAt: Date.now(), drainPerSec });
  return {
    admitted: false,
    queueToken: `qt_${Math.random().toString(36).slice(2)}`,
    position,
    etaSeconds: Math.ceil(position / drainPerSec),
  };
}

export interface QueueStatus {
  position: number;
  etaSeconds: number;
  admitted: boolean;
  entryToken?: string;
}

export async function getQueue(couponId: string, session: Session | null): Promise<QueueStatus> {
  await latency(60);
  if (!session) fail(401, "UNAUTHORIZED");
  const key = `${couponId}:${session.userId}`;
  const t = queues.get(key);
  if (!t) fail(403, "ENTRY_TOKEN_EXPIRED");
  const elapsed = (Date.now() - t.createdAt) / 1000;
  const position = Math.max(0, Math.round(t.position - elapsed * t.drainPerSec));
  if (position <= 0) {
    queues.delete(key);
    const token = `et_${Math.random().toString(36).slice(2)}`;
    entryTokens.set(token, { couponId, userId: session.userId, expiresAt: Date.now() + 60_000 });
    return { position: 0, etaSeconds: 0, admitted: true, entryToken: token };
  }
  return { position, etaSeconds: Math.ceil(position / t.drainPerSec), admitted: false };
}

export interface IssueResult {
  issuanceId: string;
  couponId: string;
  expiresAt: number;
}

export async function postIssue(
  couponId: string,
  entryToken: string | null,
  session: Session | null,
): Promise<IssueResult> {
  await latency(260);
  if (!session) fail(401, "UNAUTHORIZED");
  if (!entryToken) fail(403, "NO_ENTRY_TOKEN");
  const tok = entryTokens.get(entryToken);
  if (!tok || tok.expiresAt < Date.now() || tok.userId !== session.userId)
    fail(403, "ENTRY_TOKEN_EXPIRED");
  entryTokens.delete(entryToken);

  const s = getStore();
  refreshStatuses(s);
  const c = s.coupons.find((x) => x.couponId === couponId);
  if (!c) fail(404, "NOT_FOUND");
  if (c.status !== "OPEN")
    fail(409, c.issuedCount >= c.totalStock ? "STOCK_EXHAUSTED" : "COUPON_CLOSED");
  if (s.issuances.some((i) => i.couponId === couponId && i.userId === session.userId))
    fail(409, "ALREADY_ISSUED");
  if (c.issuedCount >= c.totalStock) fail(409, "STOCK_EXHAUSTED");

  c.issuedCount += 1;
  const issuance: Issuance = {
    issuanceId: `is_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    couponId,
    userId: session.userId,
    maskedUserId: maskUserId(session.userId),
    grade: session.grade,
    status: "ISSUED",
    issuedAt: Date.now(),
    usedAt: null,
    expiresAt: c.closeAt + 30 * 86400_000,
  };
  s.issuances.push(issuance);
  pushEvent(s, {
    type: "ISSUE",
    couponId,
    maskedUserId: issuance.maskedUserId,
    grade: session.grade,
    message: "쿠폰 발급",
  });
  refreshStatuses(s);
  return { issuanceId: issuance.issuanceId, couponId, expiresAt: issuance.expiresAt };
}

/* ---------- 내 쿠폰 ---------- */

export interface IssuanceView extends Issuance {
  coupon: Coupon;
  brand: Brand;
}

export async function getMyIssuances(session: Session | null): Promise<IssuanceView[]> {
  await latency(140);
  if (!session) return [];
  const s = getStore();
  return s.issuances
    .filter((i) => i.userId === session.userId)
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .map((i) => {
      const coupon = s.coupons.find((c) => c.couponId === i.couponId)!;
      return { ...i, coupon, brand: s.brands.find((b) => b.brandId === coupon.brandId)! };
    });
}

const idempotency = new Map<string, IssuanceView | null>();

type IssuanceAction = "use" | "cancel-use" | "cancel";

export async function postIssuanceAction(
  issuanceId: string,
  action: IssuanceAction,
  idempotencyKey: string,
  session: Session | null,
): Promise<{ status: Issuance["status"]; replayed: boolean }> {
  await latency(200);
  if (!session) fail(401, "UNAUTHORIZED");
  const memo = `${idempotencyKey}:${action}:${issuanceId}`;
  if (idempotency.has(memo)) {
    const s = getStore();
    const cur = s.issuances.find((i) => i.issuanceId === issuanceId)!;
    return { status: cur.status, replayed: true };
  }
  const s = getStore();
  const is = s.issuances.find((i) => i.issuanceId === issuanceId && i.userId === session.userId);
  if (!is) fail(404, "NOT_FOUND");
  const coupon = s.coupons.find((c) => c.couponId === is.couponId)!;

  if (action === "use") {
    if (is.status === "EXPIRED") fail(409, "COUPON_EXPIRED");
    if (is.status !== "ISSUED") fail(409, "INVALID_TRANSITION");
    is.status = "USED";
    is.usedAt = Date.now();
    coupon.usedCount += 1;
  } else if (action === "cancel-use") {
    if (is.status !== "USED") fail(409, "INVALID_TRANSITION");
    is.status = "ISSUED";
    is.usedAt = null;
    coupon.usedCount = Math.max(0, coupon.usedCount - 1);
  } else {
    if (is.status !== "ISSUED") fail(409, "INVALID_TRANSITION");
    is.status = "CANCELLED";
    coupon.issuedCount = Math.max(0, coupon.issuedCount - 1); // 재고 복원
  }
  idempotency.set(memo, null);
  pushEvent(s, {
    type: action === "use" ? "USE" : action === "cancel-use" ? "CANCEL_USE" : "CANCEL",
    couponId: is.couponId,
    maskedUserId: is.maskedUserId,
    grade: is.grade,
    message:
      action === "use" ? "쿠폰 사용" : action === "cancel-use" ? "사용 취소(복원)" : "발급 취소",
  });
  refreshStatuses(s);
  return { status: is.status, replayed: false };
}

/* ---------- 관리자 ---------- */

export async function adminListCoupons(): Promise<CouponView[]> {
  await latency(140);
  const s = getStore();
  refreshStatuses(s);
  return s.coupons
    .slice()
    .sort((a, b) => b.openAt - a.openAt)
    .map((c) => toView(c, null));
}

export interface CouponInput {
  brandId: string;
  title: string;
  policyType: Coupon["policyType"];
  policyValue: number;
  policyCap: number | null;
  totalStock: number;
  openAt: number;
  closeAt: number;
  eligibleGradesMask: number;
}

export async function adminCreateCoupon(input: CouponInput): Promise<Coupon> {
  await latency(200);
  const s = getStore();
  const c: Coupon = {
    couponId: `cp_manual_${Date.now().toString(36)}`,
    templateId: null,
    issuedCount: 0,
    usedCount: 0,
    status: "SCHEDULED",
    ...input,
  };
  s.coupons.push(c);
  refreshStatuses(s);
  pushEvent(s, {
    type: "SYSTEM",
    couponId: c.couponId,
    maskedUserId: "admin",
    grade: null,
    message: `쿠폰 생성 — ${c.title}`,
  });
  return c;
}

export async function adminUpdateCoupon(couponId: string, input: CouponInput): Promise<Coupon> {
  await latency(180);
  const s = getStore();
  const c = s.coupons.find((x) => x.couponId === couponId);
  if (!c) fail(404, "NOT_FOUND");
  Object.assign(c, input);
  refreshStatuses(s);
  return c;
}

export async function adminDeleteCoupon(couponId: string): Promise<void> {
  await latency(160);
  const s = getStore();
  const idx = s.coupons.findIndex((x) => x.couponId === couponId);
  if (idx < 0) fail(404, "NOT_FOUND");
  s.coupons.splice(idx, 1);
  s.issuances = s.issuances.filter((i) => i.couponId !== couponId);
}

export async function adminCloseCoupon(couponId: string): Promise<void> {
  await latency(150);
  const s = getStore();
  const c = s.coupons.find((x) => x.couponId === couponId);
  if (!c) fail(404, "NOT_FOUND");
  c.closeAt = Date.now() - 1000;
  c.status = "CLOSED";
  pushEvent(s, {
    type: "SYSTEM",
    couponId,
    maskedUserId: "admin",
    grade: null,
    message: "운영자 수동 마감",
  });
}

export async function adminListBrands(): Promise<Brand[]> {
  await latency(120);
  return getStore().brands.slice();
}

export async function adminSaveBrand(brand: Brand, isNew: boolean): Promise<Brand> {
  await latency(160);
  const s = getStore();
  if (isNew) {
    const created = { ...brand, brandId: `b_${Date.now().toString(36)}` };
    s.brands.push(created);
    return created;
  }
  const idx = s.brands.findIndex((b) => b.brandId === brand.brandId);
  if (idx < 0) fail(404, "NOT_FOUND");
  s.brands[idx] = brand;
  return brand;
}

export async function adminDeleteBrand(brandId: string): Promise<void> {
  await latency(150);
  const s = getStore();
  s.brands = s.brands.filter((b) => b.brandId !== brandId);
  s.templates = s.templates.filter((t) => t.brandId !== brandId);
  s.coupons = s.coupons.filter((c) => c.brandId !== brandId);
}

export async function adminListTemplates(): Promise<(CouponTemplate & { brand: Brand; nextOpenAt: number })[]> {
  await latency(130);
  const s = getStore();
  return s.templates.map((t) => ({
    ...t,
    brand: s.brands.find((b) => b.brandId === t.brandId)!,
    nextOpenAt: nextOccurrence(t),
  }));
}

export async function adminSaveTemplate(tpl: CouponTemplate, isNew: boolean): Promise<CouponTemplate> {
  await latency(170);
  const s = getStore();
  if (isNew) {
    const created = { ...tpl, templateId: `tpl_${Date.now().toString(36)}` };
    s.templates.push(created);
    return created;
  }
  const idx = s.templates.findIndex((t) => t.templateId === tpl.templateId);
  if (idx < 0) fail(404, "NOT_FOUND");
  s.templates[idx] = tpl;
  return tpl;
}

export async function adminDeleteTemplate(templateId: string): Promise<void> {
  await latency(140);
  const s = getStore();
  s.templates = s.templates.filter((t) => t.templateId !== templateId);
}

/** 최신 이벤트 스트림 (발급/상태전이 공통) */
export async function adminRecentEvents(limit = 40): Promise<AppEvent[]> {
  const s = getStore();
  return s.events.slice().sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function adminEvents(sinceId: number): Promise<AppEvent[]> {
  const s = getStore();
  return s.events.filter((e) => e.id > sinceId).slice(-50);
}

export async function adminRecentIssuances(limit = 12, query = ""): Promise<IssuanceView[]> {
  const s = getStore();
  const q = query.trim().toLowerCase();
  return s.issuances
    .slice()
    .filter((i) => !q || i.userId.toLowerCase().includes(q) || i.maskedUserId.toLowerCase().includes(q))
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .slice(0, limit)
    .map((i) => {
      const coupon = s.coupons.find((c) => c.couponId === i.couponId)!;
      return { ...i, coupon, brand: s.brands.find((b) => b.brandId === coupon.brandId)! };
    });
}

export function getEngine(): EngineState {
  return getStore().engine;
}

export function setEngineVersion(v: EngineState["version"]) {
  getStore().engine.version = v;
}

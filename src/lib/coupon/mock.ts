/**
 * 고객 쿠폰 API 목 어댑터.
 *
 * VITE_API_BASE_URL 이 없을 때 붙습니다. 실서버와 같은 계약을 지킵니다 —
 * 같은 필드명, 같은 열거값, 같은 에러 코드, 같은 봉투.
 *
 * 회차·재고·발급 이력은 이 파일이 아니라 demo-world 가 들고 있습니다.
 * 관리자 관제 목이 같은 세계를 읽어야 두 화면의 숫자가 맞습니다.
 */
import {
  DAY,
  appendIssuance,
  applyExpiry,
  addTemplate,
  findIssuance,
  findRoundState,
  findTemplate,
  listMonthOccurrences,
  listRoundStates,
  listTemplates,
  loadStore,
  makeCode,
  mulberry32,
  putTemplate,
  remainingOf,
  saveStore,
  seedMember,
} from "@/lib/demo-world";
import { CouponApiError } from "./errors";
import { newIdempotencyKey, type CouponApi, type MemberContext } from "./contract";
import {
  calcDiscount,
  type CouponRoundStatus,
  type CouponTemplateDetail,
  type CouponTemplateWriteRequest,
  type IssuanceStatus,
  type MemberCoupon,
  type Page,
  type QueuePlace,
  gradesToMask,
  DAYS_OF_WEEK,
  type CalendarEntry,
} from "./types";

/* ── 에러 카탈로그 (백엔드 enum 과 동일) ────────────── */

const CATALOG: Record<string, { status: number; message: string }> = {
  "COUPON-101": { status: 400, message: "쿠폰 템플릿 값이 올바르지 않습니다." },
  "COUPON-102": { status: 404, message: "쿠폰 템플릿을 찾을 수 없습니다." },
  "COUPON-301": { status: 404, message: "쿠폰 회차를 찾을 수 없습니다." },
  "COUPON-302": { status: 409, message: "아직 쿠폰 발급이 시작되지 않았습니다." },
  "COUPON-303": { status: 409, message: "쿠폰 발급이 마감되었습니다." },
  "COUPON-304": { status: 403, message: "쿠폰 발급 대상 등급이 아닙니다." },
  "COUPON-305": { status: 409, message: "이미 발급받은 쿠폰입니다." },
  "COUPON-306": { status: 409, message: "쿠폰 재고가 모두 소진되었습니다." },
  "COUPON-310": { status: 409, message: "허용되지 않은 쿠폰 상태 전이입니다." },
  "COUPON-401": { status: 404, message: "발급된 쿠폰을 찾을 수 없습니다." },
  "COUPON-402": { status: 403, message: "본인 소유의 쿠폰만 사용할 수 있습니다." },
  "COUPON-403": { status: 409, message: "만료된 쿠폰은 사용할 수 없습니다." },
  "COUPON-404": { status: 422, message: "멱등키가 다른 요청에 이미 사용되었습니다." },
  "COUPON-409": { status: 409, message: "취소할 쿠폰 사용 내역을 찾을 수 없습니다." },
  "COMMON-002": { status: 404, message: "요청한 리소스를 찾을 수 없습니다." },
};

function reject(code: string): never {
  const entry = CATALOG[code] ?? { status: 500, message: "일시적인 오류가 발생했습니다." };
  throw new CouponApiError({
    status: entry.status,
    code,
    message: entry.message,
    requestId: newIdempotencyKey().slice(0, 8),
    timestamp: new Date().toISOString(),
  });
}

/* ── 대기열 (PRD §입장과 발급의 분리) ─────────────────
   대기열은 발급을 줄 세우지 않고 페이지 입장을 통제합니다.
   순번은 시간에 따라 줄고, 뒤에 선 사람은 앞사람보다 천천히 줄어듭니다. */

interface QueueTicket {
  startedAt: number;
  admitAt: number;
  /** 줄에 설 때의 내 순번 = 그 시점의 대기 인원 */
  startPosition: number;
  /** 초당 입장 처리 인원 — 내 앞이 줄어드는 속도 */
  admitPerSecond: number;
  /** 초당 새로 줄에 서는 인원 — 내 뒤가 늘어나는 속도 */
  arrivalPerSecond: number;
  entryToken: string;
}

const queues = new Map<string, QueueTicket>();
const entryTokens = new Map<
  string,
  { couponRoundId: number; memberId: number; expiresAt: number }
>();

function queueKey(couponRoundId: number, memberId: number) {
  return `${couponRoundId}:${memberId}`;
}

/**
 * 지금 내 자리.
 *
 * 내 앞은 입장 처리 속도만큼 줄고, 내 뒤는 새로 들어오는 속도만큼 늡니다.
 * 입장이 유입보다 빠른 회차에서는 전체 대기 인원이 조금씩 짧아집니다.
 */
function placeOf(ticket: QueueTicket, now: number): QueuePlace {
  const elapsed = Math.max(0, (now - ticket.startedAt) / 1000);
  const position = Math.max(1, Math.round(ticket.startPosition - ticket.admitPerSecond * elapsed));
  const behind = Math.round(ticket.arrivalPerSecond * elapsed);
  return {
    position,
    behind,
    totalWaiting: position + behind,
    etaSeconds: Math.max(1, Math.ceil((ticket.admitAt - now) / 1000)),
  };
}

/* ── 지연 ───────────────────────────────────────────── */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paginate<T>(rows: T[], page: number, size: number): Page<T> {
  const start = page * size;
  return {
    content: rows.slice(start, start + size),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / size)),
  };
}

/* ── 어댑터 ─────────────────────────────────────────── */

export function createMockApi(): CouponApi {
  const idempotency = new Map<string, unknown>();

  function requireRound(couponRoundId: number, now: number) {
    const state = findRoundState(couponRoundId, now);
    if (!state) reject("COUPON-301");
    return state;
  }

  function replay<T>(key: string, run: () => T): T {
    if (idempotency.has(key)) return idempotency.get(key) as T;
    const result = run();
    idempotency.set(key, result);
    return result;
  }

  return {
    async listBrandDays() {
      await wait(110);
      const order = DAYS_OF_WEEK;
      return listTemplates()
        .filter((t) => t.active)
        .map((t) => ({
          templateId: t.id,
          brandId: t.brandId,
          name: t.name,
          nthWeek: t.nthWeek,
          dayOfWeek: t.dayOfWeek,
          startTime: t.startTime,
          durationHours: t.durationHours,
          eligibleGradesMask: t.eligibleGradesMask,
          eligibleGrades: t.eligibleGrades,
          policyType: t.policyType,
          discountRate: t.discountRate,
          maxDiscountAmount: t.maxDiscountAmount,
          discountAmount: t.discountAmount,
          dataGrantMb: t.dataGrantMb,
        }))
        .sort(
          (a, b) =>
            a.nthWeek - b.nthWeek ||
            order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek) ||
            a.startTime.localeCompare(b.startTime),
        );
    },

    async listCalendar(from: string, to: string) {
      await wait(120);
      const now = Date.now();
      applyExpiry(now);

      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59`);
      const out: CalendarEntry[] = [];

      // 기간이 걸친 달을 하나씩 훑습니다. 한 달치씩 계산해야 "N번째 X요일" 규칙이 성립합니다.
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur.getTime() <= end.getTime()) {
        for (const o of listMonthOccurrences(cur.getFullYear(), cur.getMonth(), now)) {
          if (o.openAt < start.getTime() || o.openAt > end.getTime()) continue;
          out.push({
            templateId: o.templateId,
            brandId: o.brandId,
            name: o.name,
            policyType: o.policyType,
            discountRate: o.discountRate,
            maxDiscountAmount: o.maxDiscountAmount,
            discountAmount: o.discountAmount,
            dataGrantMb: o.dataGrantMb,
            eligibleGradesMask: o.eligibleGradesMask,
            eligibleGrades: o.eligibleGrades,
            openAt: new Date(o.openAt).toISOString(),
            closeAt: new Date(o.closeAt).toISOString(),
            status: o.status,
            couponRoundId: o.round ? o.round.id : null,
            totalQuantity: o.round ? o.round.totalQuantity : null,
            activeCount: o.round ? o.round.activeCount : null,
            queueActive: o.round ? o.round.queueActive : false,
          });
        }
        cur.setMonth(cur.getMonth() + 1);
      }
      return out.sort((a, b) => Date.parse(a.openAt) - Date.parse(b.openAt));
    },

    async listRounds() {
      await wait(120);
      const now = Date.now();
      applyExpiry(now);
      const rank: Record<CouponRoundStatus, number> = { OPEN: 0, SCHEDULED: 1, CLOSED: 2 };
      return listRoundStates(now)
        .map((s) => s.round)
        .sort(
          (a, b) => rank[a.status] - rank[b.status] || Date.parse(a.openAt) - Date.parse(b.openAt),
        );
    },

    async getRound(couponRoundId) {
      await wait(90);
      return requireRound(couponRoundId, Date.now()).round;
    },

    async enterRound(couponRoundId, member) {
      await wait(200);
      const now = Date.now();
      const state = requireRound(couponRoundId, now);
      const round = state.round;

      if (round.status === "SCHEDULED") reject("COUPON-302");
      if (round.status === "CLOSED") {
        reject(round.activeCount >= round.totalQuantity ? "COUPON-306" : "COUPON-303");
      }
      if (!round.eligibleGrades.includes(member.grade)) reject("COUPON-304");
      if (
        loadStore().issuances.some(
          (i) => i.couponRoundId === couponRoundId && i.memberId === member.memberId,
        )
      ) {
        reject("COUPON-305");
      }

      const key = queueKey(couponRoundId, member.memberId);

      // 대기열이 꺼진 회차는 바로 입장시킵니다.
      if (!round.queueActive) {
        const entryToken = newIdempotencyKey();
        entryTokens.set(entryToken, {
          couponRoundId,
          memberId: member.memberId,
          expiresAt: now + 180_000,
        });
        return { admitted: true, entryToken, expiresIn: 180, queueToken: null, place: null };
      }

      // 새로고침으로 다시 들어와도 순번이 밀리지 않도록 기존 티켓을 그대로 돌려줍니다.
      const existing = queues.get(key);
      if (existing) {
        return {
          admitted: false,
          entryToken: null,
          expiresIn: null,
          queueToken: key,
          place: placeOf(existing, now),
        };
      }

      // 지금 줄 서 있는 사람들 뒤에 붙습니다. 관리자 화면의 대기 인원과 같은 수입니다.
      const admitPerSecond = Math.max(0.5, state.admittedPerMinute / 60);
      const startPosition = Math.max(1, state.waiting);
      const ticket: QueueTicket = {
        startedAt: now,
        admitAt: now + Math.round((startPosition / admitPerSecond) * 1000),
        startPosition,
        admitPerSecond,
        arrivalPerSecond: state.demandPerMinute / 60,
        entryToken: newIdempotencyKey(),
      };
      queues.set(key, ticket);
      entryTokens.set(ticket.entryToken, {
        couponRoundId,
        memberId: member.memberId,
        expiresAt: ticket.admitAt + 180_000,
      });

      return {
        admitted: false,
        entryToken: null,
        expiresIn: null,
        queueToken: key,
        place: placeOf(ticket, now),
      };
    },

    async leaveQueue(couponRoundId, member) {
      await wait(80);
      queues.delete(queueKey(couponRoundId, member.memberId));
    },

    async pollQueue(couponRoundId, member, queueToken) {
      await wait(140);
      const now = Date.now();
      const ticket = queues.get(queueToken);
      if (!ticket) reject("COMMON-002");

      if (now >= ticket.admitAt) {
        queues.delete(queueToken);
        return { status: "ADMITTED", place: null, entryToken: ticket.entryToken };
      }
      return { status: "WAITING", place: placeOf(ticket, now), entryToken: null };
    },

    async issue(couponRoundId, member) {
      await wait(320);
      const now = Date.now();
      const round = requireRound(couponRoundId, now).round;

      if (round.status === "SCHEDULED") reject("COUPON-302");
      if (!round.eligibleGrades.includes(member.grade)) reject("COUPON-304");
      if (
        loadStore().issuances.some(
          (i) => i.couponRoundId === couponRoundId && i.memberId === member.memberId,
        )
      ) {
        reject("COUPON-305");
      }
      if (remainingOf(round) <= 0) reject("COUPON-306");
      if (round.status === "CLOSED") reject("COUPON-303");

      const rand = mulberry32(now ^ (member.memberId * 31));
      const record = appendIssuance({
        couponRoundId,
        memberId: member.memberId,
        code: makeCode(rand),
        issuedGrade: member.grade,
        status: "ISSUED",
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + round.validDays * DAY).toISOString(),
        usedAt: null,
        orderId: null,
        discountAmount: null,
        usages: [],
        canceledAt: null,
      });

      return {
        issuanceId: record.issuanceId,
        couponRoundId,
        code: record.code,
        status: record.status,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
      };
    },

    async listMyCoupons(member, params = {}) {
      await wait(150);
      const now = Date.now();
      seedMember(member.memberId, member.grade, now);
      applyExpiry(now);

      const byRound = new Map(listRoundStates(now).map((s) => [s.round.id, s.round]));
      const rows: MemberCoupon[] = loadStore()
        .issuances.filter((i) => i.memberId === member.memberId)
        .filter((i) => !params.status || i.status === params.status)
        .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))
        .map((i) => {
          const r = byRound.get(i.couponRoundId);
          return {
            issuanceId: i.issuanceId,
            couponRoundId: i.couponRoundId,
            code: i.code,
            status: i.status,
            name: r?.name ?? "지난 브랜드 데이",
            policyType: r?.policyType ?? "FIXED_AMOUNT",
            discountRate: r?.discountRate ?? null,
            maxDiscountAmount: r?.maxDiscountAmount ?? null,
            discountAmount: r?.discountAmount ?? null,
            dataGrantMb: r?.dataGrantMb ?? null,
            minOrderAmount: r?.minOrderAmount ?? null,
            issuedAt: i.issuedAt,
            expiresAt: i.expiresAt,
            usedAt: i.usedAt,
            usedDiscountAmount: i.discountAmount,
            orderId: i.orderId,
          };
        });

      return paginate(rows, params.page ?? 0, params.size ?? 20);
    },

    async useCoupon(issuanceId, member, body, idempotencyKey) {
      await wait(260);
      const now = Date.now();
      const target = findIssuance(issuanceId);
      if (!target) reject("COUPON-401");
      if (target.memberId !== member.memberId) reject("COUPON-402");
      if (Date.parse(target.expiresAt) <= now) reject("COUPON-403");

      return replay(`use:${idempotencyKey}`, () => {
        if (target.status !== "ISSUED") reject("COUPON-310");
        const state = findRoundState(target.couponRoundId, now);
        const discountAmount = state ? calcDiscount(state.round, body.orderAmount) : 0;

        target.status = "USED";
        target.usedAt = new Date(now).toISOString();
        target.orderId = body.orderId;
        target.discountAmount = discountAmount;
        target.usages.push({
          orderId: body.orderId,
          discountAmount,
          usedAt: target.usedAt,
          canceledAt: null,
        });
        saveStore();

        return {
          issuanceId,
          status: "USED" as IssuanceStatus,
          orderId: body.orderId,
          discountAmount,
          usedAt: target.usedAt,
        };
      });
    },

    async cancelUse(issuanceId, member, idempotencyKey) {
      await wait(240);
      const now = Date.now();
      const target = findIssuance(issuanceId);
      if (!target) reject("COUPON-401");
      if (target.memberId !== member.memberId) reject("COUPON-402");

      return replay(`cancel-use:${idempotencyKey}`, () => {
        if (target.status !== "USED") reject("COUPON-409");
        const orderId = target.orderId ?? 0;
        const discountAmount = target.discountAmount ?? 0;

        // 살아 있는 사용 한 건에 취소 시각을 찍습니다. 이력에는 그대로 남습니다.
        const open = [...target.usages].reverse().find((u) => u.canceledAt === null);
        if (open) open.canceledAt = new Date(now).toISOString();

        target.status = "ISSUED";
        target.usedAt = null;
        target.orderId = null;
        target.discountAmount = null;
        saveStore();

        return {
          issuanceId,
          status: "ISSUED" as IssuanceStatus,
          orderId,
          discountAmount,
          canceledAt: new Date(now).toISOString(),
        };
      });
    },

    async cancelIssue(issuanceId, member, idempotencyKey) {
      await wait(240);
      const now = Date.now();
      const target = findIssuance(issuanceId);
      if (!target) reject("COUPON-401");
      if (target.memberId !== member.memberId) reject("COUPON-402");

      return replay(`cancel:${idempotencyKey}`, () => {
        if (target.status !== "ISSUED") reject("COUPON-310");
        target.status = "CANCELLED";
        target.canceledAt = new Date(now).toISOString();
        saveStore();
        return {
          issuanceId,
          status: "CANCELLED" as IssuanceStatus,
          canceledAt: new Date(now).toISOString(),
        };
      });
    },

    async listTemplates(params = {}) {
      await wait(130);
      return paginate(listTemplates().slice(), params.page ?? 0, params.size ?? 20);
    },

    async getTemplate(couponTemplateId) {
      await wait(90);
      const hit = findTemplate(couponTemplateId);
      if (!hit) reject("COUPON-102");
      return hit;
    },

    async createTemplate(request: CouponTemplateWriteRequest) {
      await wait(220);
      return addTemplate({ ...request, eligibleGradesMask: gradesToMask(request.eligibleGrades) });
    },

    async updateTemplate(couponTemplateId, request) {
      await wait(220);
      const current = findTemplate(couponTemplateId);
      if (!current) reject("COUPON-102");
      return putTemplate({
        id: couponTemplateId,
        active: current.active,
        ...request,
        eligibleGradesMask: gradesToMask(request.eligibleGrades),
      });
    },

    async changeTemplateActivation(couponTemplateId, active) {
      await wait(160);
      const current = findTemplate(couponTemplateId);
      if (!current) reject("COUPON-102");
      const updated: CouponTemplateDetail = { ...current, active };
      return putTemplate(updated);
    },
  };
}

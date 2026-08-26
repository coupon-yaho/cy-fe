/**
 * 실서버 어댑터.
 *
 * VITE_API_BASE_URL 이 있으면 이 어댑터가 붙습니다. 모든 응답은
 * ResponseEnvelope<T> 로 감싸져 오므로 여기서 한 번만 벗깁니다.
 *
 * 헤더 규약 (api/.../MemberRequestHeaders · CouponRequestHeaders · AdminRequestHeaders)
 *   X-Member-Id        회원 식별자 (Long, 양수)
 *   X-Membership-Grade WELCOME | SILVER | GOLD | VIP
 *   X-User-Role        ADMIN — /api/v1/admin/** 전체에 AdminRoleInterceptor 가 검사
 *   Idempotency-Key    사용 · 사용취소 · 발급취소
 */
import { CouponApiError } from "./errors";
import type { CouponApi, MemberContext } from "./contract";
import { gradesToMask } from "./types";
import type {
  BrandDay,
  CalendarEntry,
  CouponCancelResponse,
  CouponCancelUseResponse,
  CouponIssueResponse,
  CouponRoundReservation,
  CouponRoundReservationRequest,
  CouponRoundView,
  CouponTemplateDetail,
  CouponTemplateWriteRequest,
  CouponUseResponse,
  EntryResponse,
  IssuanceStatus,
  MemberCoupon,
  Page,
  QueueResponse,
  ResponseEnvelope,
} from "./types";

const MEMBER_ID = "X-Member-Id";
const MEMBERSHIP_GRADE = "X-Membership-Grade";
const USER_ROLE = "X-User-Role";
const IDEMPOTENCY_KEY = "Idempotency-Key";

type CouponRoundResponse = Omit<
  CouponRoundView,
  "id" | "dataGrantMb" | "minOrderAmount" | "eligibleGradesMask" | "activeCount" | "queueActive"
> & {
  couponRoundId: number;
  remainingQuantity: number;
};

type CouponTemplateResponse = Omit<
  CouponTemplateDetail,
  "dataGrantMb" | "minOrderAmount" | "eligibleGradesMask"
>;

type MemberCouponResponse = Omit<MemberCoupon, "dataGrantMb" | "minOrderAmount">;

function toCouponRound(response: CouponRoundResponse): CouponRoundView {
  return {
    ...response,
    id: response.couponRoundId,
    dataGrantMb: null,
    minOrderAmount: null,
    eligibleGradesMask: gradesToMask(response.eligibleGrades),
    activeCount: Math.max(0, response.totalQuantity - response.remainingQuantity),
    queueActive: false,
  };
}

function toCouponTemplate(response: CouponTemplateResponse): CouponTemplateDetail {
  return {
    ...response,
    dataGrantMb: null,
    minOrderAmount: null,
    eligibleGradesMask: gradesToMask(response.eligibleGrades),
  };
}

function toMemberCoupon(response: MemberCouponResponse): MemberCoupon {
  return { ...response, dataGrantMb: null, minOrderAmount: null };
}

function templateWriteBody(request: CouponTemplateWriteRequest) {
  const { dataGrantMb: _dataGrantMb, minOrderAmount: _minOrderAmount, ...body } = request;
  return body;
}

function memberHeaders(member: MemberContext): Record<string, string> {
  return {
    [MEMBER_ID]: String(member.memberId),
    [MEMBERSHIP_GRADE]: member.grade,
  };
}

export function createHttpApi(baseUrl: string): CouponApi {
  const root = baseUrl.replace(/\/$/, "");

  async function call<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new CouponApiError({
        status: 0,
        code: "NETWORK",
        message: "서버에 연결하지 못했습니다.",
        requestId: null,
        timestamp: new Date().toISOString(),
      });
    }

    const text = await res.text();
    // 게이트웨이가 502·504 를 HTML 로 돌려주면 여기서 SyntaxError 가 납니다.
    // 그러면 CouponApiError 를 기다리는 화면 분기가 통째로 무력화되므로, 파싱 실패는
    // 응답 없음으로 처리하고 아래 !res.ok 경로가 받게 둡니다.
    let envelope: ResponseEnvelope<T> | null = null;
    if (text) {
      try {
        envelope = JSON.parse(text) as ResponseEnvelope<T>;
      } catch {
        envelope = null;
      }
    }

    if (!res.ok || !envelope?.success) {
      // Retry-After 는 헤더로만 옵니다. 초 단위 형식만 읽습니다(HTTP-date 는 안 씁니다).
      const retryAfter = Number(res.headers.get("Retry-After"));
      throw new CouponApiError(
        envelope?.error ?? {
          status: res.status,
          code: "COMMON-004",
          message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          requestId: res.headers.get("X-Request-Id"),
          timestamp: new Date().toISOString(),
        },
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      );
    }

    return envelope.data as T;
  }

  const admin = { [USER_ROLE]: "ADMIN" };

  return {
    listBrandDays: () => call<BrandDay[]>("/api/v1/brand-days"),

    // 사양서 U2 가 요구한 신규 엔드포인트. 백엔드 미구현이라 붙으면 그대로 동작합니다.
    listCalendar: (from, to) =>
      call<CalendarEntry[]>(
        `/api/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),

    listRounds: async () => {
      const page = await call<Page<CouponRoundResponse>>(
        "/api/v1/coupon-rounds/public?page=0&size=100",
      );
      return page.content.map(toCouponRound);
    },

    getRound: async (id) =>
      toCouponRound(await call<CouponRoundResponse>(`/api/v1/coupon-rounds/${id}`)),

    enterRound: (id, member) =>
      call<EntryResponse>(`/api/v1/coupons/${id}/entry`, {
        method: "POST",
        headers: memberHeaders(member),
      }),

    pollQueue: (id, member, queueToken) =>
      call<QueueResponse>(
        `/api/v1/coupons/${id}/queue?queueToken=${encodeURIComponent(queueToken)}`,
        { headers: memberHeaders(member) },
      ),

    leaveQueue: (id, member) =>
      call<void>(`/api/v1/coupons/${id}/queue`, {
        method: "DELETE",
        headers: memberHeaders(member),
      }),

    issue: (couponRoundId, member, idempotencyKey, entryToken) =>
      call<CouponIssueResponse>(`/api/v1/coupons/${couponRoundId}/issue`, {
        method: "POST",
        headers: {
          ...memberHeaders(member),
          [IDEMPOTENCY_KEY]: idempotencyKey,
          ...(entryToken ? { "Entry-Token": entryToken } : {}),
        },
      }),

    listMyCoupons: (member, params = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      q.set("page", String(params.page ?? 0));
      q.set("size", String(params.size ?? 20));
      return call<Page<MemberCouponResponse>>(`/api/v1/coupons?${q}`, {
        headers: memberHeaders(member),
      }).then((page) => ({ ...page, content: page.content.map(toMemberCoupon) }));
    },

    useCoupon: (issuanceId, member, body, idempotencyKey) =>
      call<CouponUseResponse>(`/api/v1/coupons/${issuanceId}/use`, {
        method: "POST",
        headers: { ...memberHeaders(member), [IDEMPOTENCY_KEY]: idempotencyKey },
        body: JSON.stringify(body),
      }),

    cancelUse: (issuanceId, member, idempotencyKey) =>
      call<CouponCancelUseResponse>(`/api/v1/coupons/${issuanceId}/cancel-use`, {
        method: "POST",
        headers: { ...memberHeaders(member), [IDEMPOTENCY_KEY]: idempotencyKey },
      }),

    cancelIssue: (issuanceId, member, idempotencyKey) =>
      call<CouponCancelResponse>(`/api/v1/coupons/${issuanceId}/cancel`, {
        method: "POST",
        headers: { ...memberHeaders(member), [IDEMPOTENCY_KEY]: idempotencyKey },
      }),

    reserveRound: (couponTemplateId, request: CouponRoundReservationRequest) =>
      call<CouponRoundReservation>(`/api/v1/admin/coupon-templates/${couponTemplateId}/rounds`, {
        method: "POST",
        headers: admin,
        body: JSON.stringify(request),
      }),

    listTemplates: (params = {}) => {
      const q = new URLSearchParams({
        page: String(params.page ?? 0),
        size: String(params.size ?? 20),
      });
      return call<Page<CouponTemplateResponse>>(`/api/v1/admin/coupon-templates?${q}`, {
        headers: admin,
      }).then((page) => ({ ...page, content: page.content.map(toCouponTemplate) }));
    },

    getTemplate: async (id) =>
      toCouponTemplate(
        await call<CouponTemplateResponse>(`/api/v1/admin/coupon-templates/${id}`, {
          headers: admin,
        }),
      ),

    createTemplate: async (request: CouponTemplateWriteRequest) =>
      toCouponTemplate(
        await call<CouponTemplateResponse>("/api/v1/admin/coupon-templates", {
          method: "POST",
          headers: admin,
          body: JSON.stringify(templateWriteBody(request)),
        }),
      ),

    updateTemplate: async (id, request) =>
      toCouponTemplate(
        await call<CouponTemplateResponse>(`/api/v1/admin/coupon-templates/${id}`, {
          method: "PUT",
          headers: admin,
          body: JSON.stringify(templateWriteBody(request)),
        }),
      ),

    changeTemplateActivation: async (id, active) =>
      toCouponTemplate(
        await call<CouponTemplateResponse>(`/api/v1/admin/coupon-templates/${id}/activation`, {
          method: "PATCH",
          headers: admin,
          body: JSON.stringify({ active }),
        }),
      ),
  };
}

export type { IssuanceStatus };

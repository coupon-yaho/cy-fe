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
import type {
  CouponCancelResponse,
  CouponCancelUseResponse,
  CouponIssueResponse,
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
    const envelope = text ? (JSON.parse(text) as ResponseEnvelope<T>) : null;

    if (!res.ok || !envelope?.success) {
      throw new CouponApiError(
        envelope?.error ?? {
          status: res.status,
          code: "COMMON-004",
          message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          requestId: res.headers.get("X-Request-Id"),
          timestamp: new Date().toISOString(),
        },
      );
    }

    return envelope.data as T;
  }

  const admin = { [USER_ROLE]: "ADMIN" };

  return {
    listRounds: () => call<CouponRoundView[]>("/api/v1/coupon-rounds"),

    getRound: (id) => call<CouponRoundView>(`/api/v1/coupon-rounds/${id}`),

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

    issue: (couponRoundId, member, entryToken) =>
      call<CouponIssueResponse>(`/api/v1/coupons/${couponRoundId}/issue`, {
        method: "POST",
        headers: {
          ...memberHeaders(member),
          ...(entryToken ? { "Entry-Token": entryToken } : {}),
        },
      }),

    listMyCoupons: (member, params = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      q.set("page", String(params.page ?? 0));
      q.set("size", String(params.size ?? 20));
      return call<Page<MemberCoupon>>(`/api/v1/coupons?${q}`, {
        headers: memberHeaders(member),
      });
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

    listTemplates: (params = {}) => {
      const q = new URLSearchParams({
        page: String(params.page ?? 0),
        size: String(params.size ?? 20),
      });
      return call<Page<CouponTemplateDetail>>(`/api/v1/admin/coupon-templates?${q}`, {
        headers: admin,
      });
    },

    getTemplate: (id) =>
      call<CouponTemplateDetail>(`/api/v1/admin/coupon-templates/${id}`, { headers: admin }),

    createTemplate: (request: CouponTemplateWriteRequest) =>
      call<CouponTemplateDetail>("/api/v1/admin/coupon-templates", {
        method: "POST",
        headers: admin,
        body: JSON.stringify(request),
      }),

    updateTemplate: (id, request) =>
      call<CouponTemplateDetail>(`/api/v1/admin/coupon-templates/${id}`, {
        method: "PUT",
        headers: admin,
        body: JSON.stringify(request),
      }),

    changeTemplateActivation: (id, active) =>
      call<CouponTemplateDetail>(`/api/v1/admin/coupon-templates/${id}/activation`, {
        method: "PATCH",
        headers: admin,
        body: JSON.stringify({ active }),
      }),
  };
}

export type { IssuanceStatus };

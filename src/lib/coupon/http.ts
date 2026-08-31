/**
 * 실서버 어댑터.
 *
 * 운영 진입점은 항상 이 어댑터를 사용합니다. VITE_API_BASE_URL 이 비어 있으면 같은
 * 출처의 상대 경로로 요청합니다. 모든 응답은 ResponseEnvelope<T> 로 감싸져 오므로
 * 여기서 한 번만 벗깁니다.
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
  CouponRoundStatus,
  CouponTemplateDetail,
  CouponTemplateWriteRequest,
  CouponUseResponse,
  IssueOutcome,
  QueuedResponse,
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

type CouponRoundResponse = Omit<CouponRoundView, "id" | "eligibleGradesMask" | "activeCount"> & {
  couponRoundId: number;
  remainingQuantity: number;
};

type CouponTemplateResponse = Omit<CouponTemplateDetail, "eligibleGradesMask">;

function toCouponRound(response: CouponRoundResponse): CouponRoundView {
  return {
    ...response,
    id: response.couponRoundId,
    eligibleGradesMask: gradesToMask(response.eligibleGrades),
    activeCount: Math.max(0, response.totalQuantity - response.remainingQuantity),
  };
}

function toCouponTemplate(response: CouponTemplateResponse): CouponTemplateDetail {
  return {
    ...response,
    eligibleGradesMask: gradesToMask(response.eligibleGrades),
  };
}

function memberHeaders(member: MemberContext): Record<string, string> {
  return {
    [MEMBER_ID]: String(member.memberId),
    [MEMBERSHIP_GRADE]: member.grade,
  };
}

export function createHttpApi(baseUrl: string): CouponApi {
  const root = baseUrl.replace(/\/$/, "");

  /* 상태 코드까지 돌려주는 판. 발급만 이것이 필요합니다 — 201 과 202 가 둘 다
     성공인데 뜻이 정반대라, 코드를 안 보면 구분할 방법이 없습니다. */
  async function callWithStatus<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<{ status: number; data: T }> {
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

    return { status: res.status, data: envelope.data as T };
  }

  async function call<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    return (await callWithStatus<T>(path, init)).data;
  }

  const admin = { [USER_ROLE]: "ADMIN" };

  const listRoundPage = (
    params: {
      status?: CouponRoundStatus | null;
      eligibleGrade?: MemberContext["grade"] | null;
      page?: number;
      size?: number;
    } = {},
  ) => {
    const q = new URLSearchParams({
      page: String(params.page ?? 0),
      size: String(params.size ?? 20),
    });
    if (params.status) q.set("status", params.status);
    if (params.eligibleGrade) q.set("eligibleGrade", params.eligibleGrade);
    return call<Page<CouponRoundResponse>>(`/api/v1/coupon-rounds/public?${q}`).then((page) => ({
      ...page,
      content: page.content.map(toCouponRound),
    }));
  };

  return {
    listBrandDays: () => call<BrandDay[]>("/api/v1/brand-days"),

    listCalendar: (from, to) =>
      call<CalendarEntry[]>(
        `/api/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),

    listRounds: () => listRoundPage({ size: 100 }).then((page) => page.content),
    listRoundPage,

    getRound: async (id) =>
      toCouponRound(await call<CouponRoundResponse>(`/api/v1/coupon-rounds/${id}`)),

    pollQueue: (id, member, queueToken) =>
      call<QueueResponse>(
        `/api/v1/coupons/${id}/queue?queueToken=${encodeURIComponent(queueToken)}`,
        { headers: memberHeaders(member) },
      ),

    /* 201 과 202 를 갈라야 해서 call() 을 안 씁니다. call() 은 2xx 를 전부 성공으로
       보고 봉투만 벗겨 주는데, 그러면 "쿠폰을 받았다" 와 "줄에 섰다" 가 같은 모양으로
       돌아옵니다 — 대기 응답을 쿠폰으로 읽고 발급 완료 화면을 띄우게 됩니다. */
    issue: async (couponRoundId, member, idempotencyKey, entryToken) => {
      const { status, data } = await callWithStatus<CouponIssueResponse | QueuedResponse>(
        `/api/v1/coupons/${couponRoundId}/issue`,
        {
          method: "POST",
          headers: {
            ...memberHeaders(member),
            [IDEMPOTENCY_KEY]: idempotencyKey,
            ...(entryToken ? { "Entry-Token": entryToken } : {}),
          },
        },
      );

      /* 202 는 게이트웨이가 세워 준 줄입니다. 게이트웨이가 앞에 없으면 cy-be 가
         201 만 주므로 이 갈래는 아예 안 탑니다. */
      if (status === 202) return { kind: "queued", queued: data as QueuedResponse };
      return { kind: "issued", issuance: data as CouponIssueResponse };
    },

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
          body: JSON.stringify(request),
        }),
      ),

    updateTemplate: async (id, request) =>
      toCouponTemplate(
        await call<CouponTemplateResponse>(`/api/v1/admin/coupon-templates/${id}`, {
          method: "PUT",
          headers: admin,
          body: JSON.stringify(request),
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

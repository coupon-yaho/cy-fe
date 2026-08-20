/**
 * 실서버 어댑터.
 *
 * 모든 관리자 요청에 X-User-Role: ADMIN 이 붙습니다 (AdminRoleInterceptor).
 * 응답은 쿠폰 API 와 같은 ResponseEnvelope 로 감싸져 옵니다.
 */
import { CouponApiError } from "@/lib/coupon/errors";
import type { ResponseEnvelope } from "@/lib/coupon/types";
import type { QueueSettings } from "@/lib/runtime-config";
import type { AdminApi } from "./contract";
import type { MetricsWindow } from "./types";

export function createHttpAdminApi(baseUrl: string): AdminApi {
  const root = baseUrl.replace(/\/$/, "");

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "X-User-Role": "ADMIN",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      throw new CouponApiError({
        status: 0,
        code: "NETWORK",
        message: "관제 서버에 연결하지 못했습니다.",
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
          message: "일시적인 오류가 발생했습니다.",
          requestId: res.headers.get("X-Request-Id"),
          timestamp: new Date().toISOString(),
        },
      );
    }
    return envelope.data as T;
  }

  const qs = (params: Record<string, string | number | null | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  return {
    getOverview: (query = {}) =>
      call(
        `/api/v1/admin/overview${qs({ couponId: query.brandId ?? null, filter: query.filter })}`,
      ),

    getCouponMetrics: (couponRoundId: number, window: MetricsWindow) =>
      call(`/api/v1/admin/coupon-metrics${qs({ couponId: couponRoundId, window })}`),

    getEvents: (params) =>
      call(
        `/api/v1/admin/events${qs({
          couponId: params.couponRoundId ?? null,
          since: params.cursor ?? null,
          limit: params.limit ?? 50,
        })}`,
      ),

    getHistories: (params) =>
      call(
        `/api/v1/admin/issuance-histories${qs({
          couponId: params.couponRoundId ?? null,
          cursor: params.cursor ?? null,
          limit: params.limit ?? 50,
        })}`,
      ),

    getMetrics: (window) => call(`/api/v1/admin/metrics${qs({ window })}`),

    getBenchmarks: () => call("/api/v1/admin/benchmarks"),

    getAnalytics: () => call("/api/v1/admin/analytics"),

    inquireMember: (memberId) =>
      call(`/api/v1/admin/members/issuance-inquiries${qs({ memberId })}`),

    getQueueSettings: () => call<QueueSettings>("/api/v1/admin/runtime-config"),

    updateQueueSettings: (input) =>
      call<QueueSettings>("/api/v1/admin/runtime-config", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
  };
}

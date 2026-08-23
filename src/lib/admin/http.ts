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
    } catch (e) {
      // abort 는 오류가 아닙니다 — 화면이 떠난 것뿐이라 그대로 던져 훅이 버리게 합니다.
      if (init.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw e;
      throw new CouponApiError({
        status: 0,
        code: "NETWORK",
        message: "관제 서버에 연결하지 못했습니다.",
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
    getOverview: (query = {}, signal) =>
      call(
        `/api/v1/admin/overview${qs({ couponId: query.brandId ?? null, filter: query.filter })}`,
        { signal: signal ?? null },
      ),

    getCouponMetrics: (couponRoundId: number, window: MetricsWindow, signal) =>
      call(`/api/v1/admin/coupon-metrics${qs({ couponId: couponRoundId, window })}`, {
        signal: signal ?? null,
      }),

    getEvents: (params, signal) =>
      call(
        `/api/v1/admin/events${qs({
          couponId: params.couponRoundId ?? null,
          since: params.cursor ?? null,
          limit: params.limit ?? 50,
        })}`,
        { signal: signal ?? null },
      ),

    getHistories: (params, signal) =>
      call(
        `/api/v1/admin/issuance-histories${qs({
          couponId: params.couponRoundId ?? null,
          cursor: params.cursor ?? null,
          limit: params.limit ?? 50,
        })}`,
        { signal: signal ?? null },
      ),

    getMetrics: (window, signal) =>
      call(`/api/v1/admin/metrics${qs({ window })}`, { signal: signal ?? null }),

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

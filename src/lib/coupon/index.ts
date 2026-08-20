/**
 * 쿠폰 API 진입점.
 *
 *   VITE_API_BASE_URL 있음 → 실서버(cy-be) 어댑터
 *   없음                   → 목 어댑터
 *
 * 화면 코드는 여기서 나가는 `couponApi` 만 씁니다.
 */
import { createHttpApi } from "./http";
import { createMockApi } from "./mock";
import type { CouponApi } from "./contract";

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

export const couponApi: CouponApi = baseUrl ? createHttpApi(baseUrl) : createMockApi();

export * from "./types";
export * from "./errors";
export * from "./brands";
export { newIdempotencyKey } from "./contract";
export type { CouponApi, MemberContext } from "./contract";

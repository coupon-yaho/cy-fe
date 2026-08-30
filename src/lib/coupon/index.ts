/**
 * 쿠폰 API 진입점.
 *
 * <b>목 어댑터는 없습니다.</b> 예전에는 {@code VITE_API_BASE_URL} 이 없으면 목으로
 * 떨어졌는데, 그 갈래가 사라진 뒤에도 주석만 남아 있었습니다 — 실제로는 값이 없으면
 * 빈 문자열이 되어 상대 경로로 나가고, 개발 서버의 {@code /api} 프록시가 받습니다.
 * 그래서 <b>API 서버가 없으면 화면이 502 를 봅니다</b>(조용히 가짜 값을 그리지 않습니다).
 *
 * 화면 코드는 여기서 나가는 `couponApi` 만 씁니다.
 */
import { createHttpApi } from "./http";
import type { CouponApi } from "./contract";

const baseUrl = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

export const couponApi: CouponApi = createHttpApi(baseUrl);

export * from "./types";
export * from "./errors";
export * from "./brands";
export { newIdempotencyKey } from "./contract";
export type { CouponApi, MemberContext } from "./contract";

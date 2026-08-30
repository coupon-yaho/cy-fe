/**
 * 관제 API 진입점.
 *
 * 쿠폰 API 와 같은 규칙입니다 — VITE_API_BASE_URL 이 있으면 실서버, 없으면 목.
 * metrics-live 는 시스템 metrics 만 HTTP 로 보내고 나머지 화면은 프론트 목을 유지합니다.
 * live 는 관리자 API 전체를 HTTP 로 보내며, 값을 비우면 전체가 프론트 목입니다.
 */
import { createHttpAdminApi } from "./http";
import { createMockAdminApi } from "./mock";
import type { AdminApi } from "./contract";

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
const configuredMode = import.meta.env["VITE_ADMIN_API"];

export type AdminApiMode = "mock" | "metrics-live" | "live";

const adminApiMode: AdminApiMode =
  configuredMode === "metrics-live" || configuredMode === "live" ? configuredMode : "mock";

export function createAdminApi(mode: AdminApiMode, httpBaseUrl?: string): AdminApi {
  const mock = createMockAdminApi();
  if (!httpBaseUrl || mode === "mock") return mock;

  const http = createHttpAdminApi(httpBaseUrl);
  if (mode === "live") return http;

  return { ...mock, getMetrics: http.getMetrics };
}

export const adminApi = createAdminApi(adminApiMode, baseUrl);

export const isMockAdmin = adminApiMode !== "live";

export * from "./types";
export type { QueueSettings } from "@/lib/runtime-config";
export { QUEUE_MODE_LABEL, QUEUE_MODE_NOTE } from "@/lib/runtime-config";
export type { AdminApi } from "./contract";

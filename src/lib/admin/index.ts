/** 관리자 API 진입점. 주소가 비어 있으면 같은 출처의 /api 경로를 사용합니다. */
import { createHttpAdminApi } from "./http";
import type { AdminApi } from "./contract";

const baseUrl = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

export function createAdminApi(httpBaseUrl = ""): AdminApi {
  return createHttpAdminApi(httpBaseUrl);
}

export const adminApi = createAdminApi(baseUrl);

export * from "./types";
export type { QueueSettings } from "@/lib/runtime-config";
export { QUEUE_MODE_LABEL, QUEUE_MODE_NOTE } from "@/lib/runtime-config";
export type { AdminApi } from "./contract";

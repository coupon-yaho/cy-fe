/**
 * 관제 API 진입점.
 *
 * 쿠폰 API 와 같은 규칙입니다 — VITE_API_BASE_URL 이 있으면 실서버, 없으면 목.
 * 관제 엔드포인트는 아직 백엔드에 없으므로, 실서버를 붙여도 이 화면들은 404 를 받습니다.
 * 그래서 VITE_ADMIN_API 를 따로 두어 관제만 목으로 남길 수 있게 했습니다.
 */
import { createHttpAdminApi } from "./http";
import { createMockAdminApi } from "./mock";
import type { AdminApi } from "./contract";

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
const useLiveAdmin = import.meta.env["VITE_ADMIN_API"] === "live";

export const adminApi: AdminApi =
  baseUrl && useLiveAdmin ? createHttpAdminApi(baseUrl) : createMockAdminApi();

export const isMockAdmin = !(baseUrl && useLiveAdmin);

export * from "./types";
export type { QueueSettings } from "@/lib/runtime-config";
export { QUEUE_MODE_LABEL, QUEUE_MODE_NOTE } from "@/lib/runtime-config";
export type { AdminApi } from "./contract";

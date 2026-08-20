/**
 * 관리자 관제 API 계약.
 *
 * 화면은 이 인터페이스만 압니다. 실서버 어댑터와 목 어댑터가 같은 계약을 구현합니다.
 * 폴링 주기는 AB 설계도 기준입니다 — overview·coupon-metrics·metrics 는 1초,
 * benchmarks·analytics 는 정적(폴링 없음).
 */
import type { QueueSettings } from "@/lib/runtime-config";
import type {
  AdminAnalyticsResponse,
  AdminBenchmarksResponse,
  AdminMetricsResponse,
  AdminOverviewQuery,
  AdminOverviewResponse,
  CouponMetricsResponse,
  EventSlice,
  HistorySlice,
  MemberInquiryResponse,
  MetricsWindow,
} from "./types";

export interface AdminApi {
  /** GET /api/v1/admin/overview — 1초 */
  getOverview(query?: AdminOverviewQuery): Promise<AdminOverviewResponse>;

  /** GET /api/v1/admin/coupon-metrics — 1초 */
  getCouponMetrics(couponRoundId: number, window: MetricsWindow): Promise<CouponMetricsResponse>;

  /** GET /api/v1/admin/events — 커서. 이벤트 커서와 DB 커서는 분리합니다 */
  getEvents(params: {
    couponRoundId?: number | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<EventSlice>;

  /** GET /api/v1/admin/issuance-histories — 커서 */
  getHistories(params: {
    couponRoundId?: number | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<HistorySlice>;

  /** GET /api/v1/admin/metrics?window=1m|5m|15m — 1초 */
  getMetrics(window: MetricsWindow): Promise<AdminMetricsResponse>;

  /** GET /api/v1/admin/benchmarks — 정적 */
  getBenchmarks(): Promise<AdminBenchmarksResponse>;

  /** GET /api/v1/admin/analytics — 정적 */
  getAnalytics(): Promise<AdminAnalyticsResponse>;

  /** GET /api/v1/admin/members/issuance-inquiries — 회원 ID 정확 일치만 */
  inquireMember(memberId: number): Promise<MemberInquiryResponse>;

  /** GET /api/v1/admin/runtime-config — 대기열 운영 설정 */
  getQueueSettings(): Promise<QueueSettings>;
  /** PUT /api/v1/admin/runtime-config — 리비전이 어긋나면 409 */
  updateQueueSettings(input: {
    mode: QueueSettings["mode"];
    adaptiveThresholdPerMinute: number;
    expectedRevision: number;
  }): Promise<QueueSettings>;
}

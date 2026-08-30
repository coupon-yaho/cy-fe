/**
 * 실서버 어댑터.
 *
 * 모든 관리자 요청에 X-User-Role: ADMIN 이 붙습니다 (AdminRoleInterceptor).
 * 응답은 쿠폰 API 와 같은 ResponseEnvelope 로 감싸져 옵니다.
 */
import { CouponApiError } from "@/lib/coupon/errors";
import type { ResponseEnvelope } from "@/lib/coupon/types";
import { readSession } from "@/lib/auth-storage";
import type { QueueSettings } from "@/lib/runtime-config";
import type { AdminApi } from "./contract";
import type {
  AdminMetricsResponse,
  EventSlice,
  HistorySlice,
  LiveAdminOverviewResponse,
  LiveBenchmarkListResponse,
  LiveCouponMetricsResponse,
  LatencyGroupStat,
  MetricsWindow,
  Percentiles,
  SourceValue,
  UriGroup,
} from "./types";

type BackendEventSlice = {
  items: {
    eventId: string;
    eventType: string;
    memberId: number;
    couponId: number;
    issuanceCodeMasked?: string | null;
    grade?: string | null;
    httpStatus?: number | null;
    reasonCode?: string | null;
    queuePosition?: number | null;
    occurredAt: string;
  }[];
  nextCursor?: string | null;
  hasMore: boolean;
  cursorReset: boolean;
  eventsMayBeMissing: boolean;
};

type BackendHistorySlice = {
  items: {
    issuanceId: number;
    issuanceCodeMasked: string;
    couponId: number;
    fromStatus?: string | null;
    toStatus: string;
    eventType: string;
    occurredAt: string;
  }[];
  nextBeforeCursor?: string | null;
  hasOlder: boolean;
};

function responseMeta(snapshotAt: string) {
  return {
    schemaVersion: 1 as const,
    snapshotAt,
    windowStart: snapshotAt,
    windowEnd: snapshotAt,
    collectionDurationMs: 0,
    sources: {},
  };
}

function normalizeEvents(response: BackendEventSlice, couponId?: number | null): EventSlice {
  const items =
    couponId == null ? response.items : response.items.filter((item) => item.couponId === couponId);
  const snapshotAt = items[0]?.occurredAt ?? new Date().toISOString();
  return {
    meta: responseMeta(snapshotAt),
    events: items.map((item) => ({
      eventId: item.eventId,
      occurredAt: item.occurredAt,
      memberId: item.memberId,
      couponRoundId: item.couponId,
      campaign: `회차 #${item.couponId}`,
      code: item.issuanceCodeMasked ?? null,
      httpStatus: item.httpStatus ?? 0,
      reasonCode: item.reasonCode ?? item.eventType,
      grade: item.grade ?? "—",
      queuePosition: item.queuePosition ?? null,
    })),
    nextCursor: response.nextCursor ?? null,
    droppedCount: Math.max(0, response.items.length - items.length),
    sampled: response.eventsMayBeMissing || response.cursorReset,
  };
}

function normalizeHistories(response: BackendHistorySlice): HistorySlice {
  const snapshotAt = response.items[0]?.occurredAt ?? new Date().toISOString();
  return {
    meta: responseMeta(snapshotAt),
    histories: response.items.map((item) => ({
      id: `${item.issuanceId}-${item.occurredAt}-${item.eventType}`,
      occurredAt: item.occurredAt,
      code: item.issuanceCodeMasked,
      from: item.fromStatus ?? "없음",
      to: item.toStatus,
      note: item.eventType,
    })),
    nextCursor: response.nextBeforeCursor ?? null,
    droppedCount: 0,
  };
}

const URI_GROUP_BY_BACKEND = {
  issue: "ISSUE",
  entry: "ENTRY",
  queue: "QUEUE_POLL",
  read: "LOOKUP",
  use: "TRANSITION",
} as const satisfies Record<string, UriGroup>;

type BackendLatencyGroup = {
  group: keyof typeof URI_GROUP_BY_BACKEND;
  percentiles: SourceValue<Percentiles>;
};

type BackendMetricsResponse = Omit<AdminMetricsResponse, "latency"> & {
  latency: Omit<AdminMetricsResponse["latency"], "groups"> & {
    groups?: BackendLatencyGroup[];
  };
};

type BackendMetricsSeriesResponse = {
  series: {
    key: string;
    labels: Record<string, string>;
    state: string;
    points: { at: string; value: number | null }[];
  }[];
  markers?: { at: string; label: string }[];
};

type BackendAnalyticsResponse = {
  range: { from: string; to: string };
  brands: { brandId: number; brandName: string }[];
  brandTrends: SourceValue<{ periodStart: string; brandId: number; issueCount: number }[]>;
  hourlyHeatmap: SourceValue<{ dayOfWeek: number; hour: number; issueCount: number }[]>;
  issuanceStatusDistribution: SourceValue<{
    totalIssued: number;
    currentlyIssued: number;
    statuses: { status: string; count: number; ratio: number }[];
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  ISSUED: "발급",
  USED: "사용",
  CANCELLED: "취소",
  EXPIRED: "만료",
};

function normalizeAnalytics(response: BackendAnalyticsResponse) {
  const trend = response.brandTrends.value ?? [];
  const months = [...new Set(trend.map((point) => point.periodStart.slice(0, 7)))].sort();
  const heatmap = response.hourlyHeatmap.value ?? [];
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  let peak = { day: 0, hour: 0, value: 0 };
  for (const cell of heatmap) {
    const day = cell.dayOfWeek - 1;
    if (day < 0 || day >= 7 || cell.hour < 0 || cell.hour >= 24) continue;
    grid[day]![cell.hour] = cell.issueCount;
    if (cell.issueCount > peak.value) peak = { day, hour: cell.hour, value: cell.issueCount };
  }
  const observedAt = [
    response.brandTrends.observedAt,
    response.hourlyHeatmap.observedAt,
    response.issuanceStatusDistribution.observedAt,
  ]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);

  return {
    meta: responseMeta(observedAt ?? `${response.range.to}T00:00:00Z`),
    asOf: response.range.to,
    brandTrend: {
      months,
      series: response.brands.map((brand) => ({
        brandId: brand.brandId,
        name: brand.brandName,
        values: months.map(
          (month) =>
            trend.find(
              (point) => point.brandId === brand.brandId && point.periodStart.startsWith(month),
            )?.issueCount ?? 0,
        ),
      })),
    },
    heatmap: { hours, grid, peak },
    funnel: (response.issuanceStatusDistribution.value?.statuses ?? []).map((status) => ({
      stage: status.status,
      label: STATUS_LABEL[status.status] ?? status.status,
      count: status.count,
      ratio: status.ratio,
    })),
    sourceStates: {
      brandTrend: response.brandTrends.state,
      heatmap: response.hourlyHeatmap.state,
      funnel: response.issuanceStatusDistribution.state,
    },
  };
}

function seriesPoints(response: BackendMetricsSeriesResponse, key: string, valueKey: string) {
  return response.series
    .filter((entry) => entry.key === key)
    .flatMap((entry) =>
      entry.points
        .filter((point): point is { at: string; value: number } => point.value !== null)
        .map((point) => ({ t: Date.parse(point.at), [valueKey]: point.value })),
    )
    .sort((left, right) => left.t - right.t);
}

function percentile(source: SourceValue<Percentiles>, key: keyof Percentiles): SourceValue<number> {
  return {
    state: source.state,
    ...(source.value ? { value: source.value[key] } : {}),
    ...(source.observedAt ? { observedAt: source.observedAt } : {}),
  };
}

function normalizeMetrics(
  response: BackendMetricsResponse,
  seriesResponse: BackendMetricsSeriesResponse,
): AdminMetricsResponse {
  const { groups, ...latency } = response.latency;
  const throughput = seriesPoints(seriesResponse, "THROUGHPUT", "issueAttemptRps");
  const inFlight = seriesPoints(seriesResponse, "IN_FLIGHT", "global");
  const admission = seriesPoints(seriesResponse, "QUEUE_ADMISSION", "waiting");
  const persistence = seriesPoints(seriesResponse, "QUEUE_PERSISTENCE", "lag");
  const successLatency = seriesPoints(seriesResponse, "LATENCY_P99", "p99Millis");
  const saturation = response.saturation
    ? {
        ...response.saturation,
        inFlight: { ...response.saturation.inFlight, series: inFlight },
        queues: response.saturation.queues.map((queue) =>
          queue.zone === "Admission"
            ? { ...queue, series: admission }
            : queue.zone === "Persistence"
              ? { ...queue, series: persistence }
              : queue,
        ),
      }
    : response.saturation;
  return {
    ...response,
    traffic: {
      ...response.traffic,
      series: throughput,
      ...(seriesResponse.markers
        ? {
            markers: seriesResponse.markers.map((marker) => ({
              t: Date.parse(marker.at),
              label: marker.label,
            })),
          }
        : {}),
    },
    ...(saturation ? { saturation } : {}),
    latency: {
      ...latency,
      successSeries: successLatency,
      ...(groups
        ? {
            groups: groups.map(({ group, percentiles }): LatencyGroupStat => ({
              group: URI_GROUP_BY_BACKEND[group],
              p50: percentile(percentiles, "p50Millis"),
              p95: percentile(percentiles, "p95Millis"),
              p99: percentile(percentiles, "p99Millis"),
              series: [],
            })),
          }
        : {}),
    },
  };
}

export function createHttpAdminApi(baseUrl: string): AdminApi {
  const root = baseUrl.replace(/\/$/, "");

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    const session = readSession();
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "X-User-Role": "ADMIN",
          /*
           * <b>회원 식별 헤더는 {@code X-Member-Id} 하나다.</b> 관리자 경로가 예전에
           * {@code X-User-Id} 를 읽던 시절에는 배포 순서를 맞추지 않으려고 두 이름을
           * 같이 보냈는데, CY-790 으로 관리자·쿠폰 경로가 모두 {@code X-Member-Id} 로
           * 통일되면서 옛 이름은 지웠다.
           */
          ...(session
            ? {
                "X-Member-Id": String(session.memberId),
              }
            : {}),
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
    getOverview: (_query = {}, signal) =>
      call<LiveAdminOverviewResponse>("/api/v1/admin/overview", { signal: signal ?? null }),

    getCouponMetrics: (couponRoundId: number, window: MetricsWindow, signal) =>
      call<LiveCouponMetricsResponse>(
        `/api/v1/admin/coupon-metrics${qs({ couponId: couponRoundId, window })}`,
        { signal: signal ?? null },
      ),

    getEvents: async (params, signal) =>
      normalizeEvents(
        await call<BackendEventSlice>(
          `/api/v1/admin/events${qs({
            afterCursor: params.cursor ?? null,
            limit: params.limit ?? 50,
          })}`,
          { signal: signal ?? null },
        ),
        params.couponRoundId,
      ),

    getHistories: async (params, signal) =>
      normalizeHistories(
        await call<BackendHistorySlice>(
          `/api/v1/admin/issuance-histories${qs({
            couponId: params.couponRoundId ?? null,
            beforeCursor: params.cursor ?? null,
            limit: params.limit ?? 50,
          })}`,
          { signal: signal ?? null },
        ),
      ),

    getMetrics: async (window, signal) => {
      const snapshot = await call<BackendMetricsResponse>(
        `/api/v1/admin/metrics${qs({ window })}`,
        { signal: signal ?? null },
      );
      const series = await call<BackendMetricsSeriesResponse>(
        `/api/v1/admin/metrics/series${qs({ window })}`,
        { signal: signal ?? null },
      );
      return normalizeMetrics(snapshot, series);
    },

    getBenchmarks: () => call<LiveBenchmarkListResponse>("/api/v1/admin/benchmarks"),

    getAnalytics: async ({ from, to }) =>
      normalizeAnalytics(
        await call<BackendAnalyticsResponse>(`/api/v1/admin/analytics${qs({ from, to })}`),
      ),

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

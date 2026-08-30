import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { after, before, test } from "node:test";
import { createServer as createViteServer } from "vite";

let httpServer;
let viteServer;
let createAdminApi;
let createHttpAdminApi;
let createHttpApi;
let baseUrl;
let requestedUrl;
let requestedUrls;
let requestedHeaders;
let failMetricsSeries = false;

before(async () => {
  httpServer = createHttpServer((request, response) => {
    requestedUrl = request.url;
    requestedUrls ??= [];
    requestedUrls.push(request.url);
    requestedHeaders = request.headers;
    if (failMetricsSeries && request.url?.startsWith("/api/v1/admin/metrics/series")) {
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          success: false,
          data: null,
          error: {
            status: 503,
            code: "ADMIN-METRICS-SERIES-UNAVAILABLE",
            message: "시계열 집계 원천을 사용할 수 없습니다.",
            requestId: "req-series-503",
            timestamp: "2026-08-31T00:00:00Z",
          },
        }),
      );
      return;
    }
    let data = {
      traffic: { series: [] },
      saturation: {
        inFlight: { series: [] },
        queues: [],
      },
      latency: {
        groups: [
          {
            group: "issue",
            percentiles: {
              state: "VALID",
              value: { p50Millis: 11, p95Millis: 22, p99Millis: 33 },
              observedAt: "2026-08-27T00:00:00Z",
            },
          },
          { group: "queue", percentiles: { state: "PENDING" } },
        ],
      },
    };
    if (request.url?.startsWith("/api/v1/admin/metrics/series")) {
      data = {
        series: [
          {
            key: "THROUGHPUT",
            labels: {},
            scoped: false,
            state: "VALID",
            points: [
              { at: "2026-08-28T00:00:00Z", value: 12 },
              { at: "2026-08-28T00:00:05Z", value: 18 },
            ],
          },
          {
            key: "IN_FLIGHT",
            labels: {},
            scoped: false,
            state: "VALID",
            points: [{ at: "2026-08-28T00:00:05Z", value: 3 }],
          },
        ],
        markers: [],
      };
    } else if (request.url?.startsWith("/api/v1/admin/overview")) {
      data = { snapshotAt: "2026-08-28T00:00:00Z", overallStatus: "PARTIAL" };
    } else if (request.url?.startsWith("/api/v1/admin/analytics")) {
      data = {
        range: { from: "2025-09-01", to: "2026-08-29" },
        filters: { brandId: null, couponId: null },
        sourceType: "OBSERVATION_DB",
        brands: [
          { brandId: 1, brandName: "Brand A" },
          { brandId: 2, brandName: "Brand B" },
        ],
        brandTrends: {
          state: "VALID",
          observedAt: "2026-08-29T00:00:00Z",
          value: [
            { periodStart: "2026-07-01", brandId: 1, issueCount: 10 },
            { periodStart: "2026-08-01", brandId: 1, issueCount: 20 },
            { periodStart: "2026-08-01", brandId: 2, issueCount: 5 },
          ],
        },
        hourlyHeatmap: {
          state: "VALID",
          observedAt: "2026-08-29T00:00:00Z",
          value: [
            { dayOfWeek: 1, hour: 9, issueCount: 3 },
            { dayOfWeek: 7, hour: 18, issueCount: 8 },
          ],
        },
        issuanceStatusDistribution: {
          state: "VALID",
          observedAt: "2026-08-29T00:00:00Z",
          value: {
            totalIssued: 100,
            currentlyIssued: 60,
            statuses: [
              { status: "ISSUED", count: 60, ratio: 0.6 },
              { status: "USED", count: 30, ratio: 0.3 },
              { status: "CANCELLED", count: 10, ratio: 0.1 },
            ],
          },
        },
      };
    } else if (request.url?.startsWith("/api/v1/coupon-rounds/public")) {
      data = {
        content: [
          {
            couponRoundId: 7,
            templateId: 3,
            brandId: 1,
            name: "Public Round",
            policyType: "FIXED_AMOUNT",
            discountRate: null,
            maxDiscountAmount: null,
            discountAmount: 1000,
            validDays: 7,
            eligibleGrades: ["WELCOME"],
            status: "OPEN",
            openAt: "2026-08-29T00:00:00Z",
            closeAt: "2026-08-29T01:00:00Z",
            totalQuantity: 100,
            remainingQuantity: 80,
          },
        ],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      };
    } else if (request.url?.startsWith("/api/v1/admin/events")) {
      data = {
        items: [
          {
            eventId: "00000000-0000-4000-8000-000000000001",
            eventType: "ISSUE_RESULT",
            memberId: 10,
            couponId: 68520,
            issuanceCodeMasked: "ABCD********WXYZ",
            httpStatus: 201,
            occurredAt: "2026-08-28T02:44:35Z",
          },
        ],
        hasMore: false,
        cursorReset: false,
        eventsMayBeMissing: false,
      };
    } else if (request.url?.startsWith("/api/v1/admin/issuance-histories")) {
      data = {
        items: [
          {
            issuanceId: 602,
            issuanceCodeMasked: "QDNX********WA5G",
            couponId: 68520,
            fromStatus: null,
            toStatus: "ISSUED",
            eventType: "ISSUE",
            occurredAt: "2026-08-28T02:44:35Z",
          },
        ],
        nextBeforeCursor: "older",
        hasOlder: true,
      };
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ success: true, data }));
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  viteServer = await createViteServer({
    cacheDir: ".vite-test",
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ createHttpAdminApi } = await viteServer.ssrLoadModule("/src/lib/admin/http.ts"));
  ({ createAdminApi } = await viteServer.ssrLoadModule("/src/lib/admin/index.ts"));
  ({ createHttpApi } = await viteServer.ssrLoadModule("/src/lib/coupon/http.ts"));
});

after(async () => {
  await viteServer?.close();
  await new Promise((resolve, reject) =>
    httpServer.close((error) => (error ? reject(error) : resolve())),
  );
});

test("metrics HTTP adapter converts backend latency groups into the locked screen contract", async () => {
  globalThis.window = {
    localStorage: {
      getItem: (key) =>
        key === "coupon-yaho.session.v2"
          ? JSON.stringify({
              memberId: 1,
              nickname: "admin",
              grade: "WELCOME",
              role: "ADMIN",
              issuedAt: Date.now(),
            })
          : null,
    },
  };
  requestedUrls = [];
  const response = await createHttpAdminApi(baseUrl).getMetrics("1m");

  assert.deepEqual(requestedUrls, [
    "/api/v1/admin/metrics?window=1m",
    "/api/v1/admin/metrics/series?window=1m",
  ]);
  assert.equal(requestedHeaders["x-user-role"], "ADMIN");
  assert.equal(requestedHeaders["x-user-id"], "1");
  assert.deepEqual(response.latency.groups, [
    {
      group: "ISSUE",
      p50: { state: "VALID", value: 11, observedAt: "2026-08-27T00:00:00Z" },
      p95: { state: "VALID", value: 22, observedAt: "2026-08-27T00:00:00Z" },
      p99: { state: "VALID", value: 33, observedAt: "2026-08-27T00:00:00Z" },
      series: [],
    },
    {
      group: "QUEUE_POLL",
      p50: { state: "PENDING" },
      p95: { state: "PENDING" },
      p99: { state: "PENDING" },
      series: [],
    },
  ]);
  assert.deepEqual(response.traffic.series, [
    { t: Date.parse("2026-08-28T00:00:00Z"), issueAttemptRps: 12 },
    { t: Date.parse("2026-08-28T00:00:05Z"), issueAttemptRps: 18 },
  ]);
  assert.deepEqual(response.saturation.inFlight.series, [
    { t: Date.parse("2026-08-28T00:00:05Z"), global: 3 },
  ]);
});

test("metrics HTTP adapter rejects when the required series endpoint fails", async () => {
  failMetricsSeries = true;
  try {
    await assert.rejects(
      () => createHttpAdminApi(baseUrl).getMetrics("1m"),
      (error) =>
        error?.status === 503 &&
        error?.code === "ADMIN-METRICS-SERIES-UNAVAILABLE" &&
        error?.requestId === "req-series-503",
    );
  } finally {
    failMetricsSeries = false;
  }
});

test("admin API entry point always sends overview requests to HTTP", async () => {
  requestedUrl = undefined;
  const api = createAdminApi(baseUrl);

  const overview = await api.getOverview();
  assert.equal(requestedUrl, "/api/v1/admin/overview");
  assert.equal(overview.snapshotAt, "2026-08-28T00:00:00Z");
});

test("live overview does not send unsupported coupon and filter query parameters", async () => {
  await createHttpAdminApi(baseUrl).getOverview({ brandId: 1, filter: "RUNNING" });
  assert.equal(requestedUrl, "/api/v1/admin/overview");
});

test("live event and history adapters use backend cursor names and normalize rows", async () => {
  const api = createHttpAdminApi(baseUrl);

  const events = await api.getEvents({ couponRoundId: 68520, cursor: "event-cursor", limit: 14 });
  assert.equal(requestedUrl, "/api/v1/admin/events?afterCursor=event-cursor&limit=14");
  assert.equal(events.events[0].couponRoundId, 68520);
  assert.equal(events.events[0].code, "ABCD********WXYZ");

  const histories = await api.getHistories({
    couponRoundId: 68520,
    cursor: "history-cursor",
    limit: 12,
  });
  assert.equal(
    requestedUrl,
    "/api/v1/admin/issuance-histories?couponId=68520&beforeCursor=history-cursor&limit=12",
  );
  assert.equal(histories.histories[0].code, "QDNX********WA5G");
  assert.equal(histories.histories[0].from, "없음");
  assert.equal(histories.nextCursor, "older");
});

test("coupon round list uses the public page and returns its content", async () => {
  const rounds = await createHttpApi(baseUrl).listRounds();

  assert.equal(requestedUrl, "/api/v1/coupon-rounds/public?page=0&size=100");
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].id, 7);
  assert.equal(rounds[0].activeCount, 20);
  assert.deepEqual(rounds[0].eligibleGrades, ["WELCOME"]);
});

test("analytics sends a concrete date range and normalizes the observed backend response", async () => {
  const analytics = await createHttpAdminApi(baseUrl).getAnalytics({
    from: "2025-09-01",
    to: "2026-08-29",
  });

  assert.equal(requestedUrl, "/api/v1/admin/analytics?from=2025-09-01&to=2026-08-29");
  assert.deepEqual(analytics.brandTrend, {
    months: ["2026-07", "2026-08"],
    series: [
      { brandId: 1, name: "Brand A", values: [10, 20] },
      { brandId: 2, name: "Brand B", values: [0, 5] },
    ],
  });
  assert.equal(analytics.heatmap.grid[0][9], 3);
  assert.deepEqual(analytics.heatmap.peak, { day: 6, hour: 18, value: 8 });
  assert.deepEqual(analytics.funnel, [
    { stage: "ISSUED", label: "발급", count: 60, ratio: 0.6 },
    { stage: "USED", label: "사용", count: 30, ratio: 0.3 },
    { stage: "CANCELLED", label: "취소", count: 10, ratio: 0.1 },
  ]);
  assert.deepEqual(analytics.sourceStates, {
    brandTrend: "VALID",
    heatmap: "VALID",
    funnel: "VALID",
  });
});

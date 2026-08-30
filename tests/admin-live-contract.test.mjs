import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";

let viteServer;
let LiveOverview;
let LiveBenchmarkList;
let LiveCampaignDetail;
let appendTransitionSample;
let SystemSignalNavigation;
let LatencySignalPanel;
let mergeEventPoll;
let OverviewUnavailable;
let EventScopeNotice;
let defaultAnalyticsRange;
let AnalyticsUnavailable;

before(async () => {
  viteServer = await createViteServer({
    cacheDir: ".vite-test",
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [react()],
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ LiveOverview } = await viteServer.ssrLoadModule("/src/components/admin/live-overview.tsx"));
  ({ LiveCampaignDetail } = await viteServer.ssrLoadModule(
    "/src/components/admin/live-campaign-detail.tsx",
  ));
  ({ appendTransitionSample } = await viteServer.ssrLoadModule(
    "/src/lib/admin/transition-series.ts",
  ));
  ({ LiveBenchmarkList } = await viteServer.ssrLoadModule(
    "/src/components/admin/live-benchmarks.tsx",
  ));
  ({ SystemSignalNavigation } = await viteServer.ssrLoadModule("/src/routes/admin.system.tsx"));
  ({ LatencySignalPanel } = await viteServer.ssrLoadModule(
    "/src/components/admin/latency-signal.tsx",
  ));
  ({ mergeEventPoll } = await viteServer.ssrLoadModule("/src/lib/admin/event-poll-state.ts"));
  ({ OverviewUnavailable } = await viteServer.ssrLoadModule("/src/routes/admin.index.tsx"));
  ({ EventScopeNotice } = await viteServer.ssrLoadModule(
    "/src/routes/admin.campaigns.$couponRoundId.tsx",
  ));
  ({ defaultAnalyticsRange, AnalyticsUnavailable } = await viteServer.ssrLoadModule(
    "/src/routes/admin.campaigns.index.tsx",
  ));
});

test("event polling advances the cursor and retains only the newest rows", () => {
  const first = mergeEventPoll(
    undefined,
    {
      meta: { snapshotAt: "2026-08-28T00:00:01Z" },
      events: [{ eventId: "e1", occurredAt: "2026-08-28T00:00:01Z" }],
      nextCursor: "1-0",
      droppedCount: 0,
      sampled: false,
    },
    2,
  );
  const second = mergeEventPoll(
    first,
    {
      meta: { snapshotAt: "2026-08-28T00:00:03Z" },
      events: [
        { eventId: "e2", occurredAt: "2026-08-28T00:00:02Z" },
        { eventId: "e3", occurredAt: "2026-08-28T00:00:03Z" },
      ],
      nextCursor: "3-0",
      droppedCount: 0,
      sampled: false,
    },
    2,
  );

  assert.equal(second.nextCursor, "3-0");
  assert.deepEqual(
    second.events.map((event) => event.eventId),
    ["e3", "e2"],
  );
});

test("system signal navigation excludes the unsupported failure area", () => {
  assert.equal(typeof SystemSignalNavigation, "function");
  const html = renderToStaticMarkup(
    createElement(SystemSignalNavigation, {
      data: {
        consistency: { severity: "NONE" },
        latency: { success: { state: "N_A" } },
        traffic: { issueAttemptRps: { state: "NO_TRAFFIC" } },
        saturation: {
          resources: [],
          thresholds: { warn: 60, high: 75, critical: 85 },
        },
      },
      signal: "C",
      onSelect: () => {},
    }),
  );

  assert.match(html, /정합성/);
  assert.match(html, /지연/);
  assert.match(html, /처리량/);
  assert.match(html, /포화/);
  assert.doesNotMatch(html, /실패/);
});

test("overview initial failure renders an error and an explicit retry action", () => {
  assert.equal(typeof OverviewUnavailable, "function");
  const html = renderToStaticMarkup(createElement(OverviewUnavailable, { onRetry: () => {} }));

  assert.match(html, /운영 현황을 불러오지 못했습니다/);
  assert.match(html, /다시 시도/);
  assert.doesNotMatch(html, /animate-pulse/);
});

test("campaign event panel explains that the backend stream is filtered on the client", () => {
  assert.equal(typeof EventScopeNotice, "function");
  const html = renderToStaticMarkup(createElement(EventScopeNotice));

  assert.match(html, /전체 회차 이벤트/);
  assert.match(html, /이 화면에서 선택 회차만 표시/);
  assert.match(html, /일부 이벤트가 보이지 않을 수/);
});

test("latency panel hides dependency and failure rows that have no actual values", () => {
  const html = renderToStaticMarkup(
    createElement(LatencySignalPanel, {
      latency: {
        success: { state: "VALID", value: { p50Millis: 10, p95Millis: 20, p99Millis: 30 } },
        policyReject: { state: "N_A" },
        systemFailure: { state: "PENDING" },
      },
      dependencies: {
        redis: { state: "PENDING" },
        hikari: { state: "PENDING" },
        kafka: { state: "PENDING" },
      },
    }),
  );

  assert.match(html, /성공 응답시간/);
  assert.doesNotMatch(html, /실패 응답시간/);
  assert.doesNotMatch(html, />Redis</);
  assert.doesNotMatch(html, />Hikari</);
  assert.doesNotMatch(html, />Kafka</);
  assert.match(html, /현재 연결된 의존성 지연 값이 없습니다/);
});

test("default analytics range stays inside the backend inclusive one-year boundary", () => {
  assert.equal(typeof defaultAnalyticsRange, "function");
  assert.deepEqual(defaultAnalyticsRange(new Date("2026-08-29T09:00:00+09:00")), {
    from: "2025-08-30",
    to: "2026-08-29",
  });
});

test("analytics pending source is shown as unavailable instead of empty charts", () => {
  assert.equal(typeof AnalyticsUnavailable, "function");
  const html = renderToStaticMarkup(createElement(AnalyticsUnavailable));

  assert.match(html, /분석 집계 원천이 아직 연결되지 않았습니다/);
  assert.match(html, /백엔드 후속 구현/);
  assert.doesNotMatch(html, /브랜드별 월별 발급/);
});

after(async () => {
  await viteServer?.close();
});

test("live overview renders the backend coupon round contract without inventing pending values", () => {
  const html = renderToStaticMarkup(
    createElement(LiveOverview, {
      queueControl: createElement("div", null, "대기열 설정 live control"),
      inquiryPanel: createElement("div", null, "회원 조회 live inquiry"),
      data: {
        snapshotAt: "2026-08-28T01:49:33Z",
        overallStatus: "PARTIAL",
        actionRequired: { state: "PENDING" },
        openingSoon: {
          value: { totalCount: 0, preparationIncompleteCount: 0 },
          state: "VALID",
        },
        queueRisk: { state: "PENDING" },
        stockRisk: { state: "PENDING" },
        aggregateIssuanceRate: { state: "PENDING" },
        aggregateQueue: { state: "PENDING" },
        latencySummary: { state: "PENDING" },
        couponRoundStatusSummary: {
          value: { openCount: 1, scheduledCount: 0, closedCount: 0 },
          state: "VALID",
        },
        actionItems: {
          value: {
            totalCount: 1,
            topItems: [
              {
                couponId: 1,
                couponName: "CY-794 Action Coupon",
                opensAt: "2026-08-28T01:07:24Z",
                severity: "WARN",
                customerImpact: "LIMITED",
                customerImpactText: "쿠폰 회차 준비 확인 필요",
                detectedAt: "2026-08-28T01:40:00Z",
                duration: "PT9M33S",
                recommendedAction: {
                  code: "COUPON_ROUND_NOT_READY",
                  displayText: "쿠폰 회차 상세 확인",
                  targetScreen: "COUPON_ROUND_DETAIL",
                },
              },
            ],
          },
          state: "VALID",
        },
        couponRounds: {
          value: [
            {
              priority: 1,
              couponId: 1,
              couponName: "CY-685 Local Coupon",
              brandName: "CY-685 Local Brand",
              status: "OPEN",
              opensAt: "2026-08-28T01:07:24Z",
              closesAt: "2026-08-28T03:17:24Z",
              severity: "NONE",
              issuanceFlow: { state: "PENDING" },
              couponRoundQueueStatus: { state: "PENDING" },
              stockForecast: {
                value: { remainingQuantity: 99, totalQuantity: 100, remainingRatio: 0.99 },
                state: "VALID",
              },
              failedPreparationItems: [],
              customerImpact: "NONE",
              customerImpactText: null,
              recommendedAction: null,
            },
          ],
          state: "VALID",
        },
        customerOutcomes: {
          value: {
            windowStart: "2026-08-28T01:44:33Z",
            windowEnd: "2026-08-28T01:49:33Z",
            totalCount: 0,
            outcomes: [],
          },
          state: "NO_TRAFFIC",
        },
      },
    }),
  );

  assert.match(html, /CY-685 Local Coupon/);
  assert.match(html, /99 \/ 100/);
  assert.match(html, /href="\/admin\/campaigns\/1"/);
  assert.match(html, /집계 전/);
  assert.match(html, /CY-794 Action Coupon/);
  assert.match(html, /발급 속도/);
  assert.match(html, /고객이 받은 결과/);
  assert.match(html, /재고와 소진 예상/);
  assert.match(html, /알림 발송/);
  assert.match(html, /대기열 설정 live control/);
  assert.match(html, /회원 조회 live inquiry/);
});

test("live coupon detail renders the actual backend coupon metrics contract", () => {
  const html = renderToStaticMarkup(
    createElement(LiveCampaignDetail, {
      data: {
        couponId: 68520,
        snapshotAt: "2026-08-28T02:44:35Z",
        window: "ONE_MINUTE",
        stock: {
          initialCount: { value: 1000, state: "VALID", observedAt: "2026-08-28T02:44:35Z" },
          remainingCount: { value: 400, state: "VALID", observedAt: "2026-08-28T02:44:35Z" },
        },
        issuanceProgress: { value: 0.6, state: "VALID", observedAt: "2026-08-28T02:44:35Z" },
        issuanceRate: { state: "UNAVAILABLE" },
        queue: {
          waitingCount: { state: "PENDING" },
          estimatedWaitMillis: { state: "PENDING" },
        },
        couponRound: { status: "OPEN", opensAt: "2026-08-28T02:00:00Z" },
        usageRatio: { value: 0, state: "VALID", observedAt: "2026-08-28T02:44:35Z" },
        holdingCounts: {
          value: { unusedCount: 600, usedCount: 0, cancelledCount: 0, expiredCount: 0 },
          state: "VALID",
          observedAt: "2026-08-28T02:44:35Z",
        },
        transitionRate: {
          value: { usePerSecond: 0, cancelUsePerSecond: 0, cancelPerSecond: 0, expirePerSecond: 0 },
          state: "NO_TRAFFIC",
          observedAt: "2026-08-28T02:44:35Z",
        },
      },
      couponName: "CY-685 20 RPS 검증 회차",
      transitionSeries: [
        {
          t: Date.parse("2026-08-28T02:44:35Z"),
          USE: 1.5,
          CANCEL_USE: 0.5,
          CANCEL: 0.25,
          EXPIRE: 0.125,
        },
      ],
    }),
  );

  assert.match(html, /CY-685 20 RPS 검증 회차/);
  assert.match(html, /400/);
  assert.match(html, /60\.0%/);
  assert.match(html, /600/);
  assert.match(html, /원천 불가/);
  assert.match(html, /요청 없음/);
  assert.doesNotMatch(html, /선택 회차/);
  assert.match(html, /알림 발송/);
  assert.match(html, /상태 변경 추이/);
  assert.match(html, /height:150px/);
  assert.doesNotMatch(html, />0\.00<\/dd>/);
});

test("live transition polling samples become graph points without duplicate timestamps", () => {
  assert.equal(typeof appendTransitionSample, "function", "polling samples must be accumulated");

  const first = appendTransitionSample([], "2026-08-28T02:44:35Z", {
    usePerSecond: 1.5,
    cancelUsePerSecond: 0.5,
    cancelPerSecond: 0.25,
    expirePerSecond: 0.125,
  });
  assert.deepEqual(first, [
    {
      t: Date.parse("2026-08-28T02:44:35Z"),
      USE: 1.5,
      CANCEL_USE: 0.5,
      CANCEL: 0.25,
      EXPIRE: 0.125,
    },
  ]);

  const replaced = appendTransitionSample(first, "2026-08-28T02:44:35Z", {
    usePerSecond: 2,
    cancelUsePerSecond: 1,
    cancelPerSecond: 0,
    expirePerSecond: 0,
  });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].USE, 2);
});

test("live benchmark list renders an empty state for the backend empty response", () => {
  const html = renderToStaticMarkup(
    createElement(LiveBenchmarkList, {
      data: { items: [], nextBeforeCursor: null, hasOlder: false },
    }),
  );

  assert.match(html, /성능 측정 이력이 없습니다/);
});

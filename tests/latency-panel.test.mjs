import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let LatencySignalPanel;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    ({ LatencySignalPanel } = await server.ssrLoadModule(
      "/src/components/admin/latency-signal.tsx",
    ));
  } catch {
    // RED: OBS-11 has not extracted the latency component yet.
  }
});

after(async () => {
  await server?.close();
});

const observedAt = "2026-08-23T00:00:00Z";
const success = {
  state: "VALID",
  value: { p50Millis: 8, p95Millis: 21, p99Millis: 47 },
  observedAt,
};
const pending = { state: "PENDING" };
const pendingDependencies = {
  redis: pending,
  hikari: pending,
  kafka: pending,
};

function renderPanel(overrides = {}) {
  assert.equal(typeof LatencySignalPanel, "function");
  return renderToStaticMarkup(
    createElement(LatencySignalPanel, {
      latency: {
        success,
        policyReject: pending,
        systemFailure: pending,
        ...overrides.latency,
      },
      dependencies: overrides.dependencies ?? pendingDependencies,
    }),
  );
}

test("success renders p50 p95 p99 from one source and preserves STALE", () => {
  const validHtml = renderPanel();
  assert.match(validHtml, />8\.0ms</);
  assert.match(validHtml, />21ms</);
  assert.match(validHtml, />47ms</);

  const staleHtml = renderPanel({ latency: { success: { ...success, state: "STALE" } } });
  assert.match(staleHtml, /갱신 지연/);
  assert.match(staleHtml, /text-hig-secondary/);
  assert.equal((staleHtml.match(/>갱신 지연<\/span>/g) ?? []).length, 1);
});

test("pending failures and dependencies render dashes and remain separate from success", () => {
  const html = renderPanel();
  assert.match(html, /성공 응답시간[\s\S]*<\/section>[\s\S]*실패 응답시간/);
  assert.match(html, /정책 거절/);
  assert.match(html, /시스템 실패/);
  assert.match(html, /의존성 지연/);
  assert.match(html, /원천 미배선/);
  assert.equal((html.match(/>집계 전<\/span>/g) ?? []).length, 5);
  for (const label of [
    "Redis p95",
    "Redis p99",
    "Hikari p95",
    "Hikari p99",
    "Kafka p95",
    "Kafka p99",
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.ok((html.match(/>—<\/span>/g) ?? []).length >= 12);
  assert.doesNotMatch(html, />0(?:\.0)?ms</);
});

test("latency explains aggregation, diagnostic scope, window semantics, and missing groups", () => {
  const html = renderPanel();
  assert.match(html, /인스턴스 최댓값/);
  assert.match(html, /공식 성능 비교 p99는 부하 생성기 원본 표본/);
  assert.match(html, /화면 p99는 서버 내부 진단용이며 네트워크 구간을 제외/);
  assert.match(html, /1m\/5m\/15m window는 rate 계열에 적용/);
  assert.match(html, /지연 백분위 관측 창은 Micrometer expiry/);
  assert.match(html, /URI 그룹별 성공 지연은 현재 서버 계약에 없습니다/);
  assert.doesNotMatch(html, /순번 폴링/);
});

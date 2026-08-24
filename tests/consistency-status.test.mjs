import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let ConsistencyStatus;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ ConsistencyStatus } = await server.ssrLoadModule(
    "/src/components/admin/consistency-status.tsx",
  ));
});

after(async () => {
  await server?.close();
});

const validGaps = [
  { state: "VALID", value: 0, observedAt: "2026-08-23T00:00:00Z" },
  { state: "VALID", value: 0, observedAt: "2026-08-23T00:00:00Z" },
  { state: "VALID", value: 0, observedAt: "2026-08-23T00:00:00Z" },
  { state: "VALID", value: 0, observedAt: "2026-08-23T00:00:00Z" },
];

function renderStatus(props) {
  return renderToStaticMarkup(createElement(ConsistencyStatus, props));
}

test("LIVE allows omitted severity and renders it as evaluation unavailable", () => {
  const html = renderStatus({ phase: "LIVE", gaps: validGaps });

  assert.match(html, /정합성 판정 · LIVE/);
  assert.match(html, /판정 대기/);
  assert.match(html, /운영 severity · 서버 판정/);
  assert.match(html, /판단 불가/);
  assert.doesNotMatch(html, />NONE</);
});

test("null severity renders as evaluation unavailable", () => {
  const html = renderStatus({ phase: "LIVE", severity: null, gaps: validGaps });

  assert.match(html, /판단 불가/);
  assert.doesNotMatch(html, />NONE</);
});

test("explicit NONE renders as normal operational severity", () => {
  const html = renderStatus({ phase: "LIVE", severity: "NONE", gaps: validGaps });

  assert.match(html, /bg-viz-good/);
  assert.match(html, />NONE</);
});

test("verdict and severity remain separate axes", () => {
  const html = renderStatus({
    phase: "FINAL",
    verdict: "PASS",
    severity: "WARN",
    gaps: validGaps,
  });

  assert.match(html, />PASS</);
  assert.match(html, />WARN</);
});

test("unavailable source uses unknown tone instead of failure tone", () => {
  const html = renderStatus({
    phase: "FINAL",
    verdict: "PASS",
    severity: null,
    gaps: [...validGaps.slice(0, 3), { state: "UNAVAILABLE" }],
  });

  assert.match(html, /text-attention/);
  assert.doesNotMatch(html, /text-viz-critical[^>]*>PASS/);
});

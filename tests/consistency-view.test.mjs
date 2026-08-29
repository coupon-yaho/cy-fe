import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let view;

before(async () => {
  server = await createServer({
    cacheDir: ".vite-test",
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  view = await server.ssrLoadModule("/src/lib/admin/consistency-view.ts");
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

test("LIVE is labeled as pending even when observed gaps are zero", () => {
  assert.equal(view.consistencyVerdictLabel("LIVE", undefined), "판정 대기");
  assert.equal(view.consistencyVerdictTone("LIVE", undefined, validGaps), "pending");
});

test("FINAL PASS and FAIL keep their verdict labels", () => {
  assert.equal(view.consistencyVerdictLabel("FINAL", "PASS"), "PASS");
  assert.equal(view.consistencyVerdictLabel("FINAL", "FAIL"), "FAIL");
});

test("FINAL FAIL is bad", () => {
  assert.equal(view.consistencyVerdictTone("FINAL", "FAIL", validGaps), "bad");
});

test("an unavailable source is unknown rather than bad", () => {
  const gaps = [...validGaps.slice(0, 3), { state: "UNAVAILABLE" }];
  assert.equal(view.consistencyVerdictTone("FINAL", "PASS", gaps), "unknown");
});

test("FINAL PASS with available sources is ok", () => {
  assert.equal(view.consistencyVerdictTone("FINAL", "PASS", validGaps), "ok");
});

test("C signal tone follows only server severity", () => {
  assert.equal(view.consistencySeverityTone(undefined), "bg-hig-muted");
  assert.equal(view.consistencySeverityTone(null), "bg-hig-muted");
  assert.equal(view.consistencySeverityTone("NONE"), "bg-viz-good");
  assert.equal(view.consistencySeverityTone("WARN"), "bg-viz-warning");
  assert.equal(view.consistencySeverityTone("CRITICAL"), "bg-viz-critical");
});

test("null severity is evaluation unavailable, not NONE", () => {
  assert.equal(view.consistencySeverityLabel(undefined), "판단 불가");
  assert.equal(view.consistencySeverityLabel(null), "판단 불가");
  assert.equal(view.consistencySeverityLabel("NONE"), "NONE");
});

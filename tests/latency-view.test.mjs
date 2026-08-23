import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let latencySuccessP99;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    ({ latencySuccessP99 } = await server.ssrLoadModule("/src/lib/admin/latency-view.ts"));
  } catch {
    // RED: the KPI contract helper does not exist yet.
  }
});

after(async () => {
  await server?.close();
});

test("KPI reads the aggregate success p99 and preserves its source state", () => {
  assert.equal(typeof latencySuccessP99, "function");
  const source = latencySuccessP99({
    success: {
      state: "STALE",
      value: { p50Millis: 8, p95Millis: 21, p99Millis: 47 },
      observedAt: "2026-08-23T00:00:00Z",
    },
    policyReject: { state: "PENDING" },
    systemFailure: { state: "PENDING" },
    groups: [{ p99: { state: "VALID", value: 999 } }],
  });

  assert.deepEqual(source, {
    state: "STALE",
    value: 47,
    observedAt: "2026-08-23T00:00:00Z",
  });
});

test("KPI does not turn a missing success p99 into zero", () => {
  assert.equal(typeof latencySuccessP99, "function");
  assert.deepEqual(
    latencySuccessP99({
      success: { state: "PENDING" },
      policyReject: { state: "PENDING" },
      systemFailure: { state: "PENDING" },
    }),
    { state: "PENDING", value: undefined, observedAt: undefined },
  );
});

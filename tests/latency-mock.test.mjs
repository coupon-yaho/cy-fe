import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let createMockAdminApi;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ createMockAdminApi } = await server.ssrLoadModule("/src/lib/admin/mock.ts"));
});

after(async () => {
  await server?.close();
});

test("mock keeps observable success but does not invent uri groups or failure latency", async () => {
  const metrics = await createMockAdminApi().getMetrics("1m");

  assert.equal(metrics.latency.success.state, "VALID");
  assert.ok(metrics.latency.success.value.p99Millis > 0);
  assert.equal(metrics.latency.successSeries, undefined);
  assert.equal(metrics.latency.groups, undefined);
  assert.deepEqual(metrics.latency.policyReject, { state: "PENDING" });
  assert.deepEqual(metrics.latency.systemFailure, { state: "PENDING" });
});

test("mock dependencies match the unwired live contract", async () => {
  const metrics = await createMockAdminApi().getMetrics("1m");

  assert.deepEqual(metrics.dependencies, {
    redis: { state: "PENDING" },
    hikari: { state: "PENDING" },
    kafka: { state: "PENDING" },
  });
});

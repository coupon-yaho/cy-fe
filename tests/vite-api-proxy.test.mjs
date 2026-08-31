import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";

const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

function loadServerConfig() {
  return loadConfigFromFile(
    { command: "serve", mode: "development", isSsrBuild: false, isPreview: false },
    configFile,
  );
}

test("development server proxies API requests to the local backend", async () => {
  const loaded = await loadServerConfig();

  assert.ok(loaded, "vite.config.ts should load");
  assert.equal(loaded.config.server?.proxy?.["/api"]?.target, "http://localhost:8080");
});

// 컨테이너 안에서 개발 서버를 띄우면 `localhost` 가 컨테이너 자신이라 호스트의 서버에
// 못 닿습니다. 그때 환경변수로 갈아 끼울 수 있어야 하는데, 기본값만 검사하면 그 경로가
// 안 지켜집니다.
test("프록시 대상은 환경변수로 갈아 끼운다", async () => {
  process.env.API_ORIGIN = "http://api.test:8080";
  process.env.BATCH_ORIGIN = "http://batch.test:9091";
  try {
    const loaded = await loadServerConfig();
    const proxy = loaded?.config.server?.proxy;

    assert.equal(proxy?.["/api"]?.target, "http://api.test:8080");
    assert.equal(proxy?.["/batch-api"]?.target, "http://batch.test:9091");
  } finally {
    delete process.env.API_ORIGIN;
    delete process.env.BATCH_ORIGIN;
  }
});

// 배치 관리 토큰은 **개발 서버가** 붙입니다. 브라우저로 내려보내면 관리 API 를 아무나
// 부를 수 있게 되므로 VITE_ 접두사를 못 씁니다. 그 규약이 깨지면 여기서 걸려야 합니다.
test("배치 프록시가 접두사를 떼고 관리 토큰을 붙인다", async () => {
  process.env.BATCH_ADMIN_TOKEN = "test-token";
  try {
    const loaded = await loadServerConfig();
    const batch = loaded?.config.server?.proxy?.["/batch-api"];

    assert.ok(batch, "/batch-api 프록시가 있어야 합니다");
    assert.equal(
      batch.rewrite?.("/batch-api/api/v1/admin/verify/runs"),
      "/api/v1/admin/verify/runs",
    );

    const headers = new Map();
    const handlers = new Map();
    batch.configure?.({ on: (event, cb) => handlers.set(event, cb) }, batch);
    handlers.get("proxyReq")?.({ setHeader: (k, v) => headers.set(k, v) });

    assert.equal(headers.get("X-Batch-Admin-Token"), "test-token");
  } finally {
    delete process.env.BATCH_ADMIN_TOKEN;
  }
});

// 게이트웨이가 아는 경로는 쿠폰 셋뿐입니다. `/api` 를 통째로 그쪽으로 보내면 회차·달력·
// 관리자가 전부 404 가 되고 화면이 통으로 죽습니다 — 실제로 그렇게 됐습니다. 그래서
// 발급·순번 두 경로만 갈라 보내는데, 그 규칙이 `/api` 보다 **앞에** 있어야 합니다.
test("게이트웨이를 켜면 발급·순번만 그쪽으로 가고 순서가 앞선다", async () => {
  process.env.GATEWAY_ORIGIN = "http://gw.test:8080";
  process.env.API_ORIGIN = "http://api.test:8080";
  try {
    const loaded = await loadServerConfig();
    const proxy = loaded?.config.server?.proxy ?? {};
    const keys = Object.keys(proxy);
    const gatewayKey = keys.find((k) => k.includes("issue"));

    assert.ok(gatewayKey, "발급·순번 규칙이 있어야 합니다");
    assert.equal(proxy[gatewayKey].target, "http://gw.test:8080");
    assert.ok(
      keys.indexOf(gatewayKey) < keys.indexOf("/api"),
      "게이트웨이 규칙이 /api 보다 앞에 있어야 합니다",
    );

    const re = new RegExp(gatewayKey);
    assert.ok(re.test("/api/v1/coupons/208/issue"), "발급이 잡혀야 합니다");
    assert.ok(re.test("/api/v1/coupons/208/queue?queueToken=x"), "순번이 잡혀야 합니다");
    // 나머지는 게이트웨이가 모릅니다. 잡히면 404 가 됩니다.
    assert.ok(!re.test("/api/v1/coupon-rounds/208"), "회차는 안 잡혀야 합니다");
    assert.ok(!re.test("/api/v1/admin/overview"), "관리자는 안 잡혀야 합니다");
  } finally {
    delete process.env.GATEWAY_ORIGIN;
    delete process.env.API_ORIGIN;
  }
});

// 안 띄운 사람도 있습니다. 그때 규칙이 남아 있으면 발급이 없는 곳으로 갑니다.
test("게이트웨이를 안 켜면 그 규칙이 아예 없다", async () => {
  const loaded = await loadServerConfig();
  const keys = Object.keys(loaded?.config.server?.proxy ?? {});
  assert.ok(!keys.some((k) => k.includes("issue")), "규칙이 없어야 합니다");
});

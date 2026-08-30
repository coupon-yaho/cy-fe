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

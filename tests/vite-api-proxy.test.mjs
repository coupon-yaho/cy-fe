import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";

test("development server proxies API requests to the local backend", async () => {
  const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development", isSsrBuild: false, isPreview: false },
    configFile,
  );

  assert.ok(loaded, "vite.config.ts should load");
  assert.equal(loaded.config.server?.proxy?.["/api"]?.target, "http://localhost:8080");
});

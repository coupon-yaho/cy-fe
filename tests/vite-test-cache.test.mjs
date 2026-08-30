import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const viteServerTests = [
  "value.test.mjs",
  "consistency-view.test.mjs",
  "consistency-status.test.mjs",
  "latency-view.test.mjs",
  "latency-panel.test.mjs",
  "latency-mock.test.mjs",
  "admin-http-metrics.test.mjs",
  "admin-live-contract.test.mjs",
];

test("programmatic Vite test servers do not overwrite the development dependency cache", async () => {
  for (const filename of viteServerTests) {
    const source = await readFile(new URL(filename, import.meta.url), "utf8");
    assert.match(source, /cacheDir:\s*["']\.vite-test["']/, `${filename} needs an isolated cacheDir`);
  }
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let Value;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ Value } = await server.ssrLoadModule("/src/components/admin/state.tsx"));
});

after(async () => {
  await server?.close();
});

function renderValue(source) {
  return renderToStaticMarkup(createElement(Value, { source }));
}

test("PENDING without value renders an em dash", () => {
  assert.match(renderValue({ state: "PENDING" }), />—<\/span>/);
});

test("UNAVAILABLE without value renders an em dash", () => {
  assert.match(renderValue({ state: "UNAVAILABLE" }), />—<\/span>/);
});

test("N_A without value renders an em dash", () => {
  assert.match(renderValue({ state: "N_A" }), />—<\/span>/);
});

test("undefined value renders an em dash", () => {
  assert.match(renderValue({ state: "VALID" }), />—<\/span>/);
});

test("VALID zero renders zero", () => {
  assert.match(
    renderValue({ state: "VALID", value: 0, observedAt: "2026-08-23T00:00:00Z" }),
    />0<\/span>/,
  );
});

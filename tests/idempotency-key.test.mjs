import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

/* 서버의 검사식을 그대로 옮겨 적습니다
   (cy-be `IdempotencyKeys.UUID_V4_PATTERN`).

   여기서 안 잠그면 형식이 깨져도 시험은 초록입니다. 그리고 그 실패는 "발급이
   안 된다" 로만 나타나서, 원인이 헤더에 있다는 것이 화면에서는 안 보입니다. */
const SERVER_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

let server;
let newIdempotencyKey;

before(async () => {
  server = await createServer({
    cacheDir: ".vite-test",
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  ({ newIdempotencyKey } = await server.ssrLoadModule("/src/lib/coupon/contract.ts"));
});

after(async () => {
  await server?.close();
});

/** crypto 를 갈아 끼우고 키를 하나 만듭니다. */
function withCrypto(stub, run) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: stub, configurable: true });
  try {
    return run();
  } finally {
    if (saved) Object.defineProperty(globalThis, "crypto", saved);
  }
}

test("randomUUID 가 있으면 그것을 쓴다", () => {
  const key = withCrypto({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }, () =>
    newIdempotencyKey(),
  );

  assert.equal(key, "11111111-2222-4333-8444-555555555555");
});

/* `crypto.randomUUID` 는 **보안 컨텍스트에서만** 있습니다. 사내 IP 로 HTTP 접속하면
   없고, 그때 나가던 옛 폴백(`idem-<시각>-<난수>`)은 서버가 형식으로 거절했습니다 —
   개발자 기계(localhost)에서는 재현되지 않는 자리라 더 늦게 발견됩니다. */
test("randomUUID 가 없어도 서버가 받는 형식이다", () => {
  const key = withCrypto(
    {
      getRandomValues: (a) => {
        for (let i = 0; i < a.length; i += 1) a[i] = (i * 37) % 256;
        return a;
      },
    },
    () => newIdempotencyKey(),
  );

  assert.match(key, SERVER_PATTERN);
});

test("crypto 가 통째로 없어도 서버가 받는 형식이다", () => {
  assert.match(
    withCrypto({}, () => newIdempotencyKey()),
    SERVER_PATTERN,
  );
});

/* 같은 값이 두 번 나가면 뒷단이 두 시도를 한 건으로 봅니다 — 두 번째 발급이 조용히
   사라집니다. 폴백이 Math.random 으로 떨어질 때도 겹치면 안 됩니다. */
test("부를 때마다 다른 값이다", () => {
  const keys = withCrypto({}, () => {
    const made = new Set();
    for (let i = 0; i < 200; i += 1) made.add(newIdempotencyKey());
    return made;
  });

  assert.equal(keys.size, 200);
});

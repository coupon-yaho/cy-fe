// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// `.env.local` 을 **직접** 읽는다. Vite 는 VITE_ 접두사만 주입하고, 접두사 없는 값은
// vite.config 실행 시점의 process.env 에 안 올라온다. 토큰에 접두사를 붙이면
// 브라우저 번들로 새므로 접두사를 못 쓴다 — 그래서 여기서 파일을 읽는다.
function localEnv(key: string): string {
  try {
    const line = readFileSync(new URL(".env.local", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : "";
  } catch {
    // 파일이 없는 것은 정상이다 — 배치를 안 띄운 개발자도 있다. 그 경우 배치 패널만
    // 비고 나머지 화면은 그대로 뜬다.
    return "";
  }
}

// 프록시가 바라볼 곳. 컨테이너 안에서 개발 서버를 띄우면 `localhost` 가 컨테이너 자신이라
// 호스트의 api·batch 에 못 닿는다. 그때만 이 값을 준다 — 맨몸으로 띄우면 기본값이 맞다.
const apiOrigin = process.env["API_ORIGIN"] || localEnv("API_ORIGIN") || "http://localhost:8080";
const batchOrigin =
  process.env["BATCH_ORIGIN"] || localEnv("BATCH_ORIGIN") || "http://localhost:9091";

// 대조군 배치. **배치 한 대는 DB 하나만 본다**(DB_NAME) — 오염셋과 정상셋은 서로 다른
// DB 에 있으므로 둘을 나란히 보여 주려면 배치가 두 대여야 한다. 안 띄웠으면 이 값을
// 비워 두면 되고, 그때 화면은 지금까지처럼 한 셋만 그린다.
const batchAltOrigin = process.env["BATCH_ALT_ORIGIN"] || localEnv("BATCH_ALT_ORIGIN");
const batchAppOrigin = process.env["BATCH_APP_ORIGIN"] || localEnv("BATCH_APP_ORIGIN");
const batchToken = process.env["BATCH_ADMIN_TOKEN"] || localEnv("BATCH_ADMIN_TOKEN");

type ProxyLike = {
  on: (event: "proxyReq", cb: (req: { setHeader: (k: string, v: string) => void }) => void) => void;
};

export default defineConfig({
  vite: {
    server: {
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
        },
        // 배치 관리 포트. 토큰은 **개발 서버가** 붙인다 — 브라우저로 내려보내면
        // 관리 API 를 아무나 부를 수 있게 된다(VITE_ 접두사를 안 쓰는 이유다).
        // 운영에서는 이 프록시가 없으므로 api 를 통해 중계하거나 게이트웨이가 붙여야 한다.
        "/batch-api": {
          target: batchOrigin,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/batch-api/, ""),
          // http-proxy 타입을 이 패키지가 재수출하지 않아 손으로 좁힌다.
          // 쓰는 것은 setHeader 하나뿐이라 그 모양만 적는다.
          configure: (proxy: ProxyLike) => {
            proxy.on("proxyReq", (proxyReq) => {
              const token = batchToken;
              if (token) proxyReq.setHeader("X-Batch-Admin-Token", token);
            });
          },
        },
        // 대조군 배치. 토큰은 같은 것을 쓴다 — 같은 사람이 띄운 같은 규약의 배치다.
        // 안 띄웠으면 이 프록시가 502 를 내고, 화면이 그 셋을 조용히 뺀다.
        ...(batchAppOrigin
          ? {
              "/batch-app-api": {
                target: batchAppOrigin,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/batch-app-api/, ""),
                configure: (proxy: ProxyLike) => {
                  proxy.on("proxyReq", (proxyReq) => {
                    const token = batchToken;
                    if (token) proxyReq.setHeader("X-Batch-Admin-Token", token);
                  });
                },
              },
            }
          : {}),
        ...(batchAltOrigin
          ? {
              "/batch-alt-api": {
                target: batchAltOrigin,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/batch-alt-api/, ""),
                configure: (proxy: ProxyLike) => {
                  proxy.on("proxyReq", (proxyReq) => {
                    const token = batchToken;
                    if (token) proxyReq.setHeader("X-Batch-Admin-Token", token);
                  });
                },
              },
            }
          : {}),
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

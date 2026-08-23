import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { NotificationProvider } from "@/hooks/use-notifications";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] items-center px-5">
      <div className="mx-auto w-full max-w-2xl">
        <p className="yh-figure text-yh-rule">404</p>
        <h1 className="yh-hero mt-4">이 주소에는 아무것도 없습니다</h1>
        <p className="yh-lede mt-4 max-w-[38ch] text-yh-ink-2">
          주소가 바뀌었거나 지워진 회차일 수 있습니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/events" className="yh-btn">
            브랜드 데이 보기
          </Link>
          <Link to="/" className="yh-btn-ghost">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    /* 루트 에러는 RootComponent 를 통째로 대체합니다 — .ed 래퍼 바깥이라
       여기서 직접 클래스를 답니다. */
    <div className="yh flex min-h-screen items-center px-5">
      <div className="mx-auto w-full max-w-2xl">
        <p className="yh-label">오류</p>
        <h1 className="yh-hero mt-3">화면을 불러오지 못했습니다</h1>
        <p className="yh-lede mt-4 max-w-[42ch] text-yh-ink-2">
          다시 시도해 주세요. 계속 같은 화면이 뜨면 홈으로 돌아가세요.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="yh-btn"
          >
            다시 시도
          </button>
          <a href="/" className="yh-btn-ghost">
            홈으로
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "쿠폰 야~호 — 브랜드 데이 선착순 쿠폰" },
      {
        name: "description",
        content: "매월 열리는 12개 브랜드 데이. 한정 수량 쿠폰을 선착순으로 발급받으세요.",
      },
      { name: "author", content: "쿠폰 야~호" },
      { property: "og:site_name", content: "쿠폰 야~호" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap",
      },
      /* 고객 화면(.ed)의 본문 서체. dynamic-subset 이라 쓰인 글자 조각만 내려받습니다.
         관리자 화면은 .ed 바깥이라 이 서체를 쓰지 않습니다 — DESIGN.md 스택 그대로입니다. */
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          {isAdmin ? (
            <Outlet />
          ) : (
            /* .ed — 고객 셸. 에디토리얼 토큰·서체가 이 안에서만 걸립니다.
               관리자 화면은 이 래퍼 바깥이라 기존 DESIGN.md 스타일 그대로입니다. */
            <div className="yh flex min-h-screen flex-col">
              <a href="#main" className="yh-skip">
                본문으로 건너뛰기
              </a>
              <SiteHeader />
              <main id="main" className="flex-1">
                {/* Required: nested routes render here. */}
                <Outlet />
              </main>
              <SiteFooter />
            </div>
          )}
          <Toaster position="top-center" richColors />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

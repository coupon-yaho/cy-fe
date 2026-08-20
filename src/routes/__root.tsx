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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <p className="eyebrow">404</p>
        <h1 className="t-section mt-2">이 주소에는 아무것도 없습니다</h1>
        <p className="t-body mt-3 text-hig-secondary">
          주소가 바뀌었거나 지워진 회차일 수 있습니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/events" className="btn-primary">
            브랜드 데이 보기
          </Link>
          <Link to="/" className="btn-outline">
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <h1 className="t-section">화면을 불러오지 못했습니다</h1>
        <p className="t-body mt-3 text-hig-secondary">
          다시 시도해 주세요. 계속 같은 화면이 뜨면 홈으로 돌아가세요.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-primary"
          >
            다시 시도
          </button>
          <a href="/" className="btn-outline">
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
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap",
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
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <main className="flex-1">
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

import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

/**
 * 사이트 푸터.
 *
 * 링크 농장을 만들지 않습니다. 실제로 가는 곳 세 개와 고지 한 줄이면 충분합니다.
 */
export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-yh-rule bg-yh-paper-2">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto]">
        <div>
          <BrandLogo variant="key" className="h-16" />
          <p className="yh-small mt-4 max-w-[42ch] text-yh-ink-2">
            매월 열리는 12개 브랜드 데이. 정해진 수량을 선착순으로 나눠 드립니다.
          </p>
        </div>
        <nav className="yh-body flex flex-wrap gap-x-8 gap-y-3 font-semibold sm:flex-col sm:items-end sm:gap-y-4">
          <Link to="/events" className="underline-offset-4 hover:underline">
            브랜드 데이
          </Link>
          <Link to="/my/coupons" className="underline-offset-4 hover:underline">
            내 쿠폰함
          </Link>
          <Link to="/admin" className="text-yh-ink-2 underline-offset-4 hover:underline">
            관리자
          </Link>
        </nav>
      </div>
      <div className="border-t border-yh-rule">
        <p className="yh-small mx-auto w-full max-w-6xl px-5 py-4 text-yh-ink-3">
          로그인과 알림은 데모용입니다.
        </p>
      </div>
    </footer>
  );
}

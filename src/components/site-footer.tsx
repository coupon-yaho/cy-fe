import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline bg-hig-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:grid-cols-[1fr_auto]">
        <div>
          <BrandLogo className="h-14" variant="full" />
          <p className="t-body-sm mt-4 max-w-[44ch] text-hig-secondary">
            매월 열리는 12개 브랜드 데이. 정해진 수량을 선착순으로 나눠 드립니다.
          </p>
        </div>
        <nav className="t-body-sm flex flex-wrap gap-x-7 gap-y-2 sm:justify-end">
          <Link to="/events" className="text-hig-link hover:underline">
            브랜드 데이
          </Link>
          <Link to="/my/coupons" className="text-hig-link hover:underline">
            내 쿠폰함
          </Link>
          <Link to="/admin" className="text-hig-link hover:underline">
            관리자
          </Link>
        </nav>
      </div>
      <div className="border-t border-hairline">
        <p className="t-caption mx-auto w-full max-w-6xl px-5 py-5 text-hig-muted">
          로그인과 알림은 데모용입니다.
        </p>
      </div>
    </footer>
  );
}

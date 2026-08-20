import type { ReactNode } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { formatDate } from "@/components/coupon/timer";
import {
  ISSUANCE_STATUS_LABEL,
  brandOf,
  discountDetail,
  discountHeadline,
  type IssuanceStatus,
  type MemberCoupon,
} from "@/lib/coupon";

/** 16자리 코드는 네 자씩 끊어야 눈으로 읽힙니다. */
function groupCode(code: string) {
  return code.replace(/(.{4})/g, "$1 ").trim();
}

const STATUS_TONE: Record<IssuanceStatus, string> = {
  ISSUED: "text-hig-link",
  USED: "text-positive",
  CANCELLED: "text-hig-muted",
  EXPIRED: "text-hig-muted",
};

/**
 * 보유 쿠폰 카드.
 *
 * DESIGN.md §6 — 그림자 없음. 18px 라운드 흰 면이 캔버스(#f5f5f7) 위에 얹히는 것으로 충분합니다.
 * 상태는 도장 같은 장식 대신 이름 그대로 적습니다.
 */
export function CouponTicket({
  coupon,
  brandId,
  actions,
  dimmed,
}: {
  coupon: MemberCoupon;
  brandId: number;
  actions?: ReactNode;
  dimmed?: boolean;
}) {
  const brand = brandOf(brandId);

  return (
    <article
      className={`overflow-hidden rounded-2xl ${
        dimmed ? "border border-hairline bg-hig-canvas" : "bg-card"
      }`}
    >
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandPlate brandId={brandId} size="md" />
            <div className="min-w-0">
              <p className="t-body truncate font-semibold">{coupon.name}</p>
              <p className="t-body-sm text-hig-muted">
                {brand.name} · {brand.category}
              </p>
            </div>
          </div>

          <p className="t-tile mt-6">
            {discountHeadline(coupon)}
            <span className="t-body-sm ml-3 align-middle text-hig-secondary">
              {discountDetail(coupon)}
            </span>
          </p>

          <p className="num t-body mt-4 tracking-[0.12em] text-hig-secondary">
            {groupCode(coupon.code)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-4 sm:items-end sm:text-right">
          <p className={`t-body-sm font-semibold ${STATUS_TONE[coupon.status]}`}>
            {ISSUANCE_STATUS_LABEL[coupon.status]}
          </p>
          <dl className="t-body-sm space-y-0.5 text-hig-muted">
            <div className="flex gap-2 sm:justify-end">
              <dt>발급</dt>
              <dd className="num text-hig-secondary">{formatDate(coupon.issuedAt)}</dd>
            </div>
            {/* 쓴 쿠폰은 남은 기한보다 언제 얼마를 깎았는지가 궁금합니다. */}
            {coupon.status === "USED" && coupon.usedAt ? (
              <>
                <div className="flex gap-2 sm:justify-end">
                  <dt>사용</dt>
                  <dd className="num text-hig-fg">{formatDate(coupon.usedAt)}</dd>
                </div>
                {coupon.usedDiscountAmount !== null && (
                  <div className="flex gap-2 sm:justify-end">
                    <dt>할인</dt>
                    <dd className="num text-hig-fg">
                      {coupon.usedDiscountAmount.toLocaleString("ko-KR")}원
                      {coupon.orderId !== null && (
                        <span className="ml-1.5 text-hig-muted">주문 {coupon.orderId}</span>
                      )}
                    </dd>
                  </div>
                )}
              </>
            ) : coupon.status === "CANCELLED" ? null : (
              // 취소된 쿠폰에 남은 기한을 적으면 아직 쓸 수 있는 것처럼 읽힙니다.
              <div className="flex gap-2 sm:justify-end">
                <dt>사용 기한</dt>
                <dd className="num text-hig-fg">{formatDate(coupon.expiresAt)}</dd>
              </div>
            )}
          </dl>
          {actions && <div className="flex items-center gap-3 sm:justify-end">{actions}</div>}
        </div>
      </div>
    </article>
  );
}

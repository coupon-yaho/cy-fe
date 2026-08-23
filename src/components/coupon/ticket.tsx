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
  ISSUED: "text-yh-navy",
  USED: "text-positive",
  CANCELLED: "text-yh-ink-3",
  EXPIRED: "text-yh-ink-3",
};

/**
 * 보유 쿠폰 카드.
 *
 * 카드 가장자리에 브랜드색 띠를 두르지 않습니다. 어느 서비스에나 있는 장식이고,
 * 브랜드는 이미 플레이트 색으로 구분됩니다 — 같은 정보를 두 번 칠할 이유가 없습니다.
 *
 * 상태 표현은 `cy-be/docs/05-design-handoff.md` §3 표를 따릅니다.
 * 라벨만으로도 상태는 전달되지만, 쿠폰함은 훑는 화면이라 **글자를 읽기 전에**
 * 못 쓰는 쿠폰이 걸러져야 합니다. 그래서 색·질감을 함께 씁니다.
 *
 *   USED       채도를 낮추고 대각선 스탬프
 *   CANCELLED  회색조 + 점선 테두리
 *   EXPIRED    회색조 + 우상단 모서리 접힘
 *
 * 색만으로 전달하지 않도록 스탬프·라벨을 항상 같이 둡니다.
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
  const used = coupon.status === "USED";
  const cancelled = coupon.status === "CANCELLED";
  const expired = coupon.status === "EXPIRED";
  const spent = cancelled || expired;

  return (
    <article
      className={`yh-card relative overflow-hidden ${
        spent ? "border-dashed bg-yh-paper-2 saturate-[0.15]" : ""
      } ${used ? "saturate-[0.55]" : ""} ${dimmed && !spent ? "opacity-70" : ""}`}
    >
      {/* 사용 완료 — 실물 쿠폰에 찍는 도장 */}
      {used && (
        <span
          className="pointer-events-none absolute top-1/2 right-8 -translate-y-1/2 -rotate-12 rounded-md border-[3px] border-yh-good/45 px-3 py-1 text-[1.125rem] font-extrabold tracking-[0.18em] text-yh-good/45"
          aria-hidden
        >
          USED
        </span>
      )}

      {/* 만료 — 우상단 모서리가 접힌 종이 */}
      {expired && (
        <span
          className="pointer-events-none absolute top-0 right-0 size-8 rounded-bl-md"
          style={{
            background: "linear-gradient(225deg, var(--yh-rule) 0 50%, transparent 50%)",
          }}
          aria-hidden
        />
      )}

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandPlate brandId={brandId} size="md" />
            <div className="min-w-0">
              <p className="yh-sub truncate">{coupon.name}</p>
              <p className="yh-small text-yh-ink-3">
                {brand.name} · {brand.category}
              </p>
            </div>
          </div>

          <p className="yh-figure-sm mt-6 text-[2rem] leading-none">
            {discountHeadline(coupon)}
            <span className="yh-small ml-3 align-middle font-normal text-yh-ink-2">
              {discountDetail(coupon)}
            </span>
          </p>

          <p className="yh-num yh-body mt-5 font-semibold tracking-[0.16em] text-yh-ink-2">
            {groupCode(coupon.code)}
          </p>

          {/* 실물 쿠폰의 절취선. 쿠폰함 카드는 종이 면 위에만 놓이므로 노치가
              제대로 뚫립니다 — 배경이 둘인 자리에서는 점선만 씁니다. */}
          <div
            className="yh-tear mt-6 mr-[-1.5rem] ml-[-2rem] sm:hidden"
            style={{ ["--yh-notch" as string]: dimmed ? "var(--yh-paper-2)" : "var(--yh-paper)" }}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-4 sm:items-end sm:text-right">
          <p className={`yh-small font-bold ${STATUS_TONE[coupon.status]}`}>
            {ISSUANCE_STATUS_LABEL[coupon.status]}
          </p>
          <dl className="yh-small space-y-1 text-yh-ink-3">
            <div className="flex gap-2 sm:justify-end">
              <dt>발급</dt>
              <dd className="yh-num text-yh-ink-2">{formatDate(coupon.issuedAt)}</dd>
            </div>
            {/* 쓴 쿠폰은 남은 기한보다 언제 얼마를 깎았는지가 궁금합니다. */}
            {coupon.status === "USED" && coupon.usedAt ? (
              <>
                <div className="flex gap-2 sm:justify-end">
                  <dt>사용</dt>
                  <dd className="yh-num text-yh-navy">{formatDate(coupon.usedAt)}</dd>
                </div>
                {coupon.usedDiscountAmount !== null && (
                  <div className="flex gap-2 sm:justify-end">
                    <dt>할인</dt>
                    <dd className="yh-num font-bold text-yh-navy">
                      {coupon.usedDiscountAmount.toLocaleString("ko-KR")}원
                      {coupon.orderId !== null && (
                        <span className="ml-1.5 font-normal text-yh-ink-3">
                          주문 {coupon.orderId}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </>
            ) : coupon.status === "CANCELLED" ? null : (
              // 취소된 쿠폰에 남은 기한을 적으면 아직 쓸 수 있는 것처럼 읽힙니다.
              <div className="flex gap-2 sm:justify-end">
                <dt>사용 기한</dt>
                <dd className="yh-num text-yh-navy">{formatDate(coupon.expiresAt)}</dd>
              </div>
            )}
          </dl>
          {actions && <div className="flex items-center gap-4 sm:justify-end">{actions}</div>}
        </div>
      </div>
    </article>
  );
}

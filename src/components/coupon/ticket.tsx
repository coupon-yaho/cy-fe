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
  USED: "text-yh-good",
  CANCELLED: "text-yh-ink-3",
  EXPIRED: "text-yh-ink-3",
};

/**
 * 보유 쿠폰.
 *
 * 실물 쿠폰의 구조를 씁니다 — 왼쪽은 무엇을 얼마나 깎아 주는지, 절취선 오른쪽은
 * 상태와 할 일. 쿠폰함은 훑는 화면이라 상태와 버튼이 같은 세로줄에 있어야
 * 여러 장을 위아래로 비교할 수 있습니다.
 *
 * 앞선 시안은 좌우가 갈려 있는데 절취선이 없어 그냥 흰 카드였고, 카드 가운데가
 * 비어 시선이 왕복했습니다. USED 도장은 사용일·할인액 위에 얹혀 글자를 가렸습니다.
 *
 * 상태 표현은 `cy-be/docs/05-design-handoff.md` §3 표를 따릅니다. 색만으로 알리지
 * 않도록 라벨·도장·질감을 함께 씁니다.
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
      className={`yh-coupon grid sm:grid-cols-[minmax(0,1fr)_auto_13.5rem] ${
        spent ? "border-dashed bg-yh-paper-2 saturate-[0.15]" : ""
      } ${used ? "saturate-[0.6]" : ""} ${dimmed && !spent ? "opacity-70" : ""}`}
    >
      {/* 만료 — 우상단 모서리가 접힌 종이 */}
      {expired && (
        <span
          className="pointer-events-none absolute top-0 right-0 size-9 rounded-tr-[17px] rounded-bl-lg"
          style={{ background: "linear-gradient(225deg, var(--yh-rule) 0 52%, transparent 52%)" }}
          aria-hidden
        />
      )}

      <div className="relative min-w-0 p-6 sm:p-7">
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

        {/* 코드는 읽어서 옮겨 적는 값입니다. 본문과 같은 면에 두면 문장으로 읽힙니다. */}
        <div
          className={`mt-6 flex items-center justify-between gap-4 rounded-xl px-4 py-3 ${
            spent ? "bg-yh-rule/40" : "bg-yh-paper-2"
          }`}
        >
          <span className="yh-label">쿠폰 번호</span>
          <span
            className={`yh-num text-[0.9375rem] font-semibold tracking-[0.18em] ${
              spent ? "text-yh-ink-3" : "text-yh-ink-2"
            }`}
          >
            {groupCode(coupon.code)}
          </span>
        </div>

        {/* 사용 완료 도장. 왼쪽 면의 빈 자리에 찍습니다.
            좁은 화면에는 찍지 않습니다 — 빈 자리가 없어 쿠폰 번호를 가립니다.
            상태는 "사용 완료" 라벨과 낮춘 채도로 이미 전달됩니다. */}
        {used && (
          <span
            className="pointer-events-none absolute right-10 bottom-7 hidden -rotate-12 rounded-md border-[3px] border-yh-good/40 px-3 py-1 text-[1.125rem] font-extrabold tracking-[0.18em] text-yh-good/40 sm:block"
            aria-hidden
          >
            USED
          </span>
        )}
      </div>

      {/* 절취선. 쿠폰함 카드는 종이 면 위에만 놓이므로 노치가 제대로 뚫립니다. */}
      <div className="yh-tear mx-6 sm:hidden" />
      {/* 세로 절취선은 카드 위아래 끝까지 이어져야 노치가 가장자리를 뚫습니다.
          안쪽에 여백을 두면 반원이 카드 안에 동그라미로 떠 있게 됩니다. */}
      <div className="yh-tear-y hidden sm:block" />

      <div className="flex flex-col justify-between gap-4 p-6 sm:p-7">
        <div>
          <p className={`yh-small font-bold ${STATUS_TONE[coupon.status]}`}>
            {ISSUANCE_STATUS_LABEL[coupon.status]}
          </p>

          <dl className="yh-small mt-3 space-y-1.5 text-yh-ink-3">
            <Row label="발급">{formatDate(coupon.issuedAt)}</Row>

            {/* 쓴 쿠폰은 남은 기한보다 언제 얼마를 깎았는지가 궁금합니다. */}
            {used && coupon.usedAt ? (
              <>
                <Row label="사용" strong>
                  {formatDate(coupon.usedAt)}
                </Row>
                {coupon.usedDiscountAmount !== null && (
                  <>
                    <Row label="할인" strong>
                      {coupon.usedDiscountAmount.toLocaleString("ko-KR")}원
                    </Row>
                    {coupon.orderId !== null && <Row label="주문">{coupon.orderId}</Row>}
                  </>
                )}
              </>
            ) : cancelled ? null : (
              // 취소된 쿠폰에 남은 기한을 적으면 아직 쓸 수 있는 것처럼 읽힙니다.
              <Row label="사용 기한" strong>
                {formatDate(coupon.expiresAt)}
              </Row>
            )}
          </dl>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-4">{actions}</div>}
      </div>
    </article>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className={`yh-num ${strong ? "font-semibold text-yh-navy" : "text-yh-ink-2"}`}>
        {children}
      </dd>
    </div>
  );
}

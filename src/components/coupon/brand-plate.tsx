import { brandOf } from "@/lib/coupon";

/**
 * 브랜드 표시.
 *
 * 이름 두 글자를 색 원에 넣습니다. 이모지를 쓰지 않는 이유는 12개 브랜드가
 * 서로 구분돼야 하는데 이모지는 업종만 말하고 브랜드는 말하지 않기 때문입니다.
 */
export function BrandPlate({
  brandId,
  size = "md",
}: {
  brandId: number;
  size?: "sm" | "md" | "lg";
}) {
  const brand = brandOf(brandId);
  const dims = {
    sm: "size-7 text-[11px]",
    md: "size-10 text-[13px]",
    lg: "size-14 text-[17px]",
  }[size];

  return (
    <span
      className={`${dims} grid shrink-0 place-items-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: brand.hue }}
      aria-hidden
    >
      {brand.plate}
    </span>
  );
}

import { brandOf } from "@/lib/coupon";

/**
 * 브랜드 표시.
 *
 * 이름 두 글자를 색 판에 넣습니다. 이모지를 쓰지 않는 이유는 12개 브랜드가
 * 서로 구분돼야 하는데 이모지는 업종만 말하고 브랜드는 말하지 않기 때문입니다.
 *
 * 원이 아니라 모서리를 살짝 깎은 사각형입니다. 원형 아바타는 어느 서비스에나
 * 있어서 브랜드를 구분하는 일에 보탬이 안 됩니다.
 *
 * 배경은 hue 가 아니라 ink 입니다 — 흰 두 글자가 올라가므로 4.5:1 이 필요하고,
 * 사양서 원색 12종 중 5종이 그 선을 넘지 못합니다(brands.ts 주석에 실측치).
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
    sm: "size-7 rounded-[5px] text-[11px]",
    md: "size-10 rounded-[6px] text-[13px]",
    lg: "size-14 rounded-[8px] text-[17px]",
  }[size];

  return (
    <span
      className={`${dims} grid shrink-0 place-items-center font-bold tracking-tight text-white`}
      style={{ backgroundColor: brand.ink }}
      aria-hidden
    >
      {brand.plate}
    </span>
  );
}

/**
 * 브랜드 로고.
 *
 *  lockup — 가로 락업. 헤더처럼 높이가 좁은 자리에 씁니다.
 *  full   — 캐릭터와 리본까지 있는 원본. 여백이 넉넉한 자리에만.
 */
export function BrandLogo({
  className = "h-9",
  variant = "lockup",
}: {
  className?: string;
  variant?: "lockup" | "full";
}) {
  const src = variant === "full" ? "/logo-yaho.png" : "/logo-yaho-lockup.png";
  return (
    <img
      src={src}
      alt="쿠폰 야~호 — 할인 생활의 즐거움"
      className={`${className} w-auto object-contain`}
    />
  );
}

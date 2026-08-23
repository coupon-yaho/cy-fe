/**
 * 반짝이.
 *
 * 브랜드 아트워크에 있는 4각 별입니다. 로고에만 있고 화면에는 없으면
 * 캐릭터가 붙여 놓은 스티커처럼 겉돕니다 — 같은 장식을 지면에도 흩어 둡니다.
 *
 * 장식이라 스크린리더에서는 감춥니다.
 */
export function Sparkle({
  className = "",
  size = 24,
  tone = "sky",
}: {
  className?: string;
  size?: number;
  tone?: "sky" | "yellow" | "peri" | "white";
}) {
  const fill = {
    sky: "var(--yh-t-sky)",
    yellow: "var(--yh-t-yellow)",
    peri: "var(--yh-t-peri)",
    white: "rgb(255 255 255 / 0.55)",
  }[tone];

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* 가운데가 잘록한 4각 별 — 원본 아트워크와 같은 실루엣 */}
      <path
        d="M12 0c.6 6.2 5.2 10.8 12 12-6.8 1.2-11.4 5.8-12 12-.6-6.2-5.2-10.8-12-12C6.8 10.8 11.4 6.2 12 0Z"
        fill={fill}
      />
    </svg>
  );
}

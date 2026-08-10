import logo from "@/assets/logo-full.png.asset.json";

export function BrandLogo({ className = "h-9" }: { className?: string }) {
  return (
    <img
      src={logo.url}
      alt="쿠폰 야~호 — 할인 생활의 즐거움"
      className={`${className} w-auto object-contain`}
    />
  );
}

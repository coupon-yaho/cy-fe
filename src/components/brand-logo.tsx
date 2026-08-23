/**
 * 브랜드 로고.
 *
 * `cy-be/docs/05-design-handoff.md` §2 가 자산을 둘로 나누고 역할을 못박아 두었습니다.
 * **섞어 쓰면 안 됩니다.**
 *
 *  A (UI 자산) — 어느 화면에나 붙을 수 있는 로고
 *    · `mark` 캐릭터 얼굴 + 워드마크. 데스크탑 헤더 36~40px
 *    · `type` 워드마크만. 모바일 헤더 28px, 좁은 자리
 *
 *  B (콘텐츠) — 키비주얼. **"지금 이 순간이 특별하다"고 말할 때만** 나옵니다
 *    · `key` 캐릭터 + 쿠폰 부채꼴 + 반짝임
 *      쓸 곳: 랜딩 히어로(600~800px) · 발급 성공 · 쿠폰함 빈 상태 · OG 이미지
 *
 * 문서가 명시한 금지 사항:
 *   - B 를 헤더에 쓰지 않는다 — 32px 로 줄이면 쿠폰 부채꼴이 얼룩이 된다
 *   - B 를 대시보드에 쓰지 않는다 — 차트가 안 읽힌다
 *   - 반짝임은 B 에 딸린 것. UI 에 따로 뿌리지 않는다
 *
 * 헤더에 원본(B)을 넣어 보고 실측한 결과: h-14 에서 100×56px 이고, 이 비율(1.78:1)
 * 로는 워드마크를 읽히게 하려면 헤더가 120px 를 넘어가야 합니다. 그래서 같은 캐릭터를
 * 쓰되 가로로 재배치한 `mark` 를 헤더에 씁니다 — 얼굴이 정사각이라 같은 높이에서
 * 훨씬 크게 들어가고, 워드마크는 원본 벡터를 그대로 옆에 둡니다.
 */
export function BrandLogo({
  className = "h-9",
  variant = "key",
}: {
  className?: string;
  /** mark·type = A(UI) · key = B(콘텐츠) */
  variant?: "mark" | "type" | "key";
}) {
  if (variant === "mark") {
    return (
      <span className={`flex items-center gap-2.5 ${className}`}>
        <img
          src="/logo-a-mark.png"
          alt=""
          width={320}
          height={320}
          aria-hidden
          className="h-full w-auto shrink-0 rounded-full bg-white object-cover shadow-[0_2px_8px_rgba(22,48,92,0.16)] ring-2 ring-white"
        />
        {/* 360px 미만에서는 워드마크를 접습니다. 여기서는 로고 + 알림 + 로그인 +
            메뉴가 23px 넘쳤고(실측), 넷 중 접었을 때 가장 덜 잃는 것이 워드마크입니다
            — 얼굴만 남아도 브랜드는 알아보고, 링크 이름은 aria-label 이 갖고 있습니다. */}
        <img
          src="/logo-yaho-lockup.png"
          alt="쿠폰 야~호 — 할인 생활의 즐거움"
          className="h-[56%] w-auto object-contain max-[359px]:hidden"
        />
      </span>
    );
  }

  if (variant === "type") {
    return (
      <img
        src="/logo-yaho-lockup.png"
        alt="쿠폰 야~호 — 할인 생활의 즐거움"
        className={`${className} w-auto object-contain`}
      />
    );
  }

  return (
    <img
      src="/hero-yaho.png"
      alt="쿠폰 야~호 — 할인 생활의 즐거움"
      className={`${className} w-auto object-contain`}
    />
  );
}

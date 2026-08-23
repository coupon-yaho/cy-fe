import type { ReactNode } from "react";

/**
 * 로그인·회원가입 지면.
 *
 * 앞선 시안은 좁은 폼 하나가 텅 빈 지면 한가운데 떠 있었습니다. 폭이 남는데 아무것도
 * 없으니 미완성으로 보이고, 무엇보다 **이 서비스가 무엇인지 말하지 않습니다** —
 * 처음 오는 사람이 가장 많이 보는 화면인데도요.
 *
 * 왼쪽에 브랜드를 세우고 오른쪽에서 입력받습니다. 캐릭터가 오른쪽 아래를 가리키므로
 * 손끝이 폼을 가리킵니다. 좁은 화면에서는 왼쪽 면을 접습니다 — 모바일에서 첫 화면을
 * 브랜드가 다 먹으면 정작 입력칸이 접힙니다.
 */
export function AuthLayout({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    /* 헤더(로고 바 + 라이브 띠)를 뺀 높이에 정확히 맞춥니다. 페이지가 스크롤되면
       입력 도중 지면이 흔들리므로, 정 모자라면 오른쪽 칸 안에서만 스크롤합니다. */
    <div className="grid h-[calc(100dvh-8.25rem)] overflow-hidden lg:grid-cols-[minmax(0,44%)_minmax(0,1fr)]">
      <aside className="yh-deep yh-grain relative hidden overflow-hidden lg:flex lg:items-center">
        <div className="relative z-[1] px-10 py-12 xl:px-14">
          <p className="yh-label inline-flex rounded-full bg-white/14 px-3.5 py-1.5 text-white/80 ring-1 ring-white/20">
            할인 생활의 즐거움
          </p>
          <p className="yh-title mt-5 text-white">
            매달 12개 브랜드가
            <br />
            하루씩 문을 엽니다
          </p>
          <img
            src="/hero-character.png"
            alt=""
            width={844}
            height={595}
            aria-hidden
            className="mt-6 w-full max-w-[19rem] drop-shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
          />
        </div>
      </aside>

      <div className="yh-auth-col flex items-center justify-center overflow-y-auto px-5 py-6">
        <div className="w-full max-w-md">
          <p className="yh-label">{eyebrow}</p>
          <h1 className="yh-title mt-2">{title}</h1>
          <p className="yh-auth-lede yh-body mt-3 text-yh-ink-2">{lede}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

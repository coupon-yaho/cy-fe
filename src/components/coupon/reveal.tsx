import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 스크롤 진입 연출.
 *
 * 화면에 들어올 때 한 번만 올라옵니다. 한 번만인 이유는, 스크롤을 되감을 때마다
 * 다시 사라지면 읽던 자리를 잃기 때문입니다.
 *
 * transform·opacity 만 씁니다 — 레이아웃 속성을 건드리면 매 프레임 리플로우가 납니다.
 * 움직임을 줄이는 설정에서는 관찰 자체를 하지 않고 바로 보여 줍니다.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** ms — 같은 줄의 카드들을 조금씩 밀어 계단처럼 올립니다 */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // 이미 화면 안(또는 바로 아래)이면 연출 없이 바로 보여 줍니다.
    // 안 그러면 첫 화면 아래쪽 섹션이 잠깐 비어 보입니다.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 1.15) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);

    // 안전장치 — 관찰이 어떤 이유로든 안 걸리면 콘텐츠가 영영 안 보입니다.
    // 연출은 없어도 되지만 내용이 없는 건 안 됩니다.
    const failsafe = window.setTimeout(() => setShown(true), 1400);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      } ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

/**
 * 숫자 카운트업.
 *
 * 재고·할인율처럼 "얼마나 큰가"가 메시지인 수치에만 씁니다.
 * 카운트다운(시계)에는 쓰지 않습니다 — 시계는 실제 시간이지 연출이 아닙니다.
 */
export function useCountUp(target: number, ms = 900): number {
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    // 값이 바뀌어 다시 불려도 처음부터 세지 않습니다 — 폴링마다 0 으로 떨어집니다
    if (started.current) {
      setN(target);
      return;
    }
    started.current = true;

    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // ease-out — 끝에서 천천히 멎어야 값이 확정된 느낌이 납니다
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return n;
}

/**
 * 값이 **줄어들 때만** 한 번 반응합니다.
 *
 * 선착순 서비스에서 재고가 줄었다는 건 사용자가 알아야 할 상태 변화입니다.
 * 15초마다 숫자만 조용히 갈리면 화면이 갱신된 줄 모르고, "지금 벌어지고 있다" 는
 * 이 서비스의 전제가 화면에서 사라집니다.
 *
 * 늘어날 때는 반응하지 않습니다 — 취소로 재고가 돌아오는 건 서두를 일이 아닙니다.
 * 반환값은 애니메이션을 다시 시작시키기 위한 key 입니다(같은 class 를 다시 붙여도
 * 브라우저는 재생하지 않습니다).
 */
export function useDropPulse(value: number): number {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (value < prev.current) setTick((t) => t + 1);
    prev.current = value;
  }, [value]);

  return tick;
}

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "coupon-yaho.theme.v1";

/**
 * 화면 밝기 설정.
 *
 * 기본은 "system" — 사이트가 임의로 한쪽을 강요하지 않습니다. 사용자가 고르면
 * 그 값이 OS 설정을 이깁니다.
 *
 * 실제 전환은 CSS 가 합니다. 여기서는 <html data-theme> 만 바꾸고, 스타일은
 * `:root[data-theme] .yh { color-scheme }` 와 light-dark() 가 처리합니다 —
 * 색을 자바스크립트로 계산하면 토큰표가 두 곳으로 갈립니다.
 *
 * data-theme 을 문서 루트에 두되 color-scheme 은 .yh 안에서만 바뀝니다.
 * 관리자 화면(관제)의 색 체계는 AGENTS.md §3 에서 OBS-16 몫으로 잠겨 있습니다.
 */
export function readThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/**
 * 첫 페인트 전에 실행되는 부트 스크립트.
 *
 * 리액트가 붙기를 기다리면 저장해 둔 값이 적용되기 전에 한 프레임이 그려져서
 * 다크를 고른 사용자에게 흰 화면이 번쩍입니다. <head> 에서 동기로 돌립니다.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  KEY,
)});if(v==="light"||v==="dark")document.documentElement.setAttribute("data-theme",v);}catch(e){}})();`;

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");

  // 서버 렌더와 값이 갈라지지 않도록 마운트 후에 읽습니다
  useEffect(() => setPref(readThemePref()), []);

  const choose = useCallback((next: ThemePref) => {
    setPref(next);
    apply(next);
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* 저장 실패는 무시합니다 — 이번 세션에만 적용됩니다 */
    }
  }, []);

  return { pref, choose };
}

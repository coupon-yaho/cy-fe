/**
 * 목 인증.
 *
 * 실제 로그인은 과제 범위 밖이라 클레임만 localStorage 에 보관합니다.
 * 백엔드는 JWT 대신 X-Member-Id · X-Membership-Grade · X-User-Role 헤더로
 * 사용자를 구분하므로(docs/CY-14), 세션이 담아야 할 값도 그 셋입니다.
 */
import type { MembershipGrade } from "./coupon/types";

export type Role = "USER" | "ADMIN";

export interface Session {
  /** X-Member-Id 로 나가는 값 */
  memberId: number;
  nickname: string;
  /** X-Membership-Grade */
  grade: MembershipGrade;
  /** X-User-Role — ADMIN 이면 /api/v1/admin/** 통과 */
  role: Role;
  issuedAt: number;
}

const KEY = "coupon-yaho.session.v2";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return typeof parsed.memberId === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
  else window.localStorage.removeItem(KEY);
}

/** 회원 번호는 닉네임에서 결정론적으로 만듭니다 — 새로고침해도 쿠폰함이 유지되도록. */
export function memberIdFor(nickname: string): number {
  let h = 2166136261;
  for (let i = 0; i < nickname.length; i += 1) {
    h ^= nickname.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 100000 + (Math.abs(h) % 800000);
}

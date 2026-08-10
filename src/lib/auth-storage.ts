// 목 인증 — 실제 JWT 대신 클레임을 localStorage에 보관합니다.
import type { Grade, Role } from "./domain";

export interface Session {
  userId: string;
  nickname: string;
  grade: Grade;
  role: Role;
  issuedAt: number;
}

const KEY = "coupon-yaho.session";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
  else window.localStorage.removeItem(KEY);
}

/** 목 JWT 클레임 (시연용 표시). */
export function mockClaims(s: Session) {
  return {
    sub: s.userId,
    grade: s.grade,
    role: s.role,
    exp: Math.floor(s.issuedAt / 1000) + 3600,
  };
}

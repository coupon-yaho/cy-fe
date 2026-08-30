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

/**
 * 시드가 넣어 둔 회원 수. <b>이 범위를 벗어나면 발급이 404 로 죽습니다.</b>
 *
 * <p>서버는 발급할 때 회원을 실제로 찾습니다({@code COUPON-309 회원을 찾을 수 없습니다}).
 * 예전에는 여기서 100,000~899,999 를 만들었는데 시드 회원은 1~10,000 이라 <b>겹칠 수가
 * 없었고, 그래서 발급이 한 번도 성공한 적이 없습니다</b> — 로그인·목록·상세는 다 되는데
 * 발급 버튼만 "회원 정보를 찾을 수 없습니다" 로 끝났습니다.
 *
 * <p>시드가 이 수를 바꾸면 여기도 같이 바뀌어야 합니다. 서버가 "쓸 수 있는 회원" 을
 * 알려 주는 경로가 생기면 이 상수는 지웁니다.
 */
const SEEDED_MEMBER_COUNT = 10000;

/**
 * 회원 번호는 닉네임에서 결정론적으로 만듭니다 — 새로고침해도 쿠폰함이 유지되도록.
 *
 * <p>범위는 <b>시드가 실제로 넣은 회원</b>에 맞춥니다. 목 로그인이라 아무 번호나 만들어도
 * 화면은 그려지지만, 발급은 서버가 회원을 찾으므로 없는 번호면 그 자리에서 404 입니다.
 */
export function memberIdFor(nickname: string): number {
  let h = 2166136261;
  for (let i = 0; i < nickname.length; i += 1) {
    h ^= nickname.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 1 + (Math.abs(h) % SEEDED_MEMBER_COUNT);
}

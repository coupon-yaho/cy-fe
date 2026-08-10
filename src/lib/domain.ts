// 도메인 타입 · 상수 — PRD §6 기준
// 실제 백엔드(Spring) 연동 시에도 이 타입은 그대로 사용합니다.

export type Grade = "WELCOME" | "SILVER" | "GOLD" | "VIP";
export type Role = "USER" | "ADMIN";
export type PolicyType = "RATE_CAP" | "FLAT" | "DATA";
export type CouponStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type IssuanceStatus = "ISSUED" | "USED" | "CANCELLED" | "EXPIRED";
export type EngineVersion = "v1" | "v2" | "v3";

export const GRADE_BIT: Record<Grade, number> = {
  WELCOME: 1,
  SILVER: 2,
  GOLD: 4,
  VIP: 8,
};

export const MASK_ALL = 15;
export const MASK_SILVER_UP = 14;
export const MASK_GOLD_UP = 12;
export const MASK_VIP = 8;

export const GRADES: Grade[] = ["WELCOME", "SILVER", "GOLD", "VIP"];

export const GRADE_LABEL: Record<Grade, string> = {
  WELCOME: "웰컴",
  SILVER: "실버",
  GOLD: "골드",
  VIP: "VIP",
};

export const GRADE_SHARE: Record<Grade, number> = {
  WELCOME: 0.5,
  SILVER: 0.3,
  GOLD: 0.15,
  VIP: 0.05,
};

export const POLICY_LABEL: Record<PolicyType, string> = {
  RATE_CAP: "정률 + 상한",
  FLAT: "정액",
  DATA: "데이터",
};

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  SCHEDULED: "오픈 예정",
  OPEN: "진행 중",
  CLOSED: "마감",
};

export const ISSUANCE_STATUS_LABEL: Record<IssuanceStatus, string> = {
  ISSUED: "보유",
  USED: "사용 완료",
  CANCELLED: "취소",
  EXPIRED: "만료",
};

export const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

export function maskToGrades(mask: number): Grade[] {
  return GRADES.filter((g) => (mask & GRADE_BIT[g]) !== 0);
}

export function gradesToMask(grades: Grade[]): number {
  return grades.reduce((acc, g) => acc | GRADE_BIT[g], 0);
}

export function maskLabel(mask: number): string {
  if (mask === MASK_ALL) return "전체 등급";
  return maskToGrades(mask).map((g) => GRADE_LABEL[g]).join(" · ");
}

export function isEligible(mask: number, grade: Grade): boolean {
  return (mask & GRADE_BIT[grade]) !== 0;
}

export interface Brand {
  brandId: string;
  name: string;
  category: string;
  color: string;
  emoji: string;
}

export interface CouponTemplate {
  templateId: string;
  brandId: string;
  policyType: PolicyType;
  policyValue: number;
  policyCap: number | null;
  nthWeek: number; // 1~4
  dayOfWeek: number; // 0=일
  startTime: string; // "14:00"
  durationHours: number;
  stockPerOccurrence: number;
  eligibleGradesMask: number;
  active: boolean;
}

export interface Coupon {
  couponId: string;
  templateId: string | null;
  brandId: string;
  title: string;
  policyType: PolicyType;
  policyValue: number;
  policyCap: number | null;
  totalStock: number;
  issuedCount: number;
  usedCount: number;
  openAt: number;
  closeAt: number;
  eligibleGradesMask: number;
  status: CouponStatus;
}

export interface Issuance {
  issuanceId: string;
  couponId: string;
  userId: string;
  maskedUserId: string;
  grade: Grade;
  status: IssuanceStatus;
  issuedAt: number;
  usedAt: number | null;
  expiresAt: number;
}

export interface AppEvent {
  id: number;
  at: number;
  type: "ISSUE" | "USE" | "CANCEL_USE" | "CANCEL" | "EXPIRE" | "SYSTEM";
  couponId: string;
  maskedUserId: string;
  grade: Grade | null;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
  openAt?: number;
  requiredGrades?: Grade[];
}

/** PRD §11.2 응답 코드 → 사용자 안내 문구 */
export const ERROR_COPY: Record<string, string> = {
  STOCK_EXHAUSTED: "재고가 모두 소진되었습니다. 다음 브랜드 데이를 기다려 주세요.",
  ALREADY_ISSUED: "이미 발급받은 쿠폰입니다. 한 사람당 한 장만 받을 수 있어요.",
  GRADE_NOT_ELIGIBLE: "현재 등급으로는 참여할 수 없는 이벤트입니다.",
  NOT_OPENED: "아직 오픈 전입니다. 오픈 시각에 다시 시도해 주세요.",
  COUPON_CLOSED: "마감된 이벤트입니다.",
  COUPON_EXPIRED: "만료된 쿠폰입니다.",
  INVALID_TRANSITION: "지금 상태에서는 처리할 수 없는 요청입니다.",
  ENTRY_TOKEN_EXPIRED: "입장 토큰이 만료되었습니다. 처음부터 다시 시도해 주세요.",
  NO_ENTRY_TOKEN: "정상적인 입장 절차를 거쳐야 발급할 수 있습니다.",
  IDEMPOTENCY_KEY_REUSED: "중복 요청 키 충돌입니다.",
  TEMPORARILY_UNAVAILABLE: "일시적으로 처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다.",
};

export function describePolicy(
  policyType: PolicyType,
  value: number,
  cap: number | null,
): string {
  if (policyType === "RATE_CAP")
    return `${value}% 할인 (최대 ${cap?.toLocaleString("ko-KR")}원)`;
  if (policyType === "FLAT") return `${value.toLocaleString("ko-KR")}원 할인`;
  return `데이터 ${value}GB 제공`;
}

export function maskUserId(userId: string): string {
  if (userId.length <= 4) return `${userId.slice(0, 1)}***`;
  return `${userId.slice(0, 4)}${"*".repeat(Math.max(3, userId.length - 6))}${userId.slice(-2)}`;
}

/**
 * CY-1 (cy-be · origin/feature/CY-1) 실계약.
 *
 * 필드명 · 열거값 · 타입은 백엔드 DTO 와 1:1 입니다. 임의로 바꾸지 마세요.
 *   api/src/main/java/com/kafkick/api/coupon/dto/*.java
 *   core/src/main/java/com/kafkick/core/coupon/domain/*.java
 *
 * Instant 는 Jackson 기본 직렬화(ISO-8601 문자열)를 그대로 받습니다.
 * LocalTime 은 "HH:mm:ss" 문자열입니다.
 */

/* ── 열거형 ─────────────────────────────────────────── */

export type MembershipGrade = "WELCOME" | "SILVER" | "GOLD" | "VIP";
export type CouponPolicyType = "PERCENT_CAPPED" | "FIXED_AMOUNT";
export type IssuanceStatus = "ISSUED" | "USED" | "CANCELLED" | "EXPIRED";
export type IssuanceEventType = "ISSUE" | "USE" | "CANCEL_USE" | "CANCEL" | "EXPIRE";
export type CouponRoundStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type CouponDayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const GRADES: MembershipGrade[] = ["WELCOME", "SILVER", "GOLD", "VIP"];

/**
 * 등급 비트 — `grades.bit_value` 와 같은 값입니다.
 *
 * 회차의 참여 등급은 DB 에 `eligible_grades_mask tinyint` 하나로 들어 있습니다.
 * 화면은 배열이 편하고 계약은 마스크라, **HTTP 어댑터에서 한 번만 풉니다.**
 * 두 표현이 코드 여기저기서 섞이면 어느 쪽이 진짜인지 알 수 없게 됩니다.
 */
export const GRADE_BIT: Record<MembershipGrade, number> = {
  WELCOME: 1,
  SILVER: 2,
  GOLD: 4,
  VIP: 8,
};

/** 전체 등급 = 15. 실버 이상 = 14, 골드 이상 = 12, VIP 전용 = 8 */
export const MASK_ALL = 15;

export function maskToGrades(mask: number): MembershipGrade[] {
  return GRADES.filter((g) => (mask & GRADE_BIT[g]) !== 0);
}

export function gradesToMask(grades: MembershipGrade[]): number {
  return grades.reduce((m, g) => m | GRADE_BIT[g], 0);
}

/** 이 등급이 이 마스크에 포함되는가 */
export function isGradeEligible(mask: number, grade: MembershipGrade): boolean {
  return (mask & GRADE_BIT[grade]) !== 0;
}
export const DAYS_OF_WEEK: CouponDayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/* ── 공통 응답 봉투 ────────────────────────────────── */

export interface ErrorBody {
  status: number;
  code: string;
  message: string;
  requestId: string | null;
  timestamp: string;
}

export interface ResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ErrorBody | null;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/* ── 쿠폰 템플릿 · 관리자 ──────────────────────────────
   POST/GET/PUT/PATCH /api/v1/admin/coupon-templates       */

export interface CouponTemplateDetail {
  id: number;
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  validDays: number;
  nthWeek: number;
  dayOfWeek: CouponDayOfWeek;
  /** "HH:mm:ss" */
  startTime: string;
  durationHours: number;
  stockPerOccurrence: number;
  /** 계약 필드 — coupon_templates.eligible_grades_mask */
  eligibleGradesMask: number;
  /** 위 마스크를 어댑터가 푼 것 */
  eligibleGrades: MembershipGrade[];
  active: boolean;
}

export interface CouponTemplateWriteRequest {
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  validDays: number;
  nthWeek: number;
  dayOfWeek: CouponDayOfWeek;
  startTime: string;
  durationHours: number;
  stockPerOccurrence: number;
  eligibleGrades: MembershipGrade[];
}

/* ── 쿠폰 발급 · 사용 ──────────────────────────────── */

/** POST /api/v1/coupons/{couponRoundId}/issue → 201 */
export interface CouponIssueResponse {
  issuanceId: number;
  couponRoundId: number;
  code: string;
  status: IssuanceStatus;
  issuedAt: string;
  expiresAt: string;
}

/** POST /api/v1/coupons/{issuanceId}/use */
export interface CouponUseResponse {
  issuanceId: number;
  status: IssuanceStatus;
  orderId: number;
  discountAmount: number;
  usedAt: string;
}

/** POST /api/v1/coupons/{issuanceId}/cancel-use */
export interface CouponCancelUseResponse {
  issuanceId: number;
  status: IssuanceStatus;
  orderId: number;
  discountAmount: number;
  canceledAt: string;
}

/** POST /api/v1/coupons/{issuanceId}/cancel */
export interface CouponCancelResponse {
  issuanceId: number;
  status: IssuanceStatus;
  canceledAt: string;
}

/** GET /api/v1/coupons — 보유 쿠폰 한 건 */
export interface MemberCoupon {
  issuanceId: number;
  couponRoundId: number;
  code: string;
  status: IssuanceStatus;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  issuedAt: string;
  expiresAt: string;
  /** 활성 사용 시각. 쓰지 않았으면 null */
  usedAt: string | null;
  /** 활성 사용에서 실제로 깎인 금액. 명세의 최상위 discountAmount 입니다. */
  usedDiscountAmount: number | null;
  /** 사용을 붙인 주문 번호 */
  orderId: number | null;
}

/* ── 회차 예약 ─────────────────────────────────────────
   POST /api/v1/admin/coupon-templates/{couponTemplateId}/rounds

   템플릿(반복 규칙) 하나를 골라 **실제 회차 한 건**을 찍어 냅니다.
   재고는 템플릿의 stockPerOccurrence 로 백엔드가 알아서 초기화합니다.

   백엔드 검증(CouponRoundReservationService + 요청 DTO 실측):
     · 템플릿이 존재하고 active 여야 합니다
     · openAt 은 지금 이후여야 합니다
     · closeAt > openAt 이고 둘 사이가 24시간 이내여야 합니다
   위반하면 COUPON_ROUND-203, 시간이 겹치면 -202, 같은 일정이 있으면 -201. */

export interface CouponRoundReservationRequest {
  /** ISO 8601 (Instant) */
  openAt: string;
  /** ISO 8601 (Instant) */
  closeAt: string;
}

export interface CouponRoundReservation {
  id: number;
  templateId: number;
  brandId: number;
  name: string;
  openAt: string;
  closeAt: string;
  status: CouponRoundStatus;
}

/* ── 쿠폰 회차 조회 ────────────────────────────────────
   공개 목록과 단건 상세 응답을 화면에서 공통으로 사용하는 모델입니다. */

export interface CouponRoundView {
  id: number;
  templateId: number;
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  validDays: number;
  /** 계약 필드 — coupons.eligible_grades_mask */
  eligibleGradesMask: number;
  /** 위 마스크를 어댑터가 푼 것. 화면 전용이고 계약이 아닙니다. */
  eligibleGrades: MembershipGrade[];
  openAt: string;
  closeAt: string;
  status: CouponRoundStatus;
  /** coupon_stocks.total_quantity */
  totalQuantity: number;
  /** coupon_stocks.active_count — 점유된 재고 */
  activeCount: number;
}

/* ── 대기열 ────────────────────────────────────────────
   대기열은 cy-be 가 아니라 **cy-waiting 게이트웨이**가 답합니다. 게이트웨이는 cy-be
   앞에 서는 프록시라, 프론트가 부르는 주소는 그대로고 답하는 쪽만 달라집니다.

   그래서 "줄에 서는 문" 이 따로 없습니다 — `POST .../issue` 한 곳을 두드리고,
   자리가 있으면 201 로 쿠폰이 오고 없으면 202 로 번호표가 옵니다. 예전에는 여기
   `/entry` 가 있었는데 게이트웨이에 그런 경로가 없어 들어냈습니다. */

/** 대기 화면이 그리는 값. 게이트웨이가 주는 두 개가 전부입니다. */
export interface QueuePlace {
  /** 내 앞의 인원. 차례가 오면 0 입니다 (cy-waiting `QueueEntry.rank`). */
  position: number;
  /** 입장까지 남은 시간(초). 입장 처리가 멈추면 null 입니다. */
  etaSeconds: number | null;
}

/** POST .../issue 가 202 로 답한 것 — 자리가 없어 줄에 섰다는 뜻입니다 */
export interface QueuedResponse {
  admitted: false;
  queueToken: string;
  position: number;
  etaSeconds: number;
  queueMode: string;
  /** 자리를 비웠다가 다시 선 사람인가. 등록 응답에만 실립니다. */
  rejoined: boolean;
}

/** 발급 요청의 두 갈래. 상태 코드로만 갈리므로 호출부가 반드시 확인해야 합니다. */
export type IssueOutcome =
  { kind: "issued"; issuance: CouponIssueResponse } | { kind: "queued"; queued: QueuedResponse };

/**
 * GET /api/v1/coupons/{couponRoundId}/queue
 *
 * 게이트웨이가 네 가지로 답합니다. `CLOSED` 와 `SOLD_OUT` 을 안 다루면 줄이
 * 사라졌는데도 화면이 영영 폴링합니다.
 */
export type QueueResponse =
  | { status: "WAITING"; position: number; etaSeconds: number }
  | { status: "ADMITTED"; entryToken: string; expiresIn: number }
  /** 줄에서 빠졌습니다(이탈·만료). 다시 설 수 있습니다. */
  | { status: "CLOSED"; reason: string }
  /** 재고가 떨어졌습니다. 다시 서도 소용없습니다. */
  | { status: "SOLD_OUT"; reason: string };

/* ── 캘린더 ────────────────────────────────────────────
   GET /api/v1/calendar?from&to — 사양서 U2 가 새로 요구한 엔드포인트입니다.

   회차 목록(listRounds)과 나누는 이유: 목록은 "지금 근처"만 주고, 달력은 지난달·다음
   달을 봅니다. 그리고 지난달 칸에는 재고가 없습니다 — 그래서 재고 필드가 nullable 입니다.
   한 응답에 섞으면 화면이 없는 재고를 0 으로 그립니다. */

export interface CalendarEntry {
  templateId: number;
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  eligibleGradesMask: number;
  eligibleGrades: MembershipGrade[];
  /** ISO-8601 */
  openAt: string;
  closeAt: string;
  status: CouponRoundStatus;
  /** 지금 살아 있는 회차면 그 id. 아니면 null — 상세로 갈 수 없습니다 */
  couponRoundId: number | null;
  /** 살아 있는 회차일 때만 채워집니다 */
  totalQuantity: number | null;
  activeCount: number | null;
  queueActive: boolean;
}

/* ── 브랜드 데이 반복 일정 ─────────────────────────────
   GET /api/v1/brand-days

   "브랜드마다 정해진 주와 요일이 있다" 는 이 서비스의 규칙이고, 고객이 먼저 알고 싶어
   하는 정보입니다. 그런데 그 규칙은 `coupon_templates.nth_week / day_of_week /
   start_time` 에만 있고 회차 목록에는 없습니다 — 회차는 규칙이 만들어 낸 결과이지
   규칙 자체가 아닙니다. 그래서 별도로 내려받습니다.

   달력(/calendar)과 다른 점: 달력은 "이번 달 며칠"이고 이쪽은 "매달 몇째 주 무슨 요일"
   입니다. 달력은 특정 월에 매이지만 이건 안 매입니다. */

export interface BrandDay {
  templateId: number;
  brandId: number;
  name: string;
  /** 1~4 */
  nthWeek: number;
  dayOfWeek: CouponDayOfWeek;
  /** "HH:mm:ss" */
  startTime: string;
  durationHours: number;
  eligibleGradesMask: number;
  eligibleGrades: MembershipGrade[];
}

/* ── 표시용 라벨 · 파생 계산 ─────────────────────────── */

export const GRADE_LABEL: Record<MembershipGrade, string> = {
  WELCOME: "웰컴",
  SILVER: "실버",
  GOLD: "골드",
  VIP: "VIP",
};

export const ISSUANCE_STATUS_LABEL: Record<IssuanceStatus, string> = {
  ISSUED: "사용 가능",
  USED: "사용 완료",
  CANCELLED: "취소됨",
  EXPIRED: "기간 만료",
};

export const ROUND_STATUS_LABEL: Record<CouponRoundStatus, string> = {
  SCHEDULED: "오픈 예정",
  OPEN: "발급 중",
  CLOSED: "마감",
};

export const DAY_LABEL: Record<CouponDayOfWeek, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

export const NTH_WEEK_LABEL = ["", "첫째", "둘째", "셋째", "넷째"];

interface DiscountLike {
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
}

/** "40%" / "5,000원" — 자막에 크게 박히는 숫자 */
export function discountHeadline(c: DiscountLike): string {
  if (c.policyType === "PERCENT_CAPPED") return `${c.discountRate ?? 0}%`;
  return `${(c.discountAmount ?? 0).toLocaleString("ko-KR")}원`;
}

/** "최대 8,000원 할인" / "즉시 할인" — 헤드라인 아래 보조 설명 */
export function discountDetail(c: DiscountLike): string {
  if (c.policyType === "PERCENT_CAPPED") {
    return `최대 ${(c.maxDiscountAmount ?? 0).toLocaleString("ko-KR")}원 할인`;
  }
  return "결제 금액에서 바로 할인";
}

/** 실제 할인액 — PERCENT_CAPPED 는 상한을 넘지 않습니다 */
export function calcDiscount(c: DiscountLike, orderAmount: number): number {
  if (c.policyType === "FIXED_AMOUNT") {
    return Math.min(c.discountAmount ?? 0, orderAmount);
  }
  const raw = Math.floor((orderAmount * (c.discountRate ?? 0)) / 100);
  return Math.min(raw, c.maxDiscountAmount ?? raw, orderAmount);
}

export function gradesLabel(grades: MembershipGrade[]): string {
  if (grades.length === GRADES.length) return "전체 등급";
  const sorted = GRADES.filter((g) => grades.includes(g));
  const lowest = sorted[0];
  if (!lowest) return "참여 등급 없음";
  if (sorted.length > 1 && GRADES.indexOf(lowest) + sorted.length === GRADES.length) {
    return `${GRADE_LABEL[lowest]} 이상`;
  }
  return sorted.map((g) => GRADE_LABEL[g]).join(" · ");
}

/** 남은 재고 — CouponStock.remainingQuantity() */
export function remainingStock(
  round: Pick<CouponRoundView, "totalQuantity" | "activeCount">,
): number {
  return Math.max(0, round.totalQuantity - round.activeCount);
}

/** "14:00:00" → "14:00" */
export function trimSeconds(localTime: string): string {
  return localTime.slice(0, 5);
}

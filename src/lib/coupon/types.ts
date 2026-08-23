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
export type CouponPolicyType = "PERCENT_CAPPED" | "FIXED_AMOUNT" | "DATA_GRANT";
export type IssuanceStatus = "ISSUED" | "USED" | "CANCELLED" | "EXPIRED";
export type IssuanceEventType = "ISSUE" | "USE" | "CANCEL_USE" | "CANCEL" | "EXPIRE";
export type CouponRoundStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type CouponDayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const GRADES: MembershipGrade[] = ["WELCOME", "SILVER", "GOLD", "VIP"];

/**
 * 등급 비트 — `grades.bit_value` 와 같은 값입니다.
 *
 * 회차의 참여 등급은 DB 에 `eligible_grades_mask tinyint` 하나로 들어 있습니다.
 * 화면은 배열이 편하고 계약은 마스크라, **어댑터(mock · http)에서 한 번만 풉니다.**
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
  /** DATA_GRANT 전용. coupon_templates.data_grant_mb */
  dataGrantMb: number | null;
  /** 이 금액 미만 주문에는 쓸 수 없습니다. coupon_templates.min_order_amount */
  minOrderAmount: number | null;
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
  dataGrantMb: number | null;
  minOrderAmount: number | null;
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
  dataGrantMb: number | null;
  minOrderAmount: number | null;
  issuedAt: string;
  expiresAt: string;
  /** 활성 사용 시각. 쓰지 않았으면 null */
  usedAt: string | null;
  /** 활성 사용에서 실제로 깎인 금액. 명세의 최상위 discountAmount 입니다. */
  usedDiscountAmount: number | null;
  /** 사용을 붙인 주문 번호 */
  orderId: number | null;
}

/* ── 쿠폰 회차 조회 ────────────────────────────────────
   백엔드 미구현. CouponRound 도메인 레코드 필드 그대로 잡아 두었으므로
   컨트롤러가 붙으면 이 타입 그대로 씁니다. PRD 대기열 규약(§입장과 발급의 분리)도 같습니다. */

export interface CouponRoundView {
  id: number;
  templateId: number;
  brandId: number;
  name: string;
  policyType: CouponPolicyType;
  discountRate: number | null;
  maxDiscountAmount: number | null;
  discountAmount: number | null;
  dataGrantMb: number | null;
  minOrderAmount: number | null;
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
  /** 대기열이 켜져 있는 회차입니다. 꺼져 있으면 바로 발급됩니다. */
  queueActive: boolean;
}

/** 대기열에서 보여 줄 값 한 벌 */
export interface QueuePlace {
  /** 내 순번. 앞에 남은 사람 수와 같습니다. */
  position: number;
  /** 내 뒤에서 기다리는 사람 수 */
  behind: number;
  /** 이 회차에서 대기 중인 전체 인원 */
  totalWaiting: number;
  /** 입장까지 남은 시간(초). 입장 처리가 멈추면 null 입니다. */
  etaSeconds: number | null;
}

/** POST /api/v1/coupons/{couponRoundId}/entry — 200 입장 / 202 대기 */
export interface EntryResponse {
  admitted: boolean;
  entryToken: string | null;
  expiresIn: number | null;
  queueToken: string | null;
  place: QueuePlace | null;
}

/** GET /api/v1/coupons/{couponRoundId}/queue */
export interface QueueResponse {
  status: "WAITING" | "ADMITTED";
  place: QueuePlace | null;
  entryToken: string | null;
}

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
  dataGrantMb: number | null;
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
  dataGrantMb?: number | null;
}

/** 1024MB → "1GB", 500MB → "500MB" — 통신사 표기 관례를 따릅니다 */
function formatData(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024}GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb}MB`;
}

/** "40%" / "5,000원" — 자막에 크게 박히는 숫자 */
export function discountHeadline(c: DiscountLike): string {
  if (c.policyType === "PERCENT_CAPPED") return `${c.discountRate ?? 0}%`;
  if (c.policyType === "DATA_GRANT") return formatData(c.dataGrantMb ?? 0);
  return `${(c.discountAmount ?? 0).toLocaleString("ko-KR")}원`;
}

/** "최대 8,000원 할인" / "즉시 할인" — 헤드라인 아래 보조 설명 */
export function discountDetail(c: DiscountLike): string {
  if (c.policyType === "PERCENT_CAPPED") {
    return `최대 ${(c.maxDiscountAmount ?? 0).toLocaleString("ko-KR")}원 할인`;
  }
  // 데이터는 깎는 게 아니라 얹어 주는 것이라 "할인" 이라고 쓰지 않습니다.
  if (c.policyType === "DATA_GRANT") return "데이터 제공";
  return "결제 금액에서 바로 할인";
}

/** 실제 할인액 — PERCENT_CAPPED 는 상한을 넘지 않습니다 */
export function calcDiscount(c: DiscountLike, orderAmount: number): number {
  // 데이터 제공은 결제 금액을 깎지 않습니다 — 0 원 할인입니다.
  if (c.policyType === "DATA_GRANT") return 0;
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

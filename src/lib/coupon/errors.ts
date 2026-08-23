/**
 * CY-1 에러 코드 카탈로그.
 *
 *   core/.../exception/CommonErrorCode.java          COMMON-001~005
 *   core/.../coupon/exception/CouponTemplateErrorCode.java  COUPON-101~102
 *   core/.../coupon/exception/CouponRoundErrorCode.java     COUPON-201~202
 *   core/.../coupon/exception/CouponIssueErrorCode.java     COUPON-300~310
 *   core/.../coupon/exception/CouponUseErrorCode.java       COUPON-400~413
 *   core/.../coupon/exception/CouponExpirationErrorCode.java COUPON-414
 *   core/.../coupon/exception/CouponQueryErrorCode.java      COUPON-415
 *
 * 서버 메시지는 개발자용 서술입니다. 화면에는 여기 정의한 문구를 씁니다 —
 * 무슨 일이 있었는지, 다음에 무엇을 하면 되는지 두 줄로 나눕니다.
 */
import type { ErrorBody } from "./types";

export class CouponApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly serverMessage: string;

  constructor(body: ErrorBody) {
    super(body.message);
    this.name = "CouponApiError";
    this.status = body.status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.serverMessage = body.message;
  }
}

export function isCouponApiError(e: unknown): e is CouponApiError {
  return e instanceof CouponApiError;
}

interface Copy {
  /** 무슨 일이 일어났는가 */
  title: string;
  /** 다음에 무엇을 하면 되는가 — 없으면 안내를 생략합니다 */
  next?: string;
}

const COPY: Record<string, Copy> = {
  "COUPON-301": {
    title: "종료된 회차입니다",
    next: "다음 브랜드 데이를 확인해 주세요.",
  },
  "COUPON-302": { title: "아직 오픈 전입니다", next: "오픈 시각에 다시 눌러 주세요." },
  "COUPON-303": { title: "마감됐습니다", next: "다음 브랜드 데이를 확인해 주세요." },
  "COUPON-304": {
    title: "참여 등급이 아닙니다",
    next: "이 회차는 다른 등급만 발급받을 수 있습니다.",
  },
  // 발급을 취소한 회차도 같은 코드로 막힙니다. 두 경우를 다 덮는 문구여야 합니다.
  "COUPON-305": {
    title: "이미 발급받은 쿠폰입니다",
    next: "한 회차에 한 장까지 받을 수 있습니다. 쿠폰함에서 상태를 확인하세요.",
  },
  "COUPON-306": { title: "품절됐습니다", next: "다음 브랜드 데이를 확인해 주세요." },
  "COUPON-309": { title: "회원 정보를 찾을 수 없습니다", next: "다시 로그인해 주세요." },
  "COUPON-310": { title: "지금 상태에서는 처리할 수 없습니다" },

  "COUPON-401": { title: "쿠폰을 찾을 수 없습니다", next: "쿠폰함을 새로고침해 주세요." },
  "COUPON-402": { title: "본인 쿠폰만 쓸 수 있습니다" },
  "COUPON-403": { title: "사용 기한이 지났습니다", next: "만료된 쿠폰은 쓸 수 없습니다." },
  "COUPON-404": {
    title: "같은 키로 다른 요청이 처리됐습니다",
    next: "새로고침 후 다시 시도하세요.",
  },
  "COUPON-405": { title: "처리하고 있습니다", next: "잠시 후 다시 확인해 주세요." },
  "COUPON-409": { title: "취소할 사용 내역이 없습니다" },

  /* 템플릿·회차는 접두어가 다릅니다. 발급/사용은 COUPON- 이지만
     이 둘은 COUPON_TEMPLATE- · COUPON_ROUND- 입니다(백엔드 enum 실측).
     앞서 COUPON-101 처럼 적어 두어서 실서버가 붙으면 안내 문구가 안 잡혔습니다. */
  "COUPON_TEMPLATE-102": { title: "쿠폰 템플릿을 찾을 수 없습니다" },
  "COUPON_TEMPLATE-101": {
    title: "템플릿 값이 올바르지 않습니다",
    next: "정책·수량·일정 항목을 확인하세요.",
  },
  "COUPON_TEMPLATE-103": {
    title: "템플릿을 저장하지 못했습니다",
    next: "잠시 후 다시 시도해 주세요.",
  },
  "COUPON_ROUND-201": {
    title: "같은 일정의 회차가 이미 있습니다",
    next: "오픈 시각을 바꿔 주세요.",
  },
  "COUPON_ROUND-202": {
    title: "그 시간에 다른 발급이 예약돼 있습니다",
    next: "겹치지 않는 시각으로 옮겨 주세요.",
  },
  "COUPON_ROUND-203": {
    title: "예약 시각이 올바르지 않습니다",
    next: "오픈은 지금 이후, 마감은 오픈 뒤 24시간 안이어야 합니다.",
  },

  "COMMON-001": { title: "입력값을 확인해 주세요" },
  "COMMON-002": { title: "찾을 수 없습니다" },
  "COMMON-005": { title: "접근 권한이 없습니다", next: "관리자 계정으로 로그인하세요." },
  "COMMON-004": { title: "지금은 처리가 지연되고 있습니다", next: "잠시 후 다시 시도해 주세요." },
};

const NETWORK: Copy = {
  title: "서버에 연결하지 못했습니다",
  next: "네트워크를 확인하고 다시 시도하세요.",
};

const UNAVAILABLE: Copy = {
  title: "지금은 처리가 지연되고 있습니다",
  next: "잠시 후 다시 시도해 주세요.",
};

/** 5xx 는 코드별 문구를 두지 않고 하나로 묶습니다 — 사용자가 할 일이 같습니다. */
export function errorCopy(e: unknown): Copy {
  if (!isCouponApiError(e)) return NETWORK;
  const hit = COPY[e.code];
  if (hit) return hit;
  if (e.status >= 500) return UNAVAILABLE;
  return { title: e.serverMessage };
}

/**
 * 같은 요청을 그대로 다시 보내면 결과가 달라질 수 있는 오류인가.
 *
 * 이미 발급받았거나 품절된 회차는 몇 번을 눌러도 같은 답이 옵니다.
 * 그런 화면에 "다시 시도"를 두면 사용자를 헛되이 붙잡습니다.
 */
export function isRetryable(e: unknown): boolean {
  if (!isCouponApiError(e)) return true; // 네트워크 문제
  if (e.status >= 500) return true;
  return e.code === "COUPON-405" || e.code === "COMMON-004";
}

/** 토스트 한 줄로 합칠 때 */
export function errorLine(e: unknown): string {
  const { title, next } = errorCopy(e);
  return next ? `${title} — ${next}` : title;
}

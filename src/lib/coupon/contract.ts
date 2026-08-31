/**
 * 프론트가 호출하는 쿠폰 API 계약.
 *
 * HTTP 어댑터가 이 인터페이스를 구현합니다.
 * 화면은 이 인터페이스만 알고, 어느 쪽이 붙었는지 모릅니다.
 *
 * 백엔드에 없는 대기열 API도 HTTP 요청만 보냅니다. 실패했을 때 프론트 응답으로
 * 대체하지 않으므로, 서버가 구현되기 전에는 해당 화면이 실제 HTTP 오류를 표시합니다.
 */
import type {
  BrandDay,
  CouponRoundReservation,
  CouponRoundReservationRequest,
  CalendarEntry,
  CouponCancelResponse,
  CouponCancelUseResponse,
  CouponRoundView,
  CouponRoundStatus,
  CouponTemplateDetail,
  CouponTemplateWriteRequest,
  CouponUseResponse,
  IssueOutcome,
  IssuanceStatus,
  MemberCoupon,
  MembershipGrade,
  Page,
  QueueResponse,
} from "./types";

/** X-Member-Id · X-Member-Grade 헤더로 나가는 값 */
export interface MemberContext {
  memberId: number;
  grade: MembershipGrade;
}

export interface CouponApi {
  /**
   * GET /api/v1/coupon-rounds/public
   * 목록이 필요하지만 페이지를 직접 제어하지 않는 화면을 위한 편의 메서드입니다.
   */
  listRounds(): Promise<CouponRoundView[]>;
  /** GET /api/v1/coupon-rounds/public — 상태·회원 등급·페이지 조건을 서버에 전달합니다. */
  listRoundPage(params?: {
    status?: CouponRoundStatus | null;
    eligibleGrade?: MembershipGrade | null;
    page?: number;
    size?: number;
  }): Promise<Page<CouponRoundView>>;
  /** GET /api/v1/coupon-rounds/{couponRoundId} — 공개 쿠폰 회차 상세 */
  getRound(couponRoundId: number): Promise<CouponRoundView>;

  /** GET /api/v1/brand-days — 활성 템플릿의 브랜드 데이 반복 일정 */
  listBrandDays(): Promise<BrandDay[]>;

  /**
   * GET /api/v1/calendar?from&to — 기간 내 브랜드 데이 일정
   * from · to 는 "YYYY-MM-DD" 입니다.
   */
  listCalendar(from: string, to: string): Promise<CalendarEntry[]>;

  /**
   * GET /api/v1/coupons/{couponRoundId}/queue — 내 순번.
   *
   * <b>cy-waiting 게이트웨이가 직접 답합니다.</b> cy-be 에는 이 경로가 없어서,
   * 게이트웨이를 앞에 세우지 않으면 404 입니다.
   */
  pollQueue(
    couponRoundId: number,
    member: MemberContext,
    queueToken: string,
  ): Promise<QueueResponse>;

  /**
   * POST /api/v1/coupons/{couponRoundId}/issue → 201 발급 · 202 대기.
   *
   * 게이트웨이 없이 cy-be 만 두면 201 만 옵니다 — 그때는 `kind: "issued"` 한 갈래로만
   * 흐르므로, 대기열을 안 켠 상태에서도 이 함수를 그대로 씁니다.
   */
  issue(
    couponRoundId: number,
    member: MemberContext,
    idempotencyKey: string,
    entryToken?: string | null,
  ): Promise<IssueOutcome>;

  /** GET /api/v1/coupons?status=&page=&size= — MemberCouponController */
  listMyCoupons(
    member: MemberContext,
    params?: { status?: IssuanceStatus | null; page?: number; size?: number },
  ): Promise<Page<MemberCoupon>>;

  /** ✅ POST /api/v1/coupons/{issuanceId}/use */
  useCoupon(
    issuanceId: number,
    member: MemberContext,
    body: { orderAmount: number },
    idempotencyKey: string,
  ): Promise<CouponUseResponse>;

  /** ✅ POST /api/v1/coupons/{issuanceId}/cancel-use */
  cancelUse(
    issuanceId: number,
    member: MemberContext,
    idempotencyKey: string,
  ): Promise<CouponCancelUseResponse>;

  /** ✅ POST /api/v1/coupons/{issuanceId}/cancel */
  cancelIssue(
    issuanceId: number,
    member: MemberContext,
    idempotencyKey: string,
  ): Promise<CouponCancelResponse>;

  /**
   * POST /api/v1/admin/coupon-templates/{couponTemplateId}/rounds → 201
   *
   * 템플릿에서 회차 한 건을 예약합니다. 평소에는 배치
   * (CouponRoundGenerationScheduler)가 규칙대로 미리 찍어 두고,
   * 이 API 는 그 밖의 회차를 끼워 넣을 때 씁니다.
   */
  reserveRound(
    couponTemplateId: number,
    request: CouponRoundReservationRequest,
  ): Promise<CouponRoundReservation>;

  /** GET /api/v1/admin/coupon-templates */
  listTemplates(params?: { page?: number; size?: number }): Promise<Page<CouponTemplateDetail>>;
  /** GET /api/v1/admin/coupon-templates/{id} */
  getTemplate(couponTemplateId: number): Promise<CouponTemplateDetail>;
  /** POST /api/v1/admin/coupon-templates → 201 */
  createTemplate(request: CouponTemplateWriteRequest): Promise<CouponTemplateDetail>;
  /** PUT /api/v1/admin/coupon-templates/{id} */
  updateTemplate(
    couponTemplateId: number,
    request: CouponTemplateWriteRequest,
  ): Promise<CouponTemplateDetail>;
  /** PATCH /api/v1/admin/coupon-templates/{id}/activation */
  changeTemplateActivation(
    couponTemplateId: number,
    active: boolean,
  ): Promise<CouponTemplateDetail>;
}

/**
 * Idempotency-Key 헤더 값 — 상태 변경 요청마다 새로 만듭니다.
 *
 * <b>반드시 UUID v4 여야 합니다.</b> 서버가 형식을 강제하고, 아니면 발급 경로를
 * 타기도 전에 400(COUPON-300)으로 거절합니다 — 그 검사는 취향이 아니라 내부 마커를
 * 헤더로 밀어 넣는 것을 막는 방어입니다.
 *
 * 예전 폴백은 `idem-<시각>-<난수>` 였습니다. 그 값이 나가는 순간 요청이 통째로
 * 죽는데, 하필 그 폴백은 **`crypto.randomUUID` 가 없을 때만** 쓰입니다 — 그것은
 * 보안 컨텍스트(HTTPS 나 localhost)에서만 제공되므로, 사내 IP 로 HTTP 접속하는
 * 시연 같은 자리에서만 조용히 터집니다. 개발자 기계에서는 재현되지 않습니다.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // getRandomValues 는 보안 컨텍스트가 아니어도 있습니다. 그것마저 없으면
  // Math.random 으로 떨어지는데, 멱등키는 예측 불가일 필요가 없습니다 —
  // 같은 시도에 같은 값이면 되고 서로 다른 시도끼리만 안 겹치면 됩니다.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // `?? 0` 은 인덱스 접근을 undefined 가능으로 보는 검사기 때문입니다. 길이 16 을
  // 방금 잡았으므로 실제로 빌 수 없습니다.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // 버전 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // 변형 비트 — 서버가 [89ab] 를 요구합니다

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 프론트가 호출하는 쿠폰 API 계약.
 *
 * HTTP 어댑터가 이 인터페이스를 구현합니다.
 * 화면은 이 인터페이스만 알고, 어느 쪽이 붙었는지 모릅니다.
 *
 * ── 표시 (2026-08-24 실측) ──────────────────────────
 * 기준: cy-be `origin/feature/CY-1` a74cb0f. 컨트롤러·DTO 소스를 직접 읽었고,
 * "없음" 은 원격 브랜치 전체를 훑어 확인했습니다. origin/main 에는 쿠폰 컨트롤러가
 * 하나도 없고 CY-1 은 아직 main 에 머지되지 않았습니다 — 지금은 CY-1 이 통합 지점입니다.
 *
 *   ✅ 구현됨. 붙이면 그대로 동작합니다.
 *   ⚠️ 구현됐지만 **응답 필드가 모자랍니다.** 붙이면 화면 일부가 빕니다.
 *   ❌ 백엔드에 없습니다. 목만 응답합니다.
 *
 * ⚠️ 스키마에 테이블이 있다고 API 가 있는 것은 아닙니다. 한동안 이 파일이
 * 그렇게 적혀 있었습니다 — 표시를 고칠 때는 컨트롤러를 열어 보고 고치세요.
 */
import type {
  BrandDay,
  CouponRoundReservation,
  CouponRoundReservationRequest,
  CalendarEntry,
  CouponCancelResponse,
  CouponCancelUseResponse,
  CouponIssueResponse,
  CouponRoundView,
  CouponRoundStatus,
  CouponTemplateDetail,
  CouponTemplateWriteRequest,
  CouponUseResponse,
  EntryResponse,
  IssuanceStatus,
  MemberCoupon,
  MembershipGrade,
  Page,
  QueueResponse,
} from "./types";

/** X-Member-Id · X-Membership-Grade 헤더로 나가는 값 */
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

  /* 대기열 3종 — PRD 에는 있으나 어느 브랜치에도 구현이 없습니다.
     프론트가 지어낸 계약이 아니라 백엔드 일감이 남은 것입니다. */

  /** ❌ POST /api/v1/coupons/{couponRoundId}/entry */
  enterRound(couponRoundId: number, member: MemberContext): Promise<EntryResponse>;
  /** ❌ GET /api/v1/coupons/{couponRoundId}/queue */
  pollQueue(
    couponRoundId: number,
    member: MemberContext,
    queueToken: string,
  ): Promise<QueueResponse>;
  /** ❌ DELETE /api/v1/coupons/{couponRoundId}/queue — 대기를 취소하고 자리를 반납합니다 */
  leaveQueue(couponRoundId: number, member: MemberContext): Promise<void>;

  /** ✅ POST /api/v1/coupons/{couponRoundId}/issue → 201 */
  issue(
    couponRoundId: number,
    member: MemberContext,
    idempotencyKey: string,
    entryToken?: string | null,
  ): Promise<CouponIssueResponse>;

  /**
   * ⚠️ GET /api/v1/coupons?status=&page=&size= — MemberCouponController
   *
   * 있지만 응답이 `MemberCouponResponse`(11개 필드)라 아래가 안 옵니다.
   *   usedAt · usedDiscountAmount · orderId · dataGrantMb · minOrderAmount
   *
   * 앞의 셋이 없으면 쿠폰함의 "사용 2026.08.23 / 할인 10,000원 / 주문 88001" 세 줄이 빕니다.
   */
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
   * ✅ POST /api/v1/admin/coupon-templates/{couponTemplateId}/rounds → 201
   *
   * 템플릿에서 회차 한 건을 예약합니다. 평소에는 배치
   * (CouponRoundGenerationScheduler)가 규칙대로 미리 찍어 두고,
   * 이 API 는 그 밖의 회차를 끼워 넣을 때 씁니다.
   */
  reserveRound(
    couponTemplateId: number,
    request: CouponRoundReservationRequest,
  ): Promise<CouponRoundReservation>;

  /** ✅ GET /api/v1/admin/coupon-templates */
  listTemplates(params?: { page?: number; size?: number }): Promise<Page<CouponTemplateDetail>>;
  /** ✅ GET /api/v1/admin/coupon-templates/{id} */
  getTemplate(couponTemplateId: number): Promise<CouponTemplateDetail>;
  /** ✅ POST /api/v1/admin/coupon-templates → 201 */
  createTemplate(request: CouponTemplateWriteRequest): Promise<CouponTemplateDetail>;
  /** ✅ PUT /api/v1/admin/coupon-templates/{id} */
  updateTemplate(
    couponTemplateId: number,
    request: CouponTemplateWriteRequest,
  ): Promise<CouponTemplateDetail>;
  /** ✅ PATCH /api/v1/admin/coupon-templates/{id}/activation */
  changeTemplateActivation(
    couponTemplateId: number,
    active: boolean,
  ): Promise<CouponTemplateDetail>;
}

/** Idempotency-Key 헤더 값 — 사용·취소 요청마다 새로 만듭니다. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 프론트가 호출하는 쿠폰 API 계약.
 *
 * 실서버 어댑터(http.ts)와 목 어댑터(mock.ts)가 같은 인터페이스를 구현합니다.
 * 화면은 이 인터페이스만 알고, 어느 쪽이 붙었는지 모릅니다.
 *
 * ✅ = CY-1 에 실제 구현된 엔드포인트
 * ⏳ = PRD 확정 · 백엔드 미구현 (목만 응답)
 */
import type {
  CouponCancelResponse,
  CouponCancelUseResponse,
  CouponIssueResponse,
  CouponRoundView,
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
  /** ⏳ GET /api/v1/coupon-rounds */
  listRounds(): Promise<CouponRoundView[]>;
  /** ⏳ GET /api/v1/coupon-rounds/{couponRoundId} */
  getRound(couponRoundId: number): Promise<CouponRoundView>;

  /** ⏳ POST /api/v1/coupons/{couponRoundId}/entry */
  enterRound(couponRoundId: number, member: MemberContext): Promise<EntryResponse>;
  /** ⏳ GET /api/v1/coupons/{couponRoundId}/queue */
  pollQueue(
    couponRoundId: number,
    member: MemberContext,
    queueToken: string,
  ): Promise<QueueResponse>;
  /** ⏳ DELETE /api/v1/coupons/{couponRoundId}/queue — 대기를 취소하고 자리를 반납합니다 */
  leaveQueue(couponRoundId: number, member: MemberContext): Promise<void>;

  /** ✅ POST /api/v1/coupons/{couponRoundId}/issue → 201 */
  issue(
    couponRoundId: number,
    member: MemberContext,
    entryToken?: string | null,
  ): Promise<CouponIssueResponse>;

  /** ✅ GET /api/v1/coupons?status=&page=&size= */
  listMyCoupons(
    member: MemberContext,
    params?: { status?: IssuanceStatus | null; page?: number; size?: number },
  ): Promise<Page<MemberCoupon>>;

  /** ✅ POST /api/v1/coupons/{issuanceId}/use */
  useCoupon(
    issuanceId: number,
    member: MemberContext,
    body: { orderId: number; orderAmount: number },
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

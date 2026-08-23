import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SectionHead } from "@/components/coupon/section-head";
import { CouponTicket } from "@/components/coupon/ticket";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import {
  ISSUANCE_STATUS_LABEL,
  calcDiscount,
  couponApi,
  errorLine,
  newIdempotencyKey,
  type IssuanceStatus,
  type MemberContext,
  type MemberCoupon,
} from "@/lib/coupon";

export const Route = createFileRoute("/my/coupons")({
  head: () => ({
    meta: [{ title: "내 쿠폰함 — 쿠폰 야~호" }],
  }),
  component: MyCoupons,
});

type Tab = "ALL" | IssuanceStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "ISSUED", label: ISSUANCE_STATUS_LABEL.ISSUED },
  { key: "USED", label: ISSUANCE_STATUS_LABEL.USED },
  { key: "CANCELLED", label: ISSUANCE_STATUS_LABEL.CANCELLED },
  { key: "EXPIRED", label: ISSUANCE_STATUS_LABEL.EXPIRED },
];

function MyCoupons() {
  const { session, ready } = useAuth();
  const { notify } = useNotifications();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("ALL");
  const [useTarget, setUseTarget] = useState<MemberCoupon | null>(null);

  const member: MemberContext | null = session
    ? { memberId: session.memberId, grade: session.grade }
    : null;

  const coupons = useQuery({
    queryKey: ["my-coupons", member?.memberId, tab],
    queryFn: () =>
      couponApi.listMyCoupons(member!, { status: tab === "ALL" ? null : tab, size: 50 }),
    enabled: !!member,
  });

  const rounds = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
  });

  const brandByRound = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of rounds.data ?? []) map.set(r.id, r.brandId);
    return map;
  }, [rounds.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["my-coupons"] });
    queryClient.invalidateQueries({ queryKey: ["rounds"] });
  };

  const useCoupon = useMutation({
    mutationFn: (input: { coupon: MemberCoupon; orderId: number; orderAmount: number }) =>
      couponApi.useCoupon(
        input.coupon.issuanceId,
        member!,
        { orderId: input.orderId, orderAmount: input.orderAmount },
        newIdempotencyKey(),
      ),
    onSuccess: (result, input) => {
      setUseTarget(null);
      refresh();
      toast.success(`${result.discountAmount.toLocaleString("ko-KR")}원 할인됐습니다`);
      notify(
        "쿠폰을 사용했습니다",
        `${input.coupon.name} · 주문 ${result.orderId} · ${result.discountAmount.toLocaleString("ko-KR")}원 할인`,
      );
    },
    onError: (error) => toast.error(errorLine(error)),
  });

  const cancelUse = useMutation({
    mutationFn: (coupon: MemberCoupon) =>
      couponApi.cancelUse(coupon.issuanceId, member!, newIdempotencyKey()),
    onSuccess: (_, coupon) => {
      refresh();
      toast.success("사용을 취소했습니다");
      notify("쿠폰이 다시 살아났습니다", `${coupon.name} · 사용 기한 안에 다시 쓸 수 있습니다`);
    },
    onError: (error) => toast.error(errorLine(error)),
  });

  const cancelIssue = useMutation({
    mutationFn: (coupon: MemberCoupon) =>
      couponApi.cancelIssue(coupon.issuanceId, member!, newIdempotencyKey()),
    onSuccess: (_, coupon) => {
      refresh();
      toast.success("발급을 취소했습니다");
      notify("쿠폰 발급을 취소했습니다", coupon.name);
    },
    onError: (error) => toast.error(errorLine(error)),
  });

  if (ready && !session) return <NeedLogin />;

  const rows = coupons.data?.content ?? [];
  const busy = useCoupon.isPending || cancelUse.isPending || cancelIssue.isPending;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-16">
      <SectionHead
        eyebrow="내 쿠폰함"
        title="발급받은 쿠폰"
        note="사용 기한이 지나면 자동으로 만료됩니다. 주문을 취소하면 쓴 쿠폰도 다시 살아납니다."
      />

      <div className="mt-12 flex flex-wrap gap-1.5 border-y border-yh-rule py-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`yh-body rounded-[3px] px-3.5 py-1.5 font-semibold transition-colors ${
              tab === t.key
                ? "bg-yh-navy text-yh-paper"
                : "text-yh-ink-2 hover:bg-yh-paper-2 hover:text-yh-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {coupons.isLoading ? (
        <div className="mt-12 space-y-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-[6px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyWallet tab={tab} />
      ) : (
        <ul className="mt-12 space-y-5">
          {rows.map((c) => (
            <li key={c.issuanceId}>
              <CouponTicket
                coupon={c}
                brandId={brandByRound.get(c.couponRoundId) ?? 0}
                dimmed={c.status === "EXPIRED" || c.status === "CANCELLED"}
                actions={
                  c.status === "ISSUED" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => cancelIssue.mutate(c)}
                        className="yh-small font-bold text-yh-ink-2 underline underline-offset-4 transition-colors hover:text-yh-accent disabled:opacity-40"
                      >
                        발급 취소
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setUseTarget(c)}
                        className="yh-btn-sm"
                      >
                        사용하기
                      </button>
                    </>
                  ) : c.status === "USED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => cancelUse.mutate(c)}
                      className="yh-small font-bold text-yh-ink-2 underline underline-offset-4 transition-colors hover:text-yh-accent disabled:opacity-40"
                    >
                      사용 취소
                    </button>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}

      <UseDialog
        coupon={useTarget}
        pending={useCoupon.isPending}
        onClose={() => setUseTarget(null)}
        onSubmit={(orderId, orderAmount) =>
          useCoupon.mutate({ coupon: useTarget!, orderId, orderAmount })
        }
      />
    </div>
  );
}

/* ── 사용 다이얼로그 ────────────────────────────────
   실제 결제 연동이 없으므로 주문 번호와 결제 금액을 직접 넣습니다.
   백엔드 CouponUseRequest 가 정확히 이 둘을 받습니다. */

function UseDialog({
  coupon,
  pending,
  onClose,
  onSubmit,
}: {
  coupon: MemberCoupon | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (orderId: number, orderAmount: number) => void;
}) {
  const [orderId, setOrderId] = useState("88213");
  const [orderAmount, setOrderAmount] = useState("42000");

  const amount = Number(orderAmount) || 0;
  const discount = coupon ? calcDiscount(coupon, amount) : 0;
  const payable = Math.max(0, amount - discount);
  const valid = Number(orderId) > 0 && amount > 0;

  return (
    <Dialog open={!!coupon} onOpenChange={(o) => !o && onClose()}>
      {/* 포탈로 body 에 붙으므로 .ed 를 직접 답니다 */}
      <DialogContent className="yh rounded-[6px] border-yh-navy bg-yh-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="yh-sub">쿠폰 사용</DialogTitle>
          <DialogDescription className="yh-small text-yh-ink-2">
            {coupon?.name} · 주문 번호와 결제 금액을 넣으면 할인액이 정해집니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <label className="block">
            <span className="yh-label">주문 번호</span>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="yh-input yh-num mt-2"
            />
          </label>

          <label className="block">
            <span className="yh-label">결제 금액</span>
            <div className="yh-input mt-2 flex items-center p-0 focus-within:border-yh-navy">
              <input
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="yh-num w-full bg-transparent px-3.5 py-3 focus:outline-none"
              />
              <span className="yh-small px-3.5 text-yh-ink-3">원</span>
            </div>
          </label>

          <dl className="yh-small border-t border-yh-rule pt-4">
            <div className="flex justify-between py-1.5">
              <dt className="text-yh-ink-2">결제 금액</dt>
              <dd className="yh-num">{amount.toLocaleString("ko-KR")}원</dd>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-yh-ink-2">쿠폰 할인</dt>
              <dd className="yh-num font-bold text-yh-accent">
                −{discount.toLocaleString("ko-KR")}원
              </dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-yh-rule pt-3">
              <dt className="font-bold">최종 결제</dt>
              <dd className="yh-figure-sm text-[1.75rem]">{payable.toLocaleString("ko-KR")}원</dd>
            </div>
          </dl>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="yh-body px-4 font-semibold text-yh-ink-2 underline-offset-4 hover:underline"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!valid || pending}
            onClick={() => onSubmit(Number(orderId), amount)}
            className="yh-btn"
          >
            {pending ? "처리 중" : "쿠폰 사용"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── 빈 화면 ───────────────────────────────────────── */

function EmptyWallet({ tab }: { tab: Tab }) {
  const copy: Record<Tab, string> = {
    ALL: "아직 발급받은 쿠폰이 없습니다",
    ISSUED: "지금 쓸 수 있는 쿠폰이 없습니다",
    USED: "사용한 쿠폰이 없습니다",
    CANCELLED: "취소한 쿠폰이 없습니다",
    EXPIRED: "만료된 쿠폰이 없습니다",
  };

  return (
    <div className="yh-card mt-12 px-6 py-16 text-center">
      {/* 사양서 §2 — 키비주얼(B)을 쓰도록 허용된 자리입니다. 폭 200px */}
      <img
        src="/hero-character.png"
        alt=""
        width={844}
        height={595}
        aria-hidden
        className="mx-auto w-[200px]"
      />
      <p className="yh-title mt-6">{copy[tab]}</p>
      <p className="yh-lede mt-4 text-yh-ink-2">지금 열려 있는 브랜드 데이를 확인해 보세요.</p>
      <Link to="/events" className="yh-btn mt-8">
        브랜드 데이 보기
      </Link>
    </div>
  );
}

function NeedLogin() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-28">
      <p className="yh-label">내 쿠폰함</p>
      <h1 className="yh-hero mt-3">로그인이 필요합니다</h1>
      <p className="yh-lede mt-4 max-w-[38ch] text-yh-ink-2">
        로그인하면 발급받은 쿠폰을 여기서 볼 수 있습니다.
      </p>
      <Link to="/login" className="yh-btn mt-9">
        로그인
      </Link>
    </div>
  );
}

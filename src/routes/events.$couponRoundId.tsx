import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { GradeList } from "@/components/coupon/grade-chip";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatDate, formatDateTime } from "@/components/coupon/timer";
import { QueueDialog } from "@/components/coupon/queue-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import {
  ROUND_STATUS_LABEL,
  brandOf,
  couponApi,
  discountDetail,
  discountHeadline,
  errorCopy,
  isCouponApiError,
  isRetryable,
  gradesLabel,
  remainingStock,
  type CouponIssueResponse,
  type CouponRoundView,
  type MemberContext,
  type QueuePlace,
} from "@/lib/coupon";

export const Route = createFileRoute("/events/$couponRoundId")({
  component: RoundDetail,
});

type Phase =
  | { kind: "idle" }
  | { kind: "entering" }
  | { kind: "queued"; queueToken: string; place: QueuePlace; startPosition: number }
  | { kind: "issuing"; fromQueue: boolean }
  | { kind: "done"; issuance: CouponIssueResponse }
  | { kind: "error"; error: unknown };

function RoundDetail() {
  const { couponRoundId } = useParams({ from: "/events/$couponRoundId" });
  const roundId = Number(couponRoundId);
  const { session } = useAuth();
  const { notify } = useNotifications();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: round, isLoading } = useQuery({
    queryKey: ["round", roundId],
    queryFn: () => couponApi.getRound(roundId),
    refetchInterval: phase.kind === "idle" ? 5_000 : false,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const runIssue = useCallback(
    async (member: MemberContext, entryToken: string | null, fromQueue = false) => {
      setPhase({ kind: "issuing", fromQueue });
      try {
        const issuance = await couponApi.issue(roundId, member, entryToken);
        setPhase({ kind: "done", issuance });
        notify(
          "쿠폰이 발급됐습니다",
          `${round?.name ?? "브랜드 데이"} · ${formatDate(issuance.expiresAt)}까지 사용 가능`,
        );
        queryClient.invalidateQueries({ queryKey: ["round", roundId] });
        queryClient.invalidateQueries({ queryKey: ["rounds"] });
        queryClient.invalidateQueries({ queryKey: ["my-coupons"] });
      } catch (error) {
        setPhase({ kind: "error", error });
      }
    },
    [notify, queryClient, round?.name, roundId],
  );

  const start = useCallback(async () => {
    if (!session) return;
    const member: MemberContext = { memberId: session.memberId, grade: session.grade };
    setPhase({ kind: "entering" });

    try {
      const entry = await couponApi.enterRound(roundId, member);

      if (entry.admitted) {
        await runIssue(member, entry.entryToken);
        return;
      }

      const queueToken = entry.queueToken!;
      const place = entry.place!;
      setPhase({ kind: "queued", queueToken, place, startPosition: place.position });

      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await couponApi.pollQueue(roundId, member, queueToken);
          if (status.status === "ADMITTED") {
            stopPolling();
            await runIssue(member, status.entryToken, true);
            return;
          }
          if (status.place) {
            setPhase((prev) => (prev.kind === "queued" ? { ...prev, place: status.place! } : prev));
          }
        } catch (error) {
          stopPolling();
          setPhase({ kind: "error", error });
        }
      }, 1000);
    } catch (error) {
      setPhase({ kind: "error", error });
    }
  }, [roundId, runIssue, session, stopPolling]);

  const cancelQueue = useCallback(() => {
    stopPolling();
    setPhase({ kind: "idle" });
    if (session) {
      void couponApi.leaveQueue(roundId, {
        memberId: session.memberId,
        grade: session.grade,
      });
    }
  }, [roundId, session, stopPolling]);

  if (isLoading || !round) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-12">
        <Skeleton className="h-4 w-40 rounded-full" />
        {/* 실제 카드와 같은 폭·높이라야 값이 들어올 때 화면이 밀리지 않습니다 */}
        <Skeleton className="mt-8 h-[620px] rounded-2xl" />
      </div>
    );
  }

  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <nav className="t-body-sm mb-8 text-hig-muted">
        <Link to="/events" className="text-hig-link hover:underline">
          브랜드 데이
        </Link>
        <span className="mx-2">/</span>
        <span>{brand.name}</span>
      </nav>

      <RoundPanel
        round={round}
        remaining={remaining}
        phase={phase}
        onStart={start}
        onReset={() => setPhase({ kind: "idle" })}
      />

      <Terms round={round} />

      <QueueDialog
        open={phase.kind === "queued" || (phase.kind === "issuing" && phase.fromQueue)}
        campaign={round.name}
        place={phase.kind === "queued" ? phase.place : null}
        startPosition={phase.kind === "queued" ? phase.startPosition : 0}
        admitted={phase.kind === "issuing"}
        onCancel={cancelQueue}
      />
    </div>
  );
}

/* ── 회차 카드 ───────────────────────────────────────
   회차 정보와 발급 동작을 한 장에 담습니다. 남은 수량 바로 아래가
   사용자가 실제로 무언가를 하는 자리입니다. */

function RoundPanel({
  round,
  remaining,
  phase,
  onStart,
  onReset,
}: {
  round: CouponRoundView;
  remaining: number;
  phase: Phase;
  onStart: () => void;
  onReset: () => void;
}) {
  const brand = brandOf(round.brandId);

  return (
    <section className="surface-card p-8 sm:p-10">
      {round.status === "OPEN" ? (
        <p className="t-caption inline-flex items-center gap-1.5 font-semibold text-live">
          <span className="live-dot" />
          발급 중
        </p>
      ) : (
        <p className="t-caption font-semibold text-hig-muted">{ROUND_STATUS_LABEL[round.status]}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <BrandPlate brandId={round.brandId} size="md" />
        <p className="t-body-sm text-hig-muted">
          {brand.name} · {brand.category}
        </p>
      </div>

      <h1 className="t-hero mt-4">{round.name}</h1>

      <p className="t-tile mt-4">
        {discountHeadline(round)}
        <span className="t-body ml-3 align-middle text-hig-secondary">{discountDetail(round)}</span>
      </p>

      <div className="mt-10">
        <StockGauge remaining={remaining} total={round.totalQuantity} />
      </div>

      <div className="mt-8 border-t border-hairline pt-8">
        {phase.kind === "done" ? (
          <Issued issuance={phase.issuance} />
        ) : phase.kind === "error" ? (
          <Failed error={phase.error} onReset={onReset} />
        ) : (
          <Ready round={round} remaining={remaining} phase={phase} onStart={onStart} />
        )}
      </div>

      <dl className="t-body-sm mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-hairline pt-8">
        <Field label="오픈">{formatDateTime(round.openAt)}</Field>
        <Field label="마감">{formatDateTime(round.closeAt)}</Field>
        <Field label="사용 기한">발급일로부터 {round.validDays}일</Field>
        <Field label="참여 등급">{gradesLabel(round.eligibleGrades)}</Field>
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-hig-muted">{label}</dt>
      <dd className="num mt-0.5">{children}</dd>
    </div>
  );
}

function Ready({
  round,
  remaining,
  phase,
  onStart,
}: {
  round: CouponRoundView;
  remaining: number;
  phase: Phase;
  onStart: () => void;
}) {
  const { session } = useAuth();
  const soldOut = remaining <= 0;
  const busy = phase.kind !== "idle";

  if (!session) {
    return (
      <div>
        <h2 className="t-tile">로그인하면 발급받을 수 있습니다</h2>
        <p className="t-body mt-2 text-hig-secondary">
          등급에 따라 참여할 수 있는 회차가 다릅니다.
        </p>
        <Link to="/login" className="btn-primary mt-6">
          로그인하고 발급받기
        </Link>
      </div>
    );
  }

  if (round.status === "SCHEDULED") {
    return (
      <div>
        <p className="eyebrow">오픈까지</p>
        <p className="t-hero num mt-2">
          <Countdown target={Date.parse(round.openAt)} />
        </p>
        <p className="num t-body-sm mt-3 text-hig-muted">{formatDateTime(round.openAt)} 오픈</p>
        <p className="t-body mt-6 text-hig-secondary">
          오픈 시각이 되면 이 화면에서 바로 발급받을 수 있습니다.
        </p>
      </div>
    );
  }

  if (soldOut || round.status === "CLOSED") {
    return (
      <div>
        <h2 className="t-tile">{soldOut ? "모두 품절됐습니다" : "마감된 회차입니다"}</h2>
        <p className="t-body mt-2 text-hig-secondary">
          {soldOut
            ? `준비된 ${round.totalQuantity.toLocaleString("ko-KR")}장이 모두 나갔습니다.`
            : "마감 시각이 지났습니다."}
        </p>
        <Link to="/events" className="btn-outline mt-6">
          다른 브랜드 데이 보기
        </Link>
      </div>
    );
  }

  if (!round.eligibleGrades.includes(session.grade)) {
    return (
      <div>
        <h2 className="t-tile">참여 등급이 아닙니다</h2>
        <p className="t-body mt-2 text-hig-secondary">
          이 회차는 아래 등급만 발급받을 수 있습니다.
        </p>
        <div className="mt-4">
          <GradeList grades={round.eligibleGrades} />
        </div>
        <Link to="/events" className="btn-outline mt-6">
          참여할 수 있는 회차 보기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="t-body text-hig-secondary">
        {round.queueActive
          ? "지금은 순서대로 발급하고 있습니다. 누르면 순번을 받고, 차례가 되면 자동으로 발급됩니다."
          : "한 사람당 한 장입니다. 발급받은 쿠폰은 쿠폰함에서 확인하세요."}
      </p>

      <button type="button" onClick={onStart} disabled={busy} className="btn-primary mt-6 w-full">
        {phase.kind === "entering"
          ? "순번 확인 중"
          : phase.kind === "issuing"
            ? "발급 처리 중"
            : round.queueActive
              ? "대기열 입장"
              : "발급받기"}
      </button>
    </div>
  );
}

function Issued({ issuance }: { issuance: CouponIssueResponse }) {
  return (
    <div className="rise-in">
      <p className="t-caption font-semibold text-positive">발급 완료</p>

      <div className="mt-4 rounded-xl bg-hig-canvas p-5">
        <p className="eyebrow">쿠폰 번호</p>
        <p className="num t-body mt-2 font-semibold tracking-[0.14em]">
          {issuance.code.replace(/(.{4})/g, "$1 ").trim()}
        </p>
        <dl className="t-body-sm mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-5">
          <div>
            <dt className="text-hig-muted">발급 번호</dt>
            <dd className="num">{issuance.issuanceId}</dd>
          </div>
          <div>
            <dt className="text-hig-muted">사용 기한</dt>
            <dd className="num">{formatDate(issuance.expiresAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/my/coupons" className="btn-primary">
          쿠폰함 열기
        </Link>
        <Link to="/events" className="btn-outline">
          다른 회차 보기
        </Link>
      </div>
    </div>
  );
}

function Failed({ error, onReset }: { error: unknown; onReset: () => void }) {
  const { title, next } = errorCopy(error);
  const retry = isRetryable(error);
  const alreadyIssued = isCouponApiError(error) && error.code === "COUPON-305";

  return (
    <div>
      <h2 className="t-tile">{title}</h2>
      {next && <p className="t-body mt-2 text-hig-secondary">{next}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {retry ? (
          <>
            <button type="button" onClick={onReset} className="btn-primary">
              다시 시도
            </button>
            <Link to="/events" className="t-body text-hig-link hover:underline">
              다른 회차 보기
            </Link>
          </>
        ) : alreadyIssued ? (
          <>
            <Link to="/my/coupons" className="btn-primary">
              쿠폰함 열기
            </Link>
            <Link to="/events" className="t-body text-hig-link hover:underline">
              다른 회차 보기
            </Link>
          </>
        ) : (
          <Link to="/events" className="btn-primary">
            다른 회차 보기
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── 사용 조건 ───────────────────────────────────── */

function Terms({ round }: { round: CouponRoundView }) {
  const rules = [
    "한 사람당 한 장까지 발급받을 수 있습니다.",
    `발급일로부터 ${round.validDays}일 안에 써야 합니다.`,
    round.policyType === "PERCENT_CAPPED"
      ? `${round.discountRate}% 할인, 최대 ${(round.maxDiscountAmount ?? 0).toLocaleString("ko-KR")}원까지 깎입니다.`
      : `결제 금액에서 ${(round.discountAmount ?? 0).toLocaleString("ko-KR")}원이 바로 빠집니다.`,
    "주문을 취소하면 쿠폰이 다시 살아납니다.",
  ];

  return (
    <section className="mt-16 border-t border-hairline pt-10">
      <h2 className="eyebrow">사용 조건</h2>
      <ul className="t-body-sm mt-4 grid gap-x-12 gap-y-3 text-hig-secondary sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r} className="hairline-row pb-3">
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

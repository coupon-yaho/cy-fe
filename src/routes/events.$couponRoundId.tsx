import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { GradeList } from "@/components/coupon/grade-chip";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatDate, formatDateTime } from "@/components/coupon/timer";
import { QueueDialog } from "@/components/coupon/queue-dialog";
import { Sparkle } from "@/components/coupon/sparkle";
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
      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        <Skeleton className="h-4 w-40 rounded-[3px]" />
        {/* 실제 지면과 같은 폭·높이라야 값이 들어올 때 화면이 밀리지 않습니다 */}
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[420px] rounded-[6px]" />
          <Skeleton className="h-[340px] rounded-[6px]" />
        </div>
      </div>
    );
  }

  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <nav className="yh-small mb-9 text-yh-ink-3">
        <Link
          to="/events"
          className="font-semibold text-yh-navy underline-offset-4 hover:underline"
        >
          브랜드 데이
        </Link>
        <span className="mx-2">/</span>
        <span>{brand.name}</span>
      </nav>

      {/* 왼쪽은 읽는 지면, 오른쪽은 누르는 자리. 액션 패널을 붙여 두면
          아래로 내려가도 발급 버튼이 시야에서 사라지지 않습니다. */}
      <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-14">
        <div className="min-w-0">
          <RoundHead round={round} remaining={remaining} />
          <Terms round={round} />
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="yh-card p-6">
            {phase.kind === "done" ? (
              <Issued issuance={phase.issuance} />
            ) : phase.kind === "error" ? (
              <Failed error={phase.error} onReset={() => setPhase({ kind: "idle" })} />
            ) : (
              <Ready round={round} remaining={remaining} phase={phase} onStart={start} />
            )}
          </div>

          <dl className="yh-small mt-7 border-t border-yh-rule">
            <Field label="오픈">{formatDateTime(round.openAt)}</Field>
            <Field label="마감">{formatDateTime(round.closeAt)}</Field>
            <Field label="사용 기한">발급일로부터 {round.validDays}일</Field>
            <Field label="참여 등급">{gradesLabel(round.eligibleGrades)}</Field>
          </dl>
        </aside>
      </div>

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

/* ── 회차 머리 ───────────────────────────────────────
   할인과 남은 시간을 나란한 큰 수치로 둡니다. 홈 히어로와 같은 구조라
   화면을 옮겨 와도 눈이 같은 자리에서 같은 값을 찾습니다. */

function RoundHead({ round, remaining }: { round: CouponRoundView; remaining: number }) {
  const brand = brandOf(round.brandId);
  const urgent = remaining > 0 && remaining / round.totalQuantity <= 0.1;
  const closed = round.status === "CLOSED" || remaining <= 0;

  return (
    <section>
      {round.status === "OPEN" ? (
        <p className="yh-live">
          <span className="live-dot" />
          발급 중
        </p>
      ) : (
        <p className="yh-label">{ROUND_STATUS_LABEL[round.status]}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <BrandPlate brandId={round.brandId} size="md" />
        <p className="yh-small text-yh-ink-3">
          {brand.name} · {brand.category}
        </p>
      </div>

      <h1 className="yh-hero mt-5 max-w-[13em]">{round.name}</h1>

      <div className="mt-10 grid gap-y-8 border-t border-yh-rule pt-8 sm:grid-cols-2 sm:gap-x-10">
        <div>
          <p className="yh-label">할인</p>
          <p className="yh-figure mt-2.5">{discountHeadline(round)}</p>
          <p className="yh-small mt-3 text-yh-ink-2">{discountDetail(round)}</p>
        </div>
        <div>
          <p className="yh-label">{round.status === "SCHEDULED" ? "오픈까지" : "마감까지"}</p>
          <p className={`yh-figure mt-2.5 ${urgent && !closed ? "text-yh-accent" : ""}`}>
            {closed ? (
              "—"
            ) : (
              <Countdown
                target={Date.parse(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
              />
            )}
          </p>
          <p className="yh-small yh-num mt-3 text-yh-ink-2">
            {formatDateTime(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <StockGauge remaining={remaining} total={round.totalQuantity} />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-yh-rule py-3">
      <dt className="text-yh-ink-3">{label}</dt>
      <dd className="yh-num font-semibold">{children}</dd>
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
        <h2 className="yh-sub">로그인하면 발급받을 수 있습니다</h2>
        <p className="yh-body mt-2.5 text-yh-ink-2">등급에 따라 참여할 수 있는 회차가 다릅니다.</p>
        <Link to="/login" className="yh-btn mt-6 w-full">
          로그인하고 발급받기
        </Link>
      </div>
    );
  }

  if (round.status === "SCHEDULED") {
    return (
      <div>
        <p className="yh-label">오픈까지</p>
        <p className="yh-figure mt-2.5 text-[2.5rem]">
          <Countdown target={Date.parse(round.openAt)} />
        </p>
        <p className="yh-body mt-5 text-yh-ink-2">
          오픈 시각이 되면 이 화면에서 바로 발급받을 수 있습니다.
        </p>
      </div>
    );
  }

  if (soldOut || round.status === "CLOSED") {
    return (
      <div>
        <h2 className="yh-sub">{soldOut ? "모두 품절됐습니다" : "마감된 회차입니다"}</h2>
        <p className="yh-body mt-2.5 text-yh-ink-2">
          {soldOut
            ? `준비된 ${round.totalQuantity.toLocaleString("ko-KR")}장이 모두 나갔습니다.`
            : "마감 시각이 지났습니다."}
        </p>
        <Link to="/events" className="yh-btn-ghost mt-6 w-full">
          다른 브랜드 데이 보기
        </Link>
      </div>
    );
  }

  if (!round.eligibleGrades.includes(session.grade)) {
    return (
      <div>
        <h2 className="yh-sub">참여 등급이 아닙니다</h2>
        <p className="yh-body mt-2.5 text-yh-ink-2">이 회차는 아래 등급만 발급받을 수 있습니다.</p>
        <div className="mt-4">
          <GradeList grades={round.eligibleGrades} />
        </div>
        <Link to="/events" className="yh-btn-ghost mt-6 w-full">
          참여할 수 있는 회차 보기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="yh-body text-yh-ink-2">
        {round.queueActive
          ? "지금은 순서대로 발급하고 있습니다. 누르면 순번을 받고, 차례가 되면 자동으로 발급됩니다."
          : "한 사람당 한 장입니다. 발급받은 쿠폰은 쿠폰함에서 확인하세요."}
      </p>

      <button type="button" onClick={onStart} disabled={busy} className="yh-btn-live mt-6 w-full">
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
    <div className="yh-rise">
      {/* 사양서 §2 — 키비주얼(B)과 반짝임이 허용된 유일한 UI 자리입니다.
          "지금 이 순간이 특별하다"고 말하는 곳이 정확히 여기입니다. */}
      <div className="relative mb-5">
        <img
          src="/hero-character.png"
          alt=""
          width={844}
          height={595}
          aria-hidden
          className="mx-auto w-[220px]"
        />
        <Sparkle className="yh-twinkle absolute top-2 left-6" size={20} tone="yellow" />
        <Sparkle className="yh-twinkle absolute top-8 right-8" size={14} tone="peri" />
      </div>

      <p className="yh-label text-yh-good">발급 완료</p>

      <div className="mt-4 border-t border-yh-rule pt-4">
        <p className="yh-label">쿠폰 번호</p>
        <p className="yh-num yh-body mt-2 font-bold tracking-[0.16em]">
          {issuance.code.replace(/(.{4})/g, "$1 ").trim()}
        </p>
        <dl className="yh-small mt-5 space-y-2 border-t border-yh-rule pt-4">
          <div className="flex justify-between gap-3">
            <dt className="text-yh-ink-3">발급 번호</dt>
            <dd className="yh-num font-semibold">{issuance.issuanceId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-yh-ink-3">사용 기한</dt>
            <dd className="yh-num font-semibold">{formatDate(issuance.expiresAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Link to="/my/coupons" className="yh-btn w-full">
          쿠폰함 열기
        </Link>
        <Link to="/events" className="yh-btn-ghost w-full">
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
      <h2 className="yh-sub">{title}</h2>
      {next && <p className="yh-body mt-2.5 text-yh-ink-2">{next}</p>}

      <div className="mt-6 flex flex-col gap-2.5">
        {retry ? (
          <>
            <button type="button" onClick={onReset} className="yh-btn w-full">
              다시 시도
            </button>
            <Link to="/events" className="yh-btn-ghost w-full">
              다른 회차 보기
            </Link>
          </>
        ) : alreadyIssued ? (
          <>
            <Link to="/my/coupons" className="yh-btn w-full">
              쿠폰함 열기
            </Link>
            <Link to="/events" className="yh-btn-ghost w-full">
              다른 회차 보기
            </Link>
          </>
        ) : (
          <Link to="/events" className="yh-btn w-full">
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
    <section className="mt-14">
      <h2 className="yh-label yh-rule-head pt-4">사용 조건</h2>
      <ul className="mt-2">
        {rules.map((r) => (
          <li key={r} className="yh-body border-b border-yh-rule py-4 text-yh-ink-2">
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

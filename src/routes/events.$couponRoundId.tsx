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
      <div>
        {/* 실제 지면과 같은 순서·높이라야 값이 들어올 때 화면이 밀리지 않습니다 */}
        <section className="yh-deep pb-24">
          <div className="mx-auto w-full max-w-5xl px-5 pt-8">
            <Skeleton className="h-4 w-40 rounded-full bg-white/12" />
            <Skeleton className="mt-8 h-11 w-80 max-w-full rounded-xl bg-white/12" />
            <Skeleton className="mt-9 h-16 w-full max-w-lg rounded-xl bg-white/12" />
          </div>
        </section>
        <div className="mx-auto -mt-20 w-full max-w-5xl px-5">
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  const brand = brandOf(round.brandId);
  const remaining = remainingStock(round);

  return (
    <div>
      {/* 홈과 같은 리듬 — 어두운 띠가 회차를 소개하고, 흰 쿠폰이 그 위에 걸쳐
          "여기서 받는다" 를 말합니다. 앞선 시안은 전부 밝은 면이라 이 화면에서
          무엇이 주인공인지 알 수 없었고, 오른쪽 아래에 400px 짜리 빈 공간이 남았습니다. */}
      <section className="yh-deep yh-grain relative overflow-hidden pb-24">
        <div className="relative z-[1] mx-auto w-full max-w-5xl px-5 pt-8">
          <nav className="yh-small text-white/55">
            <Link
              to="/events"
              className="font-semibold text-white/85 underline-offset-4 hover:underline"
            >
              브랜드 데이
            </Link>
            <span className="mx-2">/</span>
            <span>{brand.name}</span>
          </nav>

          <RoundHead round={round} remaining={remaining} />
        </div>
      </section>

      <div className="relative z-[2] mx-auto -mt-20 w-full max-w-5xl px-5">
        <div className="yh-coupon grid gap-6 p-6 sm:p-7 lg:grid-cols-[1fr_auto_20rem] lg:items-stretch lg:gap-0">
          <div className="min-w-0 self-center">
            <StockGauge remaining={remaining} total={round.totalQuantity} />
            <dl className="yh-small mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
              <Field label="오픈">{formatDateTime(round.openAt)}</Field>
              <Field label="마감">{formatDateTime(round.closeAt)}</Field>
              <Field label="사용 기한">발급일로부터 {round.validDays}일</Field>
              <Field label="참여 등급">{gradesLabel(round.eligibleGrades)}</Field>
            </dl>
          </div>

          <div className="yh-tear-plain my-1 lg:hidden" />
          <div className="yh-tear-y-plain hidden lg:mx-9 lg:block" />

          <div className="flex flex-col justify-center">
            {phase.kind === "done" ? (
              <Issued issuance={phase.issuance} />
            ) : phase.kind === "error" ? (
              <Failed error={phase.error} onReset={() => setPhase({ kind: "idle" })} />
            ) : (
              <Ready round={round} remaining={remaining} phase={phase} onStart={start} />
            )}
          </div>
        </div>

        <Terms round={round} />
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
    <section className="mt-7">
      <div className="flex flex-wrap items-center gap-3">
        {round.status === "OPEN" ? (
          <span className="yh-live-on-navy">
            <span className="live-dot" />
            발급 중
          </span>
        ) : (
          <span className="yh-label text-white/50">{ROUND_STATUS_LABEL[round.status]}</span>
        )}
        <span className="flex items-center gap-2">
          <BrandPlate brandId={round.brandId} size="sm" />
          <span className="yh-small text-white/60">
            {brand.name} · {brand.category}
          </span>
        </span>
      </div>

      <h1 className="yh-hero mt-5 max-w-[13em] text-white">{round.name}</h1>

      <div className="mt-9 flex flex-wrap items-end gap-x-14 gap-y-7">
        <div>
          <p className="yh-label text-white/45">할인</p>
          <p className="yh-figure mt-1.5 text-white">{discountHeadline(round)}</p>
          <p className="yh-small mt-2 text-white/60">{discountDetail(round)}</p>
        </div>
        <div>
          <p className="yh-label text-white/45">
            {round.status === "SCHEDULED" ? "오픈까지" : "마감까지"}
          </p>
          <p
            className={`yh-figure mt-1.5 ${
              urgent && !closed ? "text-yh-accent-on-navy" : "text-white"
            }`}
          >
            {closed ? (
              "-"
            ) : (
              <Countdown
                target={Date.parse(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
              />
            )}
          </p>
          <p className="yh-small yh-num mt-2 text-white/60">
            {formatDateTime(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
          </p>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="yh-label">{label}</dt>
      <dd className="yh-num mt-1 font-semibold">{children}</dd>
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
    <section className="mt-12 border-t border-yh-rule pt-8 pb-16">
      {/* 네 줄에 각각 괘선을 그으면 표처럼 보이는데, 읽는 순서가 있는 목록이 아니라
          나란한 조건 네 개입니다. 두 칸으로 묶고 선은 위에 한 줄만 둡니다. */}
      <h2 className="yh-label">사용 조건</h2>
      <ul className="yh-body mt-4 grid gap-x-12 gap-y-2.5 text-yh-ink-2 sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r} className="flex gap-2.5">
            <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-yh-ink-3" aria-hidden />
            <span className="min-w-0">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

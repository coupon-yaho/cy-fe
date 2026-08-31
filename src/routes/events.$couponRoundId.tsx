import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { GradeList } from "@/components/coupon/grade-chip";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatClock, formatDate, formatDateTime } from "@/components/coupon/timer";
import { QueueDialog } from "@/components/coupon/queue-dialog";
import { Sparkle } from "@/components/coupon/sparkle";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import {
  ROUND_STATUS_LABEL,
  brandOf,
  couponApi,
  CouponApiError,
  discountDetail,
  discountHeadline,
  errorCopy,
  isCouponApiError,
  isRetryable,
  gradesLabel,
  newIdempotencyKey,
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
  /* 순서가 왔지만 **아직 발급하지 않은** 상태입니다.
     PRD 는 입장과 발급을 나눠 두었습니다 — "1번으로 입장했어도 170초 뒤에 누르면,
     500번으로 입장해 즉시 누른 사람이 먼저 받습니다." 자동으로 발급해 버리면
     입장 순서가 곧 발급 순서가 되어 그 정의가 무력해집니다. 버튼을 남깁니다. */
  | { kind: "admitted"; entryToken: string; expiresAt: number }
  /** entryToken 이 만료돼 슬롯을 반납한 상태 */
  | { kind: "expired" }
  | { kind: "issuing"; fromQueue: boolean }
  | { kind: "done"; issuance: CouponIssueResponse }
  | { kind: "error"; error: unknown };

/** PRD — entryToken TTL 180초. 서버가 expiresIn 을 주면 그 값이 우선입니다. */
const ENTRY_TTL_SECONDS = 180;

/* 폴링 중 매진을 만나면 이 오류로 바꿔 화면에 넘깁니다. 순번 조회는 매진을 오류가
   아니라 정상 응답(SOLD_OUT)으로 알려 주는데, 화면에는 이미 품절 문구가 COUPON-306
   으로 붙어 있습니다. 새 문구를 만드는 대신 그 자리로 보냅니다. */
const SOLD_OUT_ERROR = {
  status: 409,
  code: "COUPON-306",
  message: "수량이 모두 소진됐습니다.",
  requestId: null,
  timestamp: "",
} as const;

/* 대기열을 켜고 끄는 플래그가 없습니다. 켜는 주체가 **게이트웨이**이기 때문입니다 —
   앞에 cy-waiting 이 서 있으면 발급이 202 로 줄을 세우고, 없으면 cy-be 가 201 만
   돌려줍니다. 프론트는 두 경우에 같은 코드를 태우고 응답으로만 갈립니다.
   플래그를 두면 "서버는 줄을 세웠는데 화면은 안 켜진" 상태를 만들 수 있습니다. */

/* 대기 중 새로고침해도 순번이 유지되게 토큰을 남깁니다. 순번은 서버에 살아 있는데
   프론트가 토큰을 메모리에만 들고 있으면 잃어버립니다 — 줄에는 그대로 서 있으면서
   화면만 처음으로 돌아갑니다. */
const QUEUE_KEY = "coupon-yaho.queue.v1";

/* 토큰을 남깁니다. 예전에는 안 남기고 돌아올 때 `/entry` 를 다시 불러 받아 왔는데,
   게이트웨이에 그 경로가 없습니다. 그렇다고 발급을 다시 두드려 받아 올 수도 없습니다 —
   기다리는 사이에 자리가 났으면 그 요청이 **곧바로 쿠폰을 뽑아 버립니다.** 누르지도
   않았는데 발급되는 것이라, 순번 조회만으로 돌아오려면 토큰이 있어야 합니다. */
interface SavedQueue {
  roundId: number;
  memberId: number;
  queueToken: string;
}

function saveQueue(v: SavedQueue) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(v));
  } catch {
    /* 저장 실패는 무시합니다 — 이번 세션에서만 순번을 잃습니다 */
  }
}

function loadQueue(): SavedQueue | null {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SavedQueue) : null;
  } catch {
    return null;
  }
}

function clearQueue() {
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* 무시 */
  }
}

function RoundDetail() {
  const { couponRoundId } = useParams({ from: "/events/$couponRoundId" });
  const roundId = Number(couponRoundId);
  const { session } = useAuth();
  const { notify } = useNotifications();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const issueKeyRef = useRef(newIdempotencyKey());

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

  /* 순번을 1초마다 봅니다. PRD 가 SSE 를 쓰지 않기로 했습니다 —
     20,000 VU 부하 테스트에서 클라이언트가 먼저 죽기 때문입니다. */
  const watchQueue = useCallback(
    (member: MemberContext, queueToken: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await couponApi.pollQueue(roundId, member, queueToken);

          if (status.status === "ADMITTED") {
            stopPolling();
            clearQueue();
            /* 여기서 바로 발급하지 않습니다. 입장은 발급을 보장하지 않고,
               누르는 시점이 곧 선착순이라는 것이 PRD 의 정의입니다. */
            setPhase({
              kind: "admitted",
              entryToken: status.entryToken,
              expiresAt: Date.now() + (status.expiresIn || ENTRY_TTL_SECONDS) * 1000,
            });
            return;
          }

          /* 줄이 사라졌습니다. 이 둘을 안 다루면 화면이 영영 폴링합니다 —
             서버는 이미 답을 줬는데 프론트만 "대기 중" 으로 남습니다.
             다시 설 수 있는 CLOSED 는 처음 화면으로, 재고가 끝난 SOLD_OUT 은
             매진으로 보냅니다. */
          if (status.status === "CLOSED" || status.status === "SOLD_OUT") {
            stopPolling();
            clearQueue();
            setPhase(
              status.status === "SOLD_OUT"
                ? { kind: "error", error: new CouponApiError(SOLD_OUT_ERROR) }
                : { kind: "idle" },
            );
            return;
          }

          setPhase((prev) =>
            prev.kind === "queued"
              ? { ...prev, place: { position: status.position, etaSeconds: status.etaSeconds } }
              : prev,
          );
        } catch (error) {
          stopPolling();
          clearQueue();
          setPhase({ kind: "error", error });
        }
      }, 1000);
    },
    [roundId, stopPolling],
  );

  const runIssue = useCallback(
    async (member: MemberContext, entryToken: string | null, fromQueue = false) => {
      setPhase({ kind: "issuing", fromQueue });
      try {
        const result = await couponApi.issue(roundId, member, issueKeyRef.current, entryToken);

        /* 자리가 없어 줄에 섰습니다. 게이트웨이가 앞에 있을 때만 오는 갈래입니다. */
        if (result.kind === "queued") {
          const { queueToken, position, etaSeconds } = result.queued;
          const place: QueuePlace = { position, etaSeconds };
          saveQueue({ roundId, memberId: member.memberId, queueToken });
          setPhase({ kind: "queued", queueToken, place, startPosition: position });
          watchQueue(member, queueToken);
          return;
        }

        const issuance = result.issuance;
        clearQueue();
        setPhase({ kind: "done", issuance });
        notify(
          "issued",
          "쿠폰을 받았습니다",
          `${round?.name ?? "브랜드 데이"} · 사용 기한 ${formatDate(issuance.expiresAt)}`,
        );
        queryClient.invalidateQueries({ queryKey: ["round", roundId] });
        queryClient.invalidateQueries({ queryKey: ["rounds"] });
        queryClient.invalidateQueries({ queryKey: ["my-coupons"] });
      } catch (error) {
        clearQueue();
        setPhase({ kind: "error", error });
      }
    },
    [notify, queryClient, round?.name, roundId, watchQueue],
  );

  /* 새로고침 복귀. 저장해 둔 토큰으로 **순번만 조회합니다.**
     발급을 다시 두드려서 복귀하면 안 됩니다 — 자리가 났으면 그 요청이 그대로
     쿠폰을 뽑아 버립니다. 조회는 아무것도 소비하지 않습니다. */
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !session) return;
    const saved = loadQueue();
    if (!saved || saved.roundId !== roundId || saved.memberId !== session.memberId) return;
    resumedRef.current = true;

    const member: MemberContext = { memberId: session.memberId, grade: session.grade };
    const { queueToken } = saved;
    void (async () => {
      try {
        const status = await couponApi.pollQueue(roundId, member, queueToken);

        if (status.status === "ADMITTED") {
          clearQueue();
          setPhase({
            kind: "admitted",
            entryToken: status.entryToken,
            expiresAt: Date.now() + (status.expiresIn || ENTRY_TTL_SECONDS) * 1000,
          });
          return;
        }

        // 줄이 사라졌으면 기록만 지우고 처음 화면으로 둡니다.
        if (status.status !== "WAITING") {
          clearQueue();
          return;
        }

        const place: QueuePlace = { position: status.position, etaSeconds: status.etaSeconds };
        setPhase({ kind: "queued", queueToken, place, startPosition: status.position });
        watchQueue(member, queueToken);
      } catch {
        // 토큰이 만료됐거나 발급이 끝난 경우입니다. 조용히 기록만 지웁니다.
        clearQueue();
      }
    })();
  }, [roundId, session, watchQueue]);

  const start = useCallback(async () => {
    if (!session) return;
    const member: MemberContext = { memberId: session.memberId, grade: session.grade };
    setPhase({ kind: "entering" });

    /* 문이 하나입니다. 자리가 있으면 쿠폰이 오고 없으면 번호표가 오는데, 그 갈림은
       runIssue 안에서 응답을 보고 정합니다. */
    await runIssue(member, null);
  }, [runIssue, session]);

  /* 입장 토큰의 남은 시간. 1초마다 셉니다 — 서버가 이 시간을 넘기면 슬롯을 반납하므로
     화면도 같은 시점에 손을 떼야 사용자가 헛되이 누르지 않습니다. */
  const [entrySecondsLeft, setEntrySecondsLeft] = useState(0);
  useEffect(() => {
    if (phase.kind !== "admitted") return;
    const tick = () => {
      const left = Math.ceil((phase.expiresAt - Date.now()) / 1000);
      setEntrySecondsLeft(Math.max(0, left));
      if (left <= 0) setPhase({ kind: "expired" });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const issueFromQueue = useCallback(() => {
    if (phase.kind !== "admitted" || !session) return;
    void runIssue({ memberId: session.memberId, grade: session.grade }, phase.entryToken, true);
  }, [phase, runIssue, session]);

  /* 화면에서만 손을 뗍니다. **서버에 이탈 연산이 없습니다** — 게이트웨이의 QueuePort
     는 등록(enqueue)과 조회(status) 둘뿐이고, `DELETE .../queue` 는 경로만 맞아
     순번 조회 응답을 200 으로 돌려줍니다. 지웠다고 믿게 만드는 요청이라 안 보냅니다.
     자리는 토큰이 만료되면서 자연히 빠집니다. */
  const cancelQueue = useCallback(() => {
    stopPolling();
    clearQueue();
    setPhase({ kind: "idle" });
  }, [stopPolling]);

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
            ) : phase.kind === "expired" ? (
              <Expired onReset={() => setPhase({ kind: "idle" })} />
            ) : (
              <Ready round={round} remaining={remaining} phase={phase} onStart={start} />
            )}
          </div>
        </div>

        <Terms round={round} />
      </div>

      <QueueDialog
        open={
          phase.kind === "queued" ||
          phase.kind === "admitted" ||
          (phase.kind === "issuing" && phase.fromQueue)
        }
        campaign={round.name}
        place={phase.kind === "queued" ? phase.place : null}
        startPosition={phase.kind === "queued" ? phase.startPosition : 0}
        admitted={phase.kind === "admitted" ? { secondsLeft: entrySecondsLeft } : null}
        issuing={phase.kind === "issuing"}
        remaining={remaining}
        closeAt={round.closeAt}
        onIssue={issueFromQueue}
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
          <p className="yh-label text-white/55">할인</p>
          <p className="yh-figure mt-1.5 text-white">{discountHeadline(round)}</p>
          <p className="yh-small mt-2 text-white/60">{discountDetail(round)}</p>
        </div>
        {/* 끝난 회차에는 셀 시간이 없습니다. 그렇다고 "마감까지 -" 로 두면 아직
            세는 중인데 값을 못 읽은 것처럼 보입니다. 끝난 회차에서 이 자리가 답해야
            할 질문은 "언제 끝났나" 이므로 라벨과 값을 함께 바꿉니다. */}
        <div>
          <p className="yh-label text-white/55">
            {closed ? "마감" : round.status === "SCHEDULED" ? "오픈까지" : "마감까지"}
          </p>
          <p
            className={`yh-figure mt-1.5 ${
              urgent && !closed ? "text-yh-accent-on-navy" : "text-white"
            }`}
          >
            {closed ? (
              <span className="yh-num">{formatClock(round.closeAt)}</span>
            ) : (
              <Countdown
                target={Date.parse(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
              />
            )}
          </p>
          <p className="yh-small yh-num mt-2 text-white/60">
            {closed
              ? `${formatDate(round.closeAt)}${remaining <= 0 ? " · 수량이 떨어져 마감" : ""}`
              : formatDateTime(round.status === "SCHEDULED" ? round.openAt : round.closeAt)}
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

  /* 회차 상태를 로그인 여부보다 **먼저** 봅니다.
     반대로 두었더니 이미 끝난 회차에서 로그아웃 상태인 사람에게
     "로그인하면 발급받을 수 있습니다" 라고 말했습니다. 로그인해도 못 받습니다. */
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

  if (round.status === "SCHEDULED") {
    return (
      <div>
        <p className="yh-label">오픈까지</p>
        <p className="yh-figure mt-2.5 text-[2.5rem]">
          <Countdown target={Date.parse(round.openAt)} />
        </p>
        <p className="yh-body mt-5 text-yh-ink-2">
          {session
            ? "열리는 시각이 되면 이 화면에서 바로 받습니다."
            : "선착순이라 열린 뒤에 로그인하면 이미 늦습니다."}
        </p>
        {/* 아직 안 열린 회차에서 로그아웃 상태라면, 지금 할 수 있는 일이 하나 있습니다 */}
        {!session && (
          <Link
            to="/login"
            search={{ redirect: `/events/${round.id}` }}
            className="yh-btn mt-6 w-full"
          >
            로그인
          </Link>
        )}
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <h2 className="yh-sub">로그인해야 받을 수 있습니다</h2>
        <p className="yh-body mt-2.5 text-yh-ink-2">회차마다 받을 수 있는 등급이 다릅니다.</p>
        <Link
          to="/login"
          search={{ redirect: `/events/${round.id}` }}
          className="yh-btn mt-6 w-full"
        >
          로그인하고 발급받기
        </Link>
      </div>
    );
  }

  if (!round.eligibleGrades.includes(session.grade)) {
    return (
      <div>
        <h2 className="yh-sub">참여 등급이 아닙니다</h2>
        <p className="yh-body mt-2.5 text-yh-ink-2">이 회차는 아래 등급만 받습니다.</p>
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
        한 사람당 한 장입니다. 발급을 진행하면 서버가 즉시 입장 또는 대기 순번을 결정합니다.
      </p>

      <button type="button" onClick={onStart} disabled={busy} className="yh-btn-live mt-6 w-full">
        {phase.kind === "entering"
          ? "순번 확인 중"
          : phase.kind === "issuing"
            ? "발급 처리 중"
            : "발급 진행"}
      </button>
    </div>
  );
}

/* 입장 토큰이 180초를 넘긴 상태. 실패가 아니라 "자리를 반납했다" 입니다 —
   PRD 규칙 3: 이탈한 사용자가 슬롯을 붙들고 있지 않도록 만료시킵니다.
   그래서 사과하지 않고 다시 줄 설 수 있다고만 말합니다. */
function Expired({ onReset }: { onReset: () => void }) {
  return (
    <div>
      <h2 className="yh-sub">입장 시간이 지났습니다</h2>
      <p className="yh-body mt-2.5 text-yh-ink-2">
        3분 안에 누르지 않아 자리가 다음 사람에게 넘어갔습니다. 아직 수량이 남아 있으면 다시 줄을 설
        수 있습니다.
      </p>
      <button type="button" onClick={onReset} className="yh-btn mt-6 w-full">
        다시 대기하기
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
    "한 사람당 한 장입니다.",
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

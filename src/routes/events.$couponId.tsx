import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Countdown, formatDateTime } from "@/components/countdown";
import { CouponStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { getCoupon, getQueue, isApiError, postEntry, postIssue } from "@/lib/api";
import { describePolicy, maskLabel } from "@/lib/domain";

export const Route = createFileRoute("/events/$couponId")({
  head: () => ({
    meta: [
      { title: "쿠폰 발급 — 쿠폰 야~호" },
      { name: "description", content: "대기열 순번과 예상 시간을 확인하며 선착순 쿠폰을 발급받으세요." },
      { property: "og:title", content: "쿠폰 발급 — 쿠폰 야~호" },
      { property: "og:description", content: "대기열 순번을 확인하며 선착순 쿠폰 발급." },
    ],
  }),
  component: EventDetail,
});

type Phase = "IDLE" | "QUEUED" | "ADMITTED" | "DONE";

function EventDetail() {
  const { couponId } = Route.useParams();
  const { session } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>("IDLE");
  const [entryToken, setEntryToken] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [eta, setEta] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data: coupon } = useQuery({
    queryKey: ["coupon", couponId, session?.userId ?? null],
    queryFn: () => getCoupon(couponId, session),
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (phase !== "QUEUED") return;
    const id = setInterval(async () => {
      const r = await getQueue(couponId, session);
      setPosition(r.position ?? 0);
      setEta(r.etaSeconds ?? 0);
      if (r.admitted && r.entryToken) {
        setEntryToken(r.entryToken);
        setPhase("ADMITTED");
        notify("입장 완료", "지금 발급 버튼을 눌러 쿠폰을 받으세요.");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, couponId, session, notify]);

  function handleError(e: unknown) {
    if (isApiError(e)) toast.error(e.code, { description: e.message });
    else toast.error("요청을 처리하지 못했습니다.");
  }

  async function enter() {
    if (!session) {
      toast.info("로그인이 필요합니다");
      navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    try {
      const r = await postEntry(couponId, session);
      if (r.admitted && r.entryToken) {
        setEntryToken(r.entryToken);
        setPhase("ADMITTED");
      } else {
        setPosition(r.position ?? 0);
        setEta(r.etaSeconds ?? 0);
        setPhase("QUEUED");
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    setBusy(true);
    try {
      await postIssue(couponId, entryToken, session);
      setPhase("DONE");
      toast.success("쿠폰이 발급되었습니다!");
      notify("쿠폰 발급 완료", `${coupon?.brand.name} 쿠폰이 쿠폰함에 담겼습니다.`);
      qc.invalidateQueries({ queryKey: ["my-issuances"] });
      qc.invalidateQueries({ queryKey: ["coupon", couponId] });
    } catch (e) {
      handleError(e);
      setPhase("IDLE");
      setEntryToken(null);
    } finally {
      setBusy(false);
    }
  }

  if (!coupon) {
    return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted-foreground">불러오는 중…</div>;
  }

  const pct = Math.round((coupon.issuedCount / coupon.totalStock) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link to="/events" className="text-sm text-muted-foreground hover:text-foreground">
        ← 브랜드 데이 목록
      </Link>

      <Card className="shadow-card mt-4">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{coupon.brand.emoji}</span>
              <div>
                <h1 className="text-2xl font-bold">{coupon.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {coupon.brand.name} · {maskLabel(coupon.eligibleGradesMask)}
                </p>
              </div>
            </div>
            <CouponStatusBadge status={coupon.status} />
          </div>

          <p className="text-2xl font-bold text-accent">
            {describePolicy(coupon.policyType, coupon.policyValue, coupon.policyCap)}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <p className="text-muted-foreground">오픈</p>
              <p className="num font-semibold">{formatDateTime(coupon.openAt)}</p>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <p className="text-muted-foreground">마감</p>
              <p className="num font-semibold">{formatDateTime(coupon.closeAt)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Progress value={pct} />
            <div className="num flex justify-between text-xs text-muted-foreground">
              <span>
                발급 {coupon.issuedCount.toLocaleString("ko-KR")} / {coupon.totalStock.toLocaleString("ko-KR")}장
              </span>
              <span>잔여 {coupon.remaining.toLocaleString("ko-KR")}장</span>
            </div>
          </div>

          {coupon.status === "SCHEDULED" && (
            <div className="rounded-xl border border-dashed border-border p-5 text-center">
              <p className="text-sm text-muted-foreground">오픈까지</p>
              <Countdown target={coupon.openAt} className="text-3xl font-bold" />
            </div>
          )}

          {phase === "QUEUED" && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-5 text-center">
              <p className="text-sm text-muted-foreground">대기열 진입 — 내 앞의 대기 인원</p>
              <p className="num text-4xl font-bold text-accent">{position.toLocaleString("ko-KR")}</p>
              <p className="num mt-1 text-sm text-muted-foreground">예상 대기 약 {eta}초</p>
            </div>
          )}

          {coupon.alreadyIssued || phase === "DONE" ? (
            <Button className="w-full" size="lg" asChild>
              <Link to="/my/coupons">내 쿠폰함에서 확인</Link>
            </Button>
          ) : phase === "ADMITTED" ? (
            <Button className="w-full" size="lg" disabled={busy} onClick={issue}>
              {busy ? "발급 처리 중…" : "지금 발급받기"}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              disabled={busy || phase === "QUEUED" || coupon.status !== "OPEN"}
              onClick={enter}
            >
              {coupon.status !== "OPEN"
                ? "지금은 참여할 수 없습니다"
                : phase === "QUEUED"
                  ? "대기 중…"
                  : busy
                    ? "입장 요청 중…"
                    : "입장하기"}
            </Button>
          )}

          {session && !coupon.eligible && (
            <p className="text-center text-sm text-destructive">
              현재 등급으로는 참여할 수 없는 이벤트입니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

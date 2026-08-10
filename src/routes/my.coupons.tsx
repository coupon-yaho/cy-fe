import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDateTime } from "@/components/countdown";
import { IssuanceStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getMyIssuances, isApiError, postIssuanceAction } from "@/lib/api";
import { describePolicy } from "@/lib/domain";

export const Route = createFileRoute("/my/coupons")({
  head: () => ({
    meta: [
      { title: "내 쿠폰함 — 쿠폰 야~호" },
      { name: "description", content: "발급받은 쿠폰의 사용 · 사용취소 · 발급취소를 관리하세요." },
      { property: "og:title", content: "내 쿠폰함 — 쿠폰 야~호" },
      { property: "og:description", content: "발급받은 쿠폰 사용 및 취소 관리." },
      { property: "og:url", content: "/my/coupons" },
    ],
    links: [{ rel: "canonical", href: "/my/coupons" }],
  }),
  component: MyCoupons,
});

function MyCoupons() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-issuances", session?.userId ?? null],
    queryFn: () => getMyIssuances(session),
  });

  async function act(id: string, action: "use" | "cancel-use" | "cancel", label: string) {
    try {
      await postIssuanceAction(id, action, `idem_${id}_${Date.now()}`, session);
      toast.success(`${label} 처리되었습니다`);
      qc.invalidateQueries({ queryKey: ["my-issuances"] });
    } catch (e) {
      if (isApiError(e)) toast.error(e.code, { description: e.message });
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground">로그인 후 쿠폰함을 확인할 수 있습니다.</p>
        <Button className="mt-4" asChild>
          <Link to="/login">로그인하기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">내 쿠폰함</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {session.nickname}님이 보유한 쿠폰 {data?.length ?? 0}장
      </p>

      <div className="mt-8 space-y-4">
        {isLoading && <p className="text-muted-foreground">불러오는 중…</p>}
        {!isLoading && (data ?? []).length === 0 && (
          <Card>
            <CardContent className="space-y-4 py-14 text-center">
              <p className="text-muted-foreground">아직 발급받은 쿠폰이 없습니다.</p>
              <Button asChild>
                <Link to="/events">브랜드 데이 보러가기</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {(data ?? []).map((i) => (
          <Card key={i.issuanceId} className="ticket-notch shadow-card">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="text-3xl">{i.brand.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{i.brand.name}</p>
                  <IssuanceStatusBadge status={i.status} />
                </div>
                <p className="text-lg font-bold text-accent">
                  {describePolicy(i.coupon.policyType, i.coupon.policyValue, i.coupon.policyCap)}
                </p>
                <p className="num text-xs text-muted-foreground">
                  발급 {formatDateTime(i.issuedAt)} · 만료 {formatDateTime(i.expiresAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {i.status === "ISSUED" && (
                  <>
                    <Button size="sm" onClick={() => act(i.issuanceId, "use", "사용")}>
                      사용하기
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(i.issuanceId, "cancel", "발급 취소")}
                    >
                      발급 취소
                    </Button>
                  </>
                )}
                {i.status === "USED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(i.issuanceId, "cancel-use", "사용 취소")}
                  >
                    사용 취소
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

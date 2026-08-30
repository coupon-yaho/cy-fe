import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LiveOverview } from "@/components/admin/live-overview";
import { Panel } from "@/components/admin/panel";
import { PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StateBadge } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import {
  QUEUE_MODE_LABEL,
  QUEUE_MODE_NOTE,
  adminApi,
  type QueueMode,
  type AdminOverviewQuery,
  type MemberInquiryResponse,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "운영 현황 — 쿠폰 야~호 관리자" }] }),
  component: OperationsOverview,
});

const FILTERS: { value: NonNullable<AdminOverviewQuery["filter"]>; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "ACTION", label: "조치 필요" },
  { value: "OPENING", label: "오픈 임박" },
  { value: "RUNNING", label: "진행 중" },
];

function OperationsOverview() {
  const [interval, setInterval] = useState<PollInterval>(1000);
  const [filter, setFilter] = useState<NonNullable<AdminOverviewQuery["filter"]>>("ALL");
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const query = useAdminPolling({
    pollKey: ["admin", "overview", filter, retryToken],
    queryFn: (signal) => adminApi.getOverview({ filter }, signal),
    intervalMs: interval,
  });

  const data = query.data;
  return (
    <>
      <PageHead
        title="운영 현황"
        controls={
          <>
            <select
              aria-label="회차 선택"
              value={selectedCouponId ?? ""}
              onChange={(e) => setSelectedCouponId(e.target.value ? Number(e.target.value) : null)}
              className="t-caption max-w-72 rounded-lg border border-hairline bg-hig-surface px-2.5 py-1.5"
            >
              <option value="">전체 회차</option>
              {(data?.couponRounds.value ?? []).map((couponRound) => (
                <option key={couponRound.couponId} value={couponRound.couponId}>
                  #{couponRound.couponId} {couponRound.couponName}
                </option>
              ))}
            </select>
            <Segmented value={filter} options={FILTERS} onChange={setFilter} />
            {query.isStale && <StateBadge state="STALE" />}
            <RefreshControl
              interval={interval}
              onIntervalChange={setInterval}
              snapshotAt={data?.snapshotAt}
            />
          </>
        }
      />

      {!data && query.error ? (
        <OverviewUnavailable onRetry={() => setRetryToken((value) => value + 1)} />
      ) : !data ? (
        <Loading />
      ) : (
        <LiveOverview
          data={data}
          selectedCouponId={selectedCouponId}
          filter={filter}
          queueControl={<QueueControl />}
          inquiryPanel={<InquiryPanel />}
        />
      )}
    </>
  );
}

export function OverviewUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Panel title="운영 현황을 불러오지 못했습니다" state="UNAVAILABLE">
      <p className="t-body-sm text-hig-muted">
        백엔드 연결과 관리자 권한을 확인한 뒤 다시 시도해 주세요.
      </p>
      <button type="button" onClick={onRetry} className="btn-compact mt-4">
        다시 시도
      </button>
    </Panel>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

const MODES: { value: QueueMode; label: string }[] = [
  { value: "OFF", label: QUEUE_MODE_LABEL.OFF },
  { value: "ADAPTIVE", label: QUEUE_MODE_LABEL.ADAPTIVE },
  { value: "ALWAYS", label: QUEUE_MODE_LABEL.ALWAYS },
];

function QueueControl() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin", "queue-settings"],
    queryFn: () => adminApi.getQueueSettings(),
  });
  const [threshold, setThreshold] = useState("");

  // 서버 값이 바뀌면 입력칸도 따라갑니다.
  useEffect(() => {
    if (settings.data) setThreshold(String(settings.data.adaptiveThresholdPerMinute));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (input: { mode: QueueMode; adaptiveThresholdPerMinute: number }) =>
      adminApi.updateQueueSettings({
        ...input,
        expectedRevision: settings.data!.revision,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["admin", "queue-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] });
      toast.success(`대기열을 ${QUEUE_MODE_LABEL[next.mode]}(으)로 바꿨습니다`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "설정을 저장하지 못했습니다"),
  });

  const current = settings.data;
  const thresholdChanged =
    !!current && Number(threshold) !== current.adaptiveThresholdPerMinute && Number(threshold) > 0;

  return (
    <Panel
      title="대기열 설정"
      hint="바꾸면 고객 화면에 바로 반영됩니다"
      action={
        current && <span className="t-caption num text-hig-muted">리비전 {current.revision}</span>
      }
    >
      {!current ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
          <div>
            <div className="inline-flex rounded-full bg-fill p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      mode: m.value,
                      adaptiveThresholdPerMinute: current.adaptiveThresholdPerMinute,
                    })
                  }
                  aria-pressed={current.mode === m.value}
                  className={`t-body-sm rounded-full px-3.5 py-1.5 transition-colors ${
                    current.mode === m.value
                      ? "bg-hig-surface font-semibold text-hig-fg"
                      : "text-hig-secondary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="t-caption mt-2 text-hig-muted">{QUEUE_MODE_NOTE[current.mode]}</p>

            {current.mode === "ADAPTIVE" && (
              <div className="mt-4 flex items-end gap-2">
                <label className="block">
                  <span className="eyebrow">혼잡 기준</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      className="num t-body-sm w-24 rounded-lg border border-hairline bg-hig-surface px-3 py-1.5 focus:border-hig-primary focus:outline-none"
                    />
                    <span className="t-caption text-hig-muted">건/분 이상</span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!thresholdChanged || save.isPending}
                  onClick={() =>
                    save.mutate({
                      mode: current.mode,
                      adaptiveThresholdPerMinute: Number(threshold),
                    })
                  }
                  className="btn-compact"
                >
                  저장
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="t-caption text-hig-muted">회차별 적용 상태</p>
            <p className="t-body-sm mt-2 text-hig-secondary">
              회차별 대기열 적용 여부는 고객의 입장 요청에 대한 서버 응답으로 확인됩니다. 공개 회차
              응답에는 이 상태가 포함되지 않습니다.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function InquiryPanel() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<MemberInquiryResponse | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const memberId = Number(input);
    if (!memberId) return;
    setPending(true);
    try {
      setResult(await adminApi.inquireMember(memberId));
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel
      title="회원 조회"
      hint="회원 ID 정확 일치"
      action={
        result && (
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setInput("");
            }}
            className="t-caption text-hig-link hover:underline"
          >
            지우기
          </button>
        )
      }
    >
      <form onSubmit={submit} className="flex max-w-md items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="회원 ID"
          className="num t-body-sm min-w-0 flex-1 rounded-lg border border-hairline bg-hig-surface px-3 py-1.5 focus:border-hig-primary focus:outline-none"
        />
        <button type="submit" disabled={!input || pending} className="btn-compact">
          {pending ? "조회 중" : "조회"}
        </button>
      </form>

      {result && (
        <div className="mt-5 grid gap-6 xl:grid-cols-[220px_1fr]">
          <div>
            <p className="t-body-sm font-semibold">
              <span className="num">m_{result.member.memberId}</span>
              <span className="ml-2 text-hig-muted">{result.member.grade}</span>
            </p>
            <dl className="t-caption mt-2 space-y-1 text-hig-secondary">
              {(
                [
                  ["보유", result.totals.held],
                  ["사용", result.totals.used],
                  ["만료", result.totals.expired],
                  ["취소", result.totals.cancelled],
                  ["발급 시도", result.totals.attempts],
                  ["실패", result.totals.failures],
                ] as [string, number][]
              ).map(([label, v]) => (
                <div key={label} className="flex justify-between">
                  <dt>{label}</dt>
                  <dd className="num font-semibold text-hig-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {result.rows.length === 0 ? (
            <p className="t-body-sm self-start text-hig-secondary">
              이 회원 ID 로 남은 이력이 없습니다. ID 를 다시 확인해 주세요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ops-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>캠페인</th>
                    <th>구분</th>
                    <th>결과</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={`${r.occurredAt}-${r.result}`}>
                      <td className="num whitespace-nowrap text-hig-muted">
                        {new Date(r.occurredAt).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td>{r.campaign}</td>
                      <td className="text-hig-secondary">
                        {r.kind === "ATTEMPT" ? "발급 시도" : "상태 변경"}
                      </td>
                      <td className="num">
                        {r.httpStatus !== null && (
                          <span className="mr-1.5 text-hig-muted">{r.httpStatus}</span>
                        )}
                        {r.result}
                      </td>
                      <td className="text-hig-muted">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

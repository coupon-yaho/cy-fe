import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SeriesChart, SeriesLegend, type SeriesSpec } from "@/components/admin/charts";
import { Panel, TablePanel } from "@/components/admin/panel";
import { PageHead, Segmented } from "@/components/admin/shell";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { formatClock } from "@/components/coupon/timer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi, type AdminAnalyticsResponse } from "@/lib/admin";
import {
  BRANDS,
  DAYS_OF_WEEK,
  DAY_LABEL,
  GRADES,
  GRADE_LABEL,
  NTH_WEEK_LABEL,
  ROUND_STATUS_LABEL,
  brandOf,
  couponApi,
  discountHeadline,
  errorLine,
  gradesLabel,
  remainingStock,
  trimSeconds,
  type CouponDayOfWeek,
  type CouponPolicyType,
  type CouponTemplateDetail,
  type CouponTemplateWriteRequest,
  type MembershipGrade,
} from "@/lib/coupon";

export const Route = createFileRoute("/admin/campaigns/")({
  head: () => ({ meta: [{ title: "캠페인 — 쿠폰 야~호 관리자" }] }),
  component: CampaignAdmin,
});

type Tab = "rounds" | "templates" | "analytics";

const TABS: { value: Tab; label: string }[] = [
  { value: "rounds", label: "회차" },
  { value: "templates", label: "템플릿" },
  { value: "analytics", label: "분석" },
];

function CampaignAdmin() {
  const [tab, setTab] = useState<Tab>("rounds");
  const [editing, setEditing] = useState<CouponTemplateDetail | "new" | null>(null);
  const [reserving, setReserving] = useState<CouponTemplateDetail | null>(null);

  return (
    <>
      <PageHead
        title="캠페인"
        controls={
          <>
            <Segmented value={tab} options={TABS} onChange={setTab} />
            {tab === "templates" && (
              <button type="button" onClick={() => setEditing("new")} className="btn-compact">
                템플릿 추가
              </button>
            )}
          </>
        }
      />

      {tab === "rounds" && <RoundTable />}
      {tab === "templates" && <TemplateTable onEdit={setEditing} onReserve={setReserving} />}
      {tab === "analytics" && <Analytics />}

      <TemplateEditor target={editing} onClose={() => setEditing(null)} />
      <RoundReserver target={reserving} onClose={() => setReserving(null)} />
    </>
  );
}

/* ── 회차 ────────────────────────────────────────── */

function RoundTable() {
  const { data, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <TablePanel title="쿠폰 회차" hint={`${data?.length ?? 0}건`}>
      <table className="ops-table min-w-[860px]">
        <thead>
          <tr>
            <th>브랜드 · 회차</th>
            <th>정책</th>
            <th>참여 등급</th>
            <th className="text-right">재고</th>
            <th>오픈</th>
            <th>상태</th>
            <th className="text-right">발급률</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((r) => {
            const remaining = remainingStock(r);
            const issuedRatio = r.totalQuantity > 0 ? r.activeCount / r.totalQuantity : 0;
            return (
              <tr key={r.id}>
                <td>
                  <Link
                    to="/admin/campaigns/$couponRoundId"
                    params={{ couponRoundId: String(r.id) }}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <BrandPlate brandId={r.brandId} size="sm" />
                    <span>
                      {r.name}
                      <span className="t-caption block text-hig-muted">
                        {brandOf(r.brandId).name}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="num">{discountHeadline(r)}</td>
                <td className="text-hig-secondary">{gradesLabel(r.eligibleGrades)}</td>
                <td className="num text-right">
                  {remaining.toLocaleString("ko-KR")}
                  <span className="text-hig-muted">
                    {" "}
                    / {r.totalQuantity.toLocaleString("ko-KR")}
                  </span>
                </td>
                <td className="num text-hig-secondary">
                  {new Date(r.openAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </td>
                <td>{ROUND_STATUS_LABEL[r.status]}</td>
                <td className="num text-right">
                  {r.status === "SCHEDULED" ? (
                    <span className="text-hig-muted">—</span>
                  ) : (
                    `${(issuedRatio * 100).toFixed(1)}%`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TablePanel>
  );
}

/* ── 템플릿 ──────────────────────────────────────── */

function TemplateTable({
  onEdit,
  onReserve,
}: {
  onEdit: (t: CouponTemplateDetail) => void;
  onReserve: (t: CouponTemplateDetail) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => couponApi.listTemplates({ size: 50 }),
  });

  const activation = useMutation({
    mutationFn: (input: { id: number; active: boolean }) =>
      couponApi.changeTemplateActivation(input.id, input.active),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      toast.success(`${t.name} · ${t.active ? "활성" : "비활성"}`);
    },
    onError: (e) => toast.error(errorLine(e)),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <TablePanel title="템플릿" hint="매월 반복 규칙">
      <table className="ops-table min-w-[900px]">
        <thead>
          <tr>
            <th>템플릿</th>
            <th>정책</th>
            <th>반복</th>
            <th className="text-right">회차당 수량</th>
            <th className="text-right">유효기간</th>
            <th>참여 등급</th>
            <th>활성</th>
            <th>
              <span className="sr-only">작업</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(data?.content ?? []).map((t) => (
            <tr key={t.id}>
              <td>
                <span className="flex items-center gap-2 font-medium">
                  <BrandPlate brandId={t.brandId} size="sm" />
                  <span>
                    {t.name}
                    <span className="t-caption block text-hig-muted">
                      {brandOf(t.brandId).name}
                    </span>
                  </span>
                </span>
              </td>
              <td className="num">{discountHeadline(t)}</td>
              <td className="num text-hig-secondary">
                {NTH_WEEK_LABEL[t.nthWeek]} {DAY_LABEL[t.dayOfWeek]} {trimSeconds(t.startTime)}
                <span className="block text-hig-muted">{t.durationHours}시간</span>
              </td>
              <td className="num text-right">{t.stockPerOccurrence.toLocaleString("ko-KR")}</td>
              <td className="num text-right text-hig-secondary">{t.validDays}일</td>
              <td className="text-hig-secondary">{gradesLabel(t.eligibleGrades)}</td>
              <td>
                <button
                  type="button"
                  disabled={activation.isPending}
                  onClick={() => activation.mutate({ id: t.id, active: !t.active })}
                  className={`t-caption rounded-full px-2.5 py-1 font-semibold ${
                    t.active ? "bg-positive/12 text-positive" : "bg-fill text-hig-muted"
                  }`}
                >
                  {t.active ? "활성" : "비활성"}
                </button>
              </td>
              <td className="text-right">
                <span className="inline-flex items-center gap-3">
                  {/* 규칙을 만들 수는 있는데 그 규칙으로 회차를 여는 길이 화면에
                      없었습니다. 백엔드에는 예약 API 가 이미 있습니다. */}
                  <button
                    type="button"
                    disabled={!t.active}
                    onClick={() => onReserve(t)}
                    className="t-body-sm text-hig-link hover:underline disabled:text-hig-muted disabled:no-underline"
                    title={t.active ? undefined : "비활성 템플릿으로는 회차를 예약할 수 없습니다"}
                  >
                    회차 예약
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    className="t-body-sm text-hig-link hover:underline"
                  >
                    수정
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

/* ── 회차 예약 ───────────────────────────────────────
   템플릿(반복 규칙) 하나로 실제 회차 한 건을 엽니다.
   POST /api/v1/admin/coupon-templates/{id}/rounds — 백엔드에 이미 있는 API인데
   화면에 동선이 없어서 만들어 둔 규칙을 열 방법이 없었습니다.

   평소에는 배치가 규칙대로 미리 찍습니다. 이 화면은 그 밖의 회차 —
   임시 이벤트나 놓친 회차를 끼워 넣는 자리입니다. */

/** datetime-local 입력이 읽는 형식. 초는 버립니다. */
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** 템플릿 규칙이 가리키는 다음 오픈 시각. 이미 지났으면 다음 달로 넘깁니다. */
function nextOpenFor(t: CouponTemplateDetail, now: number): number {
  const [h = 0, m = 0] = trimSeconds(t.startTime).split(":").map(Number);
  const dayIndex = DAYS_OF_WEEK.indexOf(t.dayOfWeek);
  const at = (year: number, month: number) => {
    const first = new Date(year, month, 1);
    // getDay 는 일=0 이고 DAYS_OF_WEEK 는 월=0 이라 맞춰 줍니다
    const firstIdx = (first.getDay() + 6) % 7;
    const day = 1 + ((dayIndex - firstIdx + 7) % 7) + (t.nthWeek - 1) * 7;
    return new Date(year, month, day, h, m, 0, 0).getTime();
  };
  const ref = new Date(now);
  const thisMonth = at(ref.getFullYear(), ref.getMonth());
  return thisMonth > now ? thisMonth : at(ref.getFullYear(), ref.getMonth() + 1);
}

const HOUR_MS = 3_600_000;
/** 백엔드 요청 DTO 의 @AssertTrue 와 같은 값입니다 */
const MAX_SPAN_HOURS = 24;

function RoundReserver({
  target,
  onClose,
}: {
  target: CouponTemplateDetail | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [openLocal, setOpenLocal] = useState("");
  const [closeLocal, setCloseLocal] = useState("");
  const [key, setKey] = useState<number | null>(null);

  /* 이미 잡힌 회차를 먼저 보여 줍니다.
     지금까지는 겹치는 시각을 넣고 **예약을 누른 뒤에야** 409 로 알았습니다.
     선점된 자리를 눈으로 보고 고르는 편이 맞습니다 — 겹침 판정은 브랜드를 가리지
     않으므로(백엔드 existsOverlappingSchedule) 그날 열리는 전부를 보여 줍니다. */
  const { data: rounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    enabled: !!target,
  });

  // 열릴 때마다 그 템플릿의 다음 회차 시각으로 채웁니다 — 규칙대로 여는 게 기본이고,
  // 다르게 열고 싶을 때만 고치면 됩니다.
  if (target && key !== target.id) {
    setKey(target.id);
    const open = nextOpenFor(target, Date.now());
    setOpenLocal(toLocalInput(open));
    setCloseLocal(toLocalInput(open + target.durationHours * HOUR_MS));
  }

  const openMs = openLocal ? new Date(openLocal).getTime() : NaN;
  const closeMs = closeLocal ? new Date(closeLocal).getTime() : NaN;
  const spanH = (closeMs - openMs) / HOUR_MS;

  /* 고른 날에 이미 잡힌 회차. 끝난 회차(CLOSED)는 자리를 비켜 주므로 뺍니다 —
     백엔드도 SCHEDULED·OPEN 만 셉니다. */
  const daySlots = useMemo(() => {
    if (!Number.isFinite(openMs)) return [];
    const day = new Date(openMs);
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const to = from + 24 * HOUR_MS;
    return (rounds ?? [])
      .filter((r) => r.status !== "CLOSED")
      .map((r) => ({ round: r, open: Date.parse(r.openAt), close: Date.parse(r.closeAt) }))
      .filter((r) => r.open < to && r.close > from)
      .sort((a, b) => a.open - b.open);
  }, [rounds, openMs]);

  /** 지금 고른 구간과 겹치는 회차 — 있으면 서버가 409 로 돌려보냅니다 */
  const clashes = daySlots.filter(
    (s) =>
      Number.isFinite(openMs) && Number.isFinite(closeMs) && openMs < s.close && closeMs > s.open,
  );

  // 백엔드가 400·409 로 돌려보낼 조건을 여기서 먼저 말해 줍니다.
  let problem: string | null = null;
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs))
    problem = "오픈·마감 시각을 채워 주세요.";
  else if (openMs < Date.now()) problem = "이미 지난 시각으로는 예약할 수 없습니다.";
  else if (closeMs <= openMs) problem = "마감은 오픈보다 뒤여야 합니다.";
  else if (spanH > MAX_SPAN_HOURS) problem = `한 회차는 ${MAX_SPAN_HOURS}시간을 넘길 수 없습니다.`;
  else if (clashes.length > 0)
    problem = `${brandOf(clashes[0]!.round.brandId).name} 회차와 시간이 겹칩니다.`;

  const reserve = useMutation({
    mutationFn: () =>
      couponApi.reserveRound(target!.id, {
        openAt: new Date(openMs).toISOString(),
        closeAt: new Date(closeMs).toISOString(),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast.success(`${r.name} 회차를 예약했습니다`);
      onClose();
    },
    onError: (e) => toast.error(errorLine(e)),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="t-tile">회차 예약</DialogTitle>
          <DialogDescription className="t-body-sm text-hig-secondary">
            {target ? (
              <>
                {brandOf(target.brandId).name} · {target.name} 규칙으로 회차 한 건을 엽니다. 재고{" "}
                {target.stockPerOccurrence.toLocaleString("ko-KR")}장은 템플릿에서 그대로 옵니다.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-5 py-2">
            <p className="t-body-sm rounded-xl bg-fill px-3.5 py-3 text-hig-secondary">
              규칙: 매달 {NTH_WEEK_LABEL[target.nthWeek]} {DAY_LABEL[target.dayOfWeek]}{" "}
              {trimSeconds(target.startTime)} · {target.durationHours}시간
              {/* 하루 한 브랜드로 오해하면 일정을 못 짭니다. 막히는 건 시간대뿐입니다. */}
              <span className="mt-1 block text-hig-muted">
                같은 날에 다른 브랜드를 이어서 열 수 있습니다. 시간대만 겹치지 않으면 됩니다.
              </span>
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="오픈">
                <input
                  type="datetime-local"
                  value={openLocal}
                  onChange={(e) => setOpenLocal(e.target.value)}
                  className="input-line"
                />
              </Field>
              <Field label="마감">
                <input
                  type="datetime-local"
                  value={closeLocal}
                  onChange={(e) => setCloseLocal(e.target.value)}
                  className="input-line"
                />
              </Field>
            </div>

            <p className="t-body-sm text-hig-secondary">
              {problem ? (
                <span className="font-semibold text-viz-critical">{problem}</span>
              ) : (
                <>
                  발급 시간 <span className="num font-semibold text-hig-fg">{spanH}시간</span> ·
                  최대 {MAX_SPAN_HOURS}시간
                </>
              )}
            </p>

            {/* 그날 이미 잡힌 자리. 네이버 예약처럼 선점된 시간을 눈으로 보고 고릅니다 —
                겹치는 값을 넣고 누른 뒤에 409 를 받는 것보다 낫습니다. */}
            {Number.isFinite(openMs) && (
              <div className="border-t border-hig-hairline pt-4">
                <p className="eyebrow">
                  {new Date(openMs).getMonth() + 1}월 {new Date(openMs).getDate()}일 예약 현황
                </p>
                {daySlots.length === 0 ? (
                  <p className="t-body-sm mt-2 text-hig-muted">
                    이 날은 아직 아무 회차도 잡히지 않았습니다.
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5">
                    {daySlots.map((s) => {
                      const hit = clashes.includes(s);
                      const mine = s.round.templateId === target.id;
                      return (
                        <li
                          key={s.round.id}
                          className={`t-body-sm flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${
                            hit ? "bg-viz-critical/10" : "bg-fill"
                          }`}
                        >
                          <BrandPlate brandId={s.round.brandId} size="sm" />
                          <span className="num shrink-0 font-semibold">
                            {formatClock(s.round.openAt)}-{formatClock(s.round.closeAt)}
                          </span>
                          <span className="min-w-0 truncate text-hig-secondary">
                            {brandOf(s.round.brandId).name}
                            {mine ? " · 같은 템플릿" : ""}
                          </span>
                          {hit && (
                            <span className="t-caption ml-auto shrink-0 font-bold text-viz-critical">
                              겹침
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="t-caption mt-2.5 text-hig-muted">
                  브랜드가 달라도 시간대가 겹치면 예약할 수 없습니다. 같은 날에 이어서 여는 것은
                  됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="t-body px-4 text-hig-link hover:underline"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!!problem || reserve.isPending}
            onClick={() => reserve.mutate()}
            className="btn-primary"
          >
            {reserve.isPending ? "예약하는 중" : "예약"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── 템플릿 편집 ─────────────────────────────────── */

const EMPTY: CouponTemplateWriteRequest = {
  brandId: 1,
  name: "",
  policyType: "PERCENT_CAPPED",
  discountRate: 20,
  maxDiscountAmount: 10000,
  discountAmount: null,
  dataGrantMb: null,
  minOrderAmount: null,
  validDays: 14,
  nthWeek: 1,
  dayOfWeek: "TUE",
  startTime: "14:00:00",
  durationHours: 4,
  stockPerOccurrence: 10000,
  eligibleGrades: [...GRADES],
};

function toForm(t: CouponTemplateDetail): CouponTemplateWriteRequest {
  const { id: _id, active: _active, ...rest } = t;
  return rest;
}

function TemplateEditor({
  target,
  onClose,
}: {
  target: CouponTemplateDetail | "new" | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => (target && target !== "new" ? toForm(target) : EMPTY), [target]);
  const [form, setForm] = useState<CouponTemplateWriteRequest>(initial);
  const [dirtyKey, setDirtyKey] = useState<string>("");

  const key = typeof target === "string" ? "new" : target ? `t${target.id}` : "";
  if (key !== dirtyKey) {
    setDirtyKey(key);
    setForm(initial);
  }

  const save = useMutation({
    mutationFn: (body: CouponTemplateWriteRequest) =>
      target && target !== "new"
        ? couponApi.updateTemplate(target.id, body)
        : couponApi.createTemplate(body),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      toast.success(`${t.name} 저장했습니다`);
      onClose();
    },
    onError: (e) => toast.error(errorLine(e)),
  });

  const set = <K extends keyof CouponTemplateWriteRequest>(
    k: K,
    v: CouponTemplateWriteRequest[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  /* 정책을 바꾸면 **다른 정책의 값은 비웁니다.** 남겨 두면 서버에 정률 값과
     정액 값이 동시에 실려 나가고, 나중에 어느 쪽이 진짜인지 알 수 없게 됩니다. */
  const setPolicy = (policyType: CouponPolicyType) =>
    setForm((f) => ({
      ...f,
      policyType,
      discountRate: policyType === "PERCENT_CAPPED" ? (f.discountRate ?? 20) : null,
      maxDiscountAmount: policyType === "PERCENT_CAPPED" ? (f.maxDiscountAmount ?? 10000) : null,
      discountAmount: policyType === "FIXED_AMOUNT" ? (f.discountAmount ?? 5000) : null,
      dataGrantMb: policyType === "DATA_GRANT" ? (f.dataGrantMb ?? 1024) : null,
    }));

  const toggleGrade = (g: MembershipGrade) =>
    setForm((f) => ({
      ...f,
      eligibleGrades: f.eligibleGrades.includes(g)
        ? f.eligibleGrades.filter((x) => x !== g)
        : [...f.eligibleGrades, g],
    }));

  const valid = form.name.trim().length > 0 && form.eligibleGrades.length > 0;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="t-tile">
            {target === "new" ? "템플릿 추가" : "템플릿 수정"}
          </DialogTitle>
          <DialogDescription className="t-body-sm text-hig-secondary">
            여기서 정한 정책이 회차를 만들 때 그대로 복사됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="브랜드">
              <select
                value={form.brandId}
                onChange={(e) => set("brandId", Number(e.target.value))}
                className="input-line"
              >
                {BRANDS.map((b) => (
                  <option key={b.brandId} value={b.brandId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="이름">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={100}
                className="input-line"
              />
            </Field>
          </div>

          <Field label="할인 정책">
            <div className="flex gap-2">
              {/* 정책은 세 종류입니다. 데이터가 빠져 있어서, 게임스테이션(1GB)처럼
                   DATA_GRANT 로 만들어진 템플릿을 열면 정책이 둘 중 하나로 보이고
                   그대로 저장하면 **원래 정책이 조용히 바뀌었습니다.** */
              (
                [
                  ["PERCENT_CAPPED", "정률 + 상한"],
                  ["FIXED_AMOUNT", "정액"],
                  ["DATA_GRANT", "데이터 제공"],
                ] as [CouponPolicyType, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPolicy(v)}
                  aria-pressed={form.policyType === v}
                  className={`t-body-sm rounded-full px-3.5 py-1.5 ${
                    form.policyType === v
                      ? "bg-hig-fg font-semibold text-hig-surface"
                      : "bg-fill text-hig-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {form.policyType === "PERCENT_CAPPED" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="할인율 (%)">
                <input
                  type="number"
                  value={form.discountRate ?? 0}
                  onChange={(e) => set("discountRate", Number(e.target.value))}
                  className="input-line num"
                />
              </Field>
              <Field label="할인 한도 (원)">
                <input
                  type="number"
                  value={form.maxDiscountAmount ?? 0}
                  onChange={(e) => set("maxDiscountAmount", Number(e.target.value))}
                  className="input-line num"
                />
              </Field>
            </div>
          ) : form.policyType === "DATA_GRANT" ? (
            <Field label="제공 데이터 (MB)">
              <input
                type="number"
                value={form.dataGrantMb ?? 0}
                onChange={(e) => set("dataGrantMb", Number(e.target.value))}
                className="input-line num"
              />
            </Field>
          ) : (
            <Field label="할인 금액 (원)">
              <input
                type="number"
                value={form.discountAmount ?? 0}
                onChange={(e) => set("discountAmount", Number(e.target.value))}
                className="input-line num"
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="N번째 주">
              <select
                value={form.nthWeek}
                onChange={(e) => set("nthWeek", Number(e.target.value))}
                className="input-line"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {NTH_WEEK_LABEL[n]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="요일">
              <select
                value={form.dayOfWeek}
                onChange={(e) => set("dayOfWeek", e.target.value as CouponDayOfWeek)}
                className="input-line"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABEL[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="오픈 시각">
              <input
                type="time"
                value={trimSeconds(form.startTime)}
                onChange={(e) => set("startTime", `${e.target.value}:00`)}
                className="input-line num"
              />
            </Field>
            <Field label="진행 시간">
              <input
                type="number"
                value={form.durationHours}
                onChange={(e) => set("durationHours", Number(e.target.value))}
                className="input-line num"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="회차당 수량">
              <input
                type="number"
                value={form.stockPerOccurrence}
                onChange={(e) => set("stockPerOccurrence", Number(e.target.value))}
                className="input-line num"
              />
            </Field>
            <Field label="유효기간 (일)">
              <input
                type="number"
                value={form.validDays}
                onChange={(e) => set("validDays", Number(e.target.value))}
                className="input-line num"
              />
            </Field>
          </div>

          <Field label="참여 등급">
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGrade(g)}
                  aria-pressed={form.eligibleGrades.includes(g)}
                  className={`t-body-sm rounded-full px-3.5 py-1.5 ${
                    form.eligibleGrades.includes(g)
                      ? "bg-hig-fg font-semibold text-hig-surface"
                      : "bg-fill text-hig-secondary"
                  }`}
                >
                  {GRADE_LABEL[g]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="t-body px-4 text-hig-link hover:underline"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate(form)}
            className="btn-primary"
          >
            {save.isPending ? "저장 중" : "저장"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

/* ── 분석 ────────────────────────────────────────── */

function Analytics() {
  const { data } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => adminApi.getAnalytics(),
  });

  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  const trendSeries: SeriesSpec[] = data.brandTrend.series.map((s, i) => ({
    key: `b${s.brandId}`,
    label: s.name,
    color: `var(--viz-${i + 1})`,
  }));

  const trendData = data.brandTrend.months.map((_, i) => {
    const row: Record<string, number> = { t: i };
    for (const s of data.brandTrend.series) row[`b${s.brandId}`] = s.values[i] ?? 0;
    return row as { t: number } & Record<string, number>;
  });

  return (
    <div className="space-y-4">
      <Panel title="브랜드별 월별 발급" hint="최근 12개월 · 천 건">
        <SeriesLegend series={trendSeries} />
        <div className="mt-3">
          <SeriesChart
            data={trendData}
            series={trendSeries}
            height={220}
            xFormat={(v) => data.brandTrend.months[v] ?? ""}
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="요일 × 시간"
          hint="최근 12주"
          action={
            <span className="t-caption text-hig-muted">
              최댓값 {WEEKDAYS[data.heatmap.peak.day]} {data.heatmap.peak.hour}시
            </span>
          }
        >
          <Heatmap heatmap={data.heatmap} />
        </Panel>

        <Panel title="상태 변경" hint="누적">
          <Funnel stages={data.funnel} />
        </Panel>
      </div>
    </div>
  );
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function Heatmap({ heatmap }: { heatmap: AdminAnalyticsResponse["heatmap"] }) {
  const max = Math.max(...heatmap.grid.flat());
  const steps = [
    "var(--viz-seq-100)",
    "var(--viz-seq-250)",
    "var(--viz-seq-350)",
    "var(--viz-seq-450)",
    "var(--viz-seq-550)",
    "var(--viz-seq-650)",
  ];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[460px] border-separate border-spacing-[2px]">
        <thead>
          <tr>
            <th>
              <span className="sr-only">작업</span>
            </th>
            {heatmap.hours.map((h) => (
              <th key={h} className="num t-caption pb-1 font-normal text-hig-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.grid.map((row, day) => (
            <tr key={day}>
              <th className="num t-caption pr-2 text-right font-normal text-hig-muted">
                {WEEKDAYS[day]}
              </th>
              {row.map((v, i) => {
                const idx = Math.min(steps.length - 1, Math.floor((v / max) * steps.length));
                const isPeak = day === heatmap.peak.day && heatmap.hours[i] === heatmap.peak.hour;
                return (
                  <td
                    key={i}
                    title={`${WEEKDAYS[day]} ${heatmap.hours[i]}시 · ${v}`}
                    className={`h-6 w-6 rounded-[3px] ${
                      isPeak ? "outline-2 outline-offset-1 outline-hig-fg" : ""
                    }`}
                    style={{ background: steps[idx] }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-caption mt-3 flex items-center gap-2 text-hig-muted">
        낮음
        <span className="flex gap-[2px]">
          {steps.map((s) => (
            <span key={s} className="size-3 rounded-[2px]" style={{ background: s }} />
          ))}
        </span>
        높음
      </p>
    </div>
  );
}

function Funnel({ stages }: { stages: AdminAnalyticsResponse["funnel"] }) {
  const steps = [
    "var(--viz-seq-250)",
    "var(--viz-seq-350)",
    "var(--viz-seq-450)",
    "var(--viz-seq-550)",
  ];

  return (
    <ul className="space-y-3">
      {stages.map((s, i) => (
        <li key={s.stage}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="t-body-sm font-medium">{s.label}</span>
            <span className="num t-body-sm">
              <b className="font-semibold">{s.count.toLocaleString("ko-KR")}</b>
              <span className="ml-2 text-hig-muted">{Math.round(s.ratio * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-fill">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, s.ratio * 100)}%`, background: steps[i] ?? steps[3] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

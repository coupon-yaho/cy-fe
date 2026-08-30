import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SeriesChart, SeriesLegend, type SeriesSpec } from "@/components/admin/charts";
import { Panel, TablePanel } from "@/components/admin/panel";
import { PageHead, Segmented } from "@/components/admin/shell";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { PageNavigation } from "@/components/coupon/page-navigation";
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

  return (
    <>
      <PageHead
        title="캠페인"
        /* 순서가 [세그먼트][추가 버튼] 이라 템플릿 탭에서 버튼이 나타나면 세그먼트가
           108px 왼쪽으로 밀렸습니다(실측). 탭은 화면의 뼈대라 내용에 따라 움직이면
           안 됩니다 — 누르려고 겨눈 자리가 누른 뒤에 옮겨집니다.
           세그먼트를 오른쪽 끝에 고정하고 버튼이 그 왼쪽에 나타나게 뒤집습니다. */
        controls={
          <>
            {tab === "templates" && (
              <button type="button" onClick={() => setEditing("new")} className="btn-compact">
                템플릿 추가
              </button>
            )}
            <Segmented value={tab} options={TABS} onChange={setTab} />
          </>
        }
      />

      {tab === "rounds" && <RoundTable />}
      {tab === "templates" && <TemplateTable onEdit={setEditing} />}
      {tab === "analytics" && <Analytics />}

      <TemplateEditor target={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/* ── 회차 ────────────────────────────────────────── */

/** "09.01 14:00". 회차에는 번호가 없어서(백엔드에 그런 필드가 없습니다), 이 시각이
    같은 브랜드의 다른 회차와 구분하는 유일한 단서입니다. */
function openShortLabel(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function RoundTable() {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["rounds", "admin", page],
    queryFn: () => couponApi.listRoundPage({ page, size: 10 }),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <>
      <TablePanel title="쿠폰 회차" hint={`총 ${data?.totalElements ?? 0}건`}>
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
            {(data?.content ?? []).map((r) => {
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
                          {brandOf(r.brandId).name} · {openShortLabel(r.openAt)}
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
                  <td className="num text-hig-secondary">{openShortLabel(r.openAt)}</td>
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
      <PageNavigation
        page={data?.page ?? page}
        totalPages={data?.totalPages ?? 0}
        totalElements={data?.totalElements}
        onChange={setPage}
      />
    </>
  );
}

/* ── 템플릿 ──────────────────────────────────────── */

function TemplateTable({ onEdit }: { onEdit: (t: CouponTemplateDetail) => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "templates", page],
    queryFn: () => couponApi.listTemplates({ page, size: 10 }),
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
    <>
      <TablePanel title="템플릿" hint={`매월 반복 규칙 · 총 ${data?.totalElements ?? 0}건`}>
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
                    {/* 예약은 별도 화면입니다. 다이얼로그에 넣었더니 그날 하루치만
                      보여 줄 수 있었는데, 빈 자리는 주 단위로 봐야 고를 수 있습니다. */}
                    {t.active ? (
                      <Link
                        to="/admin/campaigns/reserve"
                        search={{ template: t.id }}
                        className="t-body-sm text-hig-link hover:underline"
                      >
                        회차 예약
                      </Link>
                    ) : (
                      <span
                        className="t-body-sm text-hig-muted"
                        title="비활성 템플릿으로는 회차를 예약할 수 없습니다"
                      >
                        회차 예약
                      </span>
                    )}
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
      <PageNavigation
        page={data?.page ?? page}
        totalPages={data?.totalPages ?? 0}
        totalElements={data?.totalElements}
        onChange={setPage}
      />
    </>
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
              {(
                [
                  ["PERCENT_CAPPED", "정률 + 상한"],
                  ["FIXED_AMOUNT", "정액"],
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
  const range = defaultAnalyticsRange(new Date());
  const { data } = useQuery({
    queryKey: ["admin", "analytics", range.from, range.to],
    queryFn: () => adminApi.getAnalytics(range),
  });

  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  const hasActualValue =
    data.brandTrend.months.length > 0 ||
    data.funnel.length > 0 ||
    data.heatmap.grid.some((row) => row.some((value) => value > 0));
  if (data.sourceStates && !hasActualValue) return <AnalyticsUnavailable />;

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

export function AnalyticsUnavailable() {
  return (
    <Panel title="캠페인 분석" state="PENDING">
      <p className="t-body-sm text-hig-muted">
        분석 집계 원천이 아직 연결되지 않았습니다. 빈 차트를 실제 0건으로 표시하지 않으며 백엔드
        후속 구현 이후 값을 표시합니다.
      </p>
    </Panel>
  );
}

export function defaultAnalyticsRange(now: Date) {
  const dateParam = (date: Date) =>
    [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
      .join("-");
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  // 백엔드는 양끝을 포함해 1년을 계산하므로 같은 월·일은 하루 초과입니다.
  from.setDate(from.getDate() + 1);
  return { from: dateParam(from), to: dateParam(now) };
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

import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/admin/panel";
import { PageHead } from "@/components/admin/shell";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { formatClock } from "@/components/coupon/timer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DAYS_OF_WEEK,
  DAY_LABEL,
  NTH_WEEK_LABEL,
  brandOf,
  couponApi,
  discountHeadline,
  errorLine,
  trimSeconds,
  type CouponRoundView,
  type CouponTemplateDetail,
} from "@/lib/coupon";

export const Route = createFileRoute("/admin/campaigns/reserve")({
  head: () => ({ meta: [{ title: "회차 예약 · 쿠폰 야~호 관리자" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    template: typeof s["template"] === "number" ? s["template"] : undefined,
  }),
  component: ReservePage,
});

/* ── 시간축 ────────────────────────────────────────
   회차는 새벽에 열리지 않습니다. 24시간을 다 그리면 위아래 8시간이 빈 채로
   자리만 먹어서, 정작 봐야 할 낮 시간대가 눌립니다. 07~24시만 그립니다. */
const DAY_START = 7;
const DAY_END = 24;
const HOURS = DAY_END - DAY_START;
const GRID_H = 460;
const HOUR_MS = 3_600_000;
/** 백엔드 요청 DTO 의 @AssertTrue 와 같은 값입니다 */
const MAX_SPAN_HOURS = 24;

const startOfWeek = (ms: number) => {
  const d = new Date(ms);
  // getDay 는 일=0. 월요일 시작으로 맞춥니다.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** datetime-local 입력이 읽는 형식. 초는 버립니다. */
const toLocalInput = (ms: number) =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** 규칙이 가리키는 다음 오픈 시각. 이미 지났으면 다음 달로 넘깁니다. */
function nextOpenFor(t: CouponTemplateDetail, now: number): number {
  const [h = 0, m = 0] = trimSeconds(t.startTime).split(":").map(Number);
  const dayIndex = DAYS_OF_WEEK.indexOf(t.dayOfWeek);
  const at = (year: number, month: number) => {
    const first = new Date(year, month, 1);
    const firstIdx = (first.getDay() + 6) % 7;
    return new Date(
      year,
      month,
      1 + ((dayIndex - firstIdx + 7) % 7) + (t.nthWeek - 1) * 7,
      h,
      m,
      0,
      0,
    ).getTime();
  };
  const ref = new Date(now);
  const thisMonth = at(ref.getFullYear(), ref.getMonth());
  return thisMonth > now ? thisMonth : at(ref.getFullYear(), ref.getMonth() + 1);
}

function ReservePage() {
  const { template: preset } = useSearch({ from: "/admin/campaigns/reserve" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => couponApi.listTemplates({ size: 50 }),
  });
  const { data: rounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    refetchInterval: 30_000,
  });

  const list = templates?.content ?? [];
  const [pickedId, setPickedId] = useState<number | null>(preset ?? null);
  const picked = list.find((t) => t.id === (pickedId ?? preset)) ?? list[0];

  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [openLocal, setOpenLocal] = useState("");
  const [closeLocal, setCloseLocal] = useState("");
  const [seeded, setSeeded] = useState<number | null>(null);

  // 템플릿을 고르면 그 규칙의 다음 회차로 채우고, 그 주로 달력을 옮깁니다.
  if (picked && seeded !== picked.id) {
    setSeeded(picked.id);
    const open = nextOpenFor(picked, Date.now());
    setOpenLocal(toLocalInput(open));
    setCloseLocal(toLocalInput(open + picked.durationHours * HOUR_MS));
    setWeekStart(startOfWeek(open));
  }

  const openMs = openLocal ? new Date(openLocal).getTime() : NaN;
  const closeMs = closeLocal ? new Date(closeLocal).getTime() : NaN;
  const spanH = (closeMs - openMs) / HOUR_MS;

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart + i * 24 * HOUR_MS),
    [weekStart],
  );

  /* 이 주에 이미 잡힌 회차. 끝난 회차(CLOSED)는 자리를 비켜 주므로 뺍니다 —
     백엔드 겹침 검사도 SCHEDULED·OPEN 만 셉니다. */
  const booked = useMemo(() => {
    const from = weekStart;
    const to = weekStart + 7 * 24 * HOUR_MS;
    return (rounds ?? [])
      .filter((r) => r.status !== "CLOSED")
      .map((r) => ({ round: r, open: Date.parse(r.openAt), close: Date.parse(r.closeAt) }))
      .filter((r) => r.open < to && r.close > from);
  }, [rounds, weekStart]);

  const clashes = booked.filter(
    (s) =>
      Number.isFinite(openMs) && Number.isFinite(closeMs) && openMs < s.close && closeMs > s.open,
  );

  let problem: string | null = null;
  if (!picked) problem = "템플릿을 고르세요.";
  else if (!picked.active) problem = "비활성 템플릿으로는 회차를 예약할 수 없습니다.";
  else if (!Number.isFinite(openMs) || !Number.isFinite(closeMs))
    problem = "오픈·마감 시각을 채워 주세요.";
  else if (openMs < Date.now()) problem = "이미 지난 시각으로는 예약할 수 없습니다.";
  else if (closeMs <= openMs) problem = "마감은 오픈보다 뒤여야 합니다.";
  else if (spanH > MAX_SPAN_HOURS) problem = `한 회차는 ${MAX_SPAN_HOURS}시간을 넘길 수 없습니다.`;
  else if (clashes.length > 0)
    problem = `${brandOf(clashes[0]!.round.brandId).name} 회차와 시간이 겹칩니다.`;

  const reserve = useMutation({
    mutationFn: () =>
      couponApi.reserveRound(picked!.id, {
        openAt: new Date(openMs).toISOString(),
        closeAt: new Date(closeMs).toISOString(),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast.success(`${r.name} 회차를 예약했습니다`);
      // 화면을 떠나지 않습니다 — 연달아 여러 건을 잡는 일이 흔합니다.
      const next = Date.parse(r.closeAt);
      setOpenLocal(toLocalInput(next));
      setCloseLocal(toLocalInput(next + (picked?.durationHours ?? 4) * HOUR_MS));
    },
    onError: (e) => toast.error(errorLine(e)),
  });

  /** 격자를 누르면 그 시각으로 잡습니다. 분 단위는 30분으로 맞춥니다. */
  const pickSlot = (dayMs: number, ratio: number) => {
    if (!picked) return;
    const hour = DAY_START + ratio * HOURS;
    const snapped = Math.round(hour * 2) / 2;
    const d = new Date(dayMs);
    d.setHours(Math.floor(snapped), (snapped % 1) * 60, 0, 0);
    setOpenLocal(toLocalInput(d.getTime()));
    setCloseLocal(toLocalInput(d.getTime() + picked.durationHours * HOUR_MS));
  };

  return (
    <>
      <PageHead
        title="회차 예약"
        meta={
          <span className="t-body-sm text-hig-secondary">
            템플릿의 반복 규칙으로 실제 회차 한 건을 엽니다
          </span>
        }
        controls={
          <Link to="/admin/campaigns" className="btn-outline">
            캠페인으로
          </Link>
        }
      />

      {isLoading ? (
        <Skeleton className="h-[32rem] rounded-2xl" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <Panel title="템플릿" hint={`${list.length}개`} bodyClassName="p-0">
            <ul className="max-h-[34rem] overflow-y-auto">
              {list.map((t) => {
                const on = picked?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedId(t.id);
                        void navigate({ to: ".", search: { template: t.id }, replace: true });
                      }}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2.5 border-b border-hig-hairline px-4 py-3 text-left last:border-b-0 ${
                        on ? "bg-fill" : "hover:bg-fill/60"
                      }`}
                    >
                      <BrandPlate brandId={t.brandId} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="t-body-sm block truncate font-semibold">{t.name}</span>
                        <span className="t-caption block text-hig-muted">
                          {NTH_WEEK_LABEL[t.nthWeek]} {DAY_LABEL[t.dayOfWeek]}{" "}
                          {trimSeconds(t.startTime)} · {t.durationHours}시간
                        </span>
                      </span>
                      <span className="num t-caption shrink-0 text-hig-secondary">
                        {discountHeadline(t)}
                      </span>
                      {!t.active && (
                        <span className="t-caption shrink-0 text-hig-muted">비활성</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel
              title="주간 예약 현황"
              hint="빈 곳을 누르면 그 시각으로 잡힙니다"
              action={
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="이전 주"
                    onClick={() => setWeekStart((w) => w - 7 * 24 * HOUR_MS)}
                    className="btn-outline px-2.5"
                  >
                    ‹
                  </button>
                  <span className="num t-body-sm min-w-[9.5rem] text-center">
                    {new Date(weekStart).getMonth() + 1}월 {new Date(weekStart).getDate()}일 ~{" "}
                    {new Date(days[6]!).getMonth() + 1}월 {new Date(days[6]!).getDate()}일
                  </span>
                  <button
                    type="button"
                    aria-label="다음 주"
                    onClick={() => setWeekStart((w) => w + 7 * 24 * HOUR_MS)}
                    className="btn-outline px-2.5"
                  >
                    ›
                  </button>
                </span>
              }
            >
              <WeekGrid
                days={days}
                booked={booked}
                selection={
                  Number.isFinite(openMs) && Number.isFinite(closeMs) && closeMs > openMs
                    ? { open: openMs, close: closeMs, clash: clashes.length > 0 }
                    : null
                }
                onPick={pickSlot}
              />
            </Panel>

            <Panel title="예약할 회차" bodyClassName="flex flex-wrap items-end gap-x-5 gap-y-4">
              <label className="block">
                <span className="eyebrow">오픈</span>
                <input
                  type="datetime-local"
                  value={openLocal}
                  onChange={(e) => setOpenLocal(e.target.value)}
                  className="input-line mt-1.5"
                />
              </label>
              <label className="block">
                <span className="eyebrow">마감</span>
                <input
                  type="datetime-local"
                  value={closeLocal}
                  onChange={(e) => setCloseLocal(e.target.value)}
                  className="input-line mt-1.5"
                />
              </label>
              <span className="t-body-sm text-hig-secondary">
                <span className="eyebrow block">재고</span>
                <span className="num mt-1.5 block font-semibold text-hig-fg">
                  {picked ? `${picked.stockPerOccurrence.toLocaleString("ko-KR")}장` : "-"}
                </span>
              </span>

              <span className="ml-auto flex items-center gap-4">
                <span className="t-body-sm">
                  {problem ? (
                    <span className="font-semibold text-viz-critical">{problem}</span>
                  ) : (
                    <span className="text-hig-secondary">
                      발급 시간 <span className="num font-semibold text-hig-fg">{spanH}시간</span>
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={!!problem || reserve.isPending}
                  onClick={() => reserve.mutate()}
                  className="btn-primary"
                >
                  {reserve.isPending ? "예약하는 중" : "예약"}
                </button>
              </span>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 주간 격자 ─────────────────────────────────────
   하루를 세로 한 칸으로 두고, 잡힌 회차를 시각에 비례한 높이로 얹습니다.
   목록으로 적으면 "언제가 비었나" 를 머리로 계산해야 하지만, 자리로 그리면 눈에
   바로 들어옵니다 — 예약 화면이 해야 할 일이 그것입니다. */

interface Slot {
  round: CouponRoundView;
  open: number;
  close: number;
}

function WeekGrid({
  days,
  booked,
  selection,
  onPick,
}: {
  days: number[];
  booked: Slot[];
  selection: { open: number; close: number; clash: boolean } | null;
  onPick: (dayMs: number, ratio: number) => void;
}) {
  const today = new Date().setHours(0, 0, 0, 0);

  /** 하루 안에서의 위치(%) — 자정을 넘기는 회차는 그 날 칸에서 잘립니다 */
  const band = (dayMs: number, from: number, to: number) => {
    const dayFrom = dayMs + DAY_START * HOUR_MS;
    const dayTo = dayMs + DAY_END * HOUR_MS;
    const a = Math.max(from, dayFrom);
    const b = Math.min(to, dayTo);
    if (b <= a) return null;
    const span = (DAY_END - DAY_START) * HOUR_MS;
    return { top: ((a - dayFrom) / span) * 100, height: ((b - a) / span) * 100 };
  };

  /* 겹치는 회차를 **나란히** 놓습니다.
     전부 같은 자리에 그리면 뒤엣것이 앞엣것을 덮어서 이름이 안 읽힙니다 —
     데모 데이터는 지금 시각 근처에 여러 회차를 동시에 열어 두고, 실서버에서도
     지난 데이터에는 겹치는 회차가 있을 수 있습니다.
     시작 순으로 훑으며 앞 회차가 이미 끝난 레인에 넣고, 없으면 레인을 늘립니다. */
  const laneOf = (dayMs: number) => {
    const items = booked
      .map((s) => ({ slot: s, b: band(dayMs, s.open, s.close) }))
      .filter((x) => x.b !== null)
      .sort((a, z) => a.b!.top - z.b!.top);
    const laneEnds: number[] = [];
    const placed = items.map((x) => {
      const top = x.b!.top;
      const bottom = top + x.b!.height;
      let lane = laneEnds.findIndex((end) => end <= top + 0.01);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(bottom);
      } else {
        laneEnds[lane] = bottom;
      }
      return { ...x, lane };
    });
    return { placed, lanes: Math.max(1, laneEnds.length) };
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[46rem] gap-px">
        {/* 시간 눈금 */}
        <div className="w-11 shrink-0">
          <div className="h-7" />
          <div className="relative" style={{ height: GRID_H }}>
            {Array.from({ length: HOURS + 1 }, (_, i) => (
              <span
                key={i}
                className="num t-caption absolute right-1.5 -translate-y-1/2 text-hig-muted"
                style={{ top: `${(i / HOURS) * 100}%` }}
              >
                {DAY_START + i}
              </span>
            ))}
          </div>
        </div>

        {days.map((dayMs) => {
          const d = new Date(dayMs);
          const isToday = dayMs === today;
          const past = dayMs < today;
          return (
            <div key={dayMs} className="min-w-0 flex-1">
              <p
                className={`t-caption flex h-7 items-center justify-center gap-1 ${
                  isToday ? "font-bold text-hig-fg" : past ? "text-hig-muted" : "text-hig-secondary"
                }`}
              >
                {DAY_LABEL[DAYS_OF_WEEK[(d.getDay() + 6) % 7]!]}
                <span className="num">{d.getDate()}</span>
              </p>

              <button
                type="button"
                aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 시간 고르기`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onPick(dayMs, (e.clientY - r.top) / r.height);
                }}
                className={`relative block w-full cursor-crosshair border-t border-hig-hairline ${
                  past ? "bg-fill/40" : "bg-fill/70 hover:bg-fill"
                }`}
                style={{ height: GRID_H }}
              >
                {/* 시간 괘선 */}
                {Array.from({ length: HOURS }, (_, i) => (
                  <span
                    key={i}
                    className="pointer-events-none absolute inset-x-0 border-t border-hig-hairline/60"
                    style={{ top: `${((i + 1) / HOURS) * 100}%` }}
                  />
                ))}

                {(() => {
                  const { placed, lanes } = laneOf(dayMs);
                  const w = 100 / lanes;
                  return placed.map(({ slot: s, b, lane }) => {
                    const brand = brandOf(s.round.brandId);
                    return (
                      <span
                        key={`${s.round.id}-${dayMs}`}
                        className="pointer-events-none absolute overflow-hidden rounded-[3px] px-1 py-0.5 text-left"
                        style={{
                          top: `${b!.top}%`,
                          height: `${b!.height}%`,
                          left: `calc(${lane * w}% + 2px)`,
                          width: `calc(${w}% - 4px)`,
                          background: brand.ink,
                        }}
                        title={`${brand.name} ${formatClock(s.round.openAt)}-${formatClock(s.round.closeAt)}`}
                      >
                        <span className="t-caption block truncate leading-tight font-semibold text-white">
                          {lanes > 2 ? brand.plate : brand.name}
                        </span>
                        {b!.height > 6 && (
                          <span className="num t-caption block truncate leading-tight text-white/75">
                            {formatClock(s.round.openAt)}
                          </span>
                        )}
                      </span>
                    );
                  });
                })()}

                {selection &&
                  (() => {
                    const b = band(dayMs, selection.open, selection.close);
                    if (!b) return null;
                    return (
                      <span
                        className={`pointer-events-none absolute inset-x-0.5 rounded-[3px] border-2 border-dashed ${
                          selection.clash
                            ? "border-viz-critical bg-viz-critical/20"
                            : "border-hig-fg bg-hig-fg/10"
                        }`}
                        style={{ top: `${b.top}%`, height: `${b.height}%` }}
                      />
                    );
                  })()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

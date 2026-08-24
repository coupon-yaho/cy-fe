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
  const [day, setDay] = useState(() => new Date().setHours(0, 0, 0, 0));
  const [openLocal, setOpenLocal] = useState("");
  const [closeLocal, setCloseLocal] = useState("");
  const [seeded, setSeeded] = useState<number | null>(null);

  // 템플릿을 고르면 그 규칙의 다음 회차로 채우고, 달력도 그 날로 옮깁니다.
  if (picked && seeded !== picked.id) {
    setSeeded(picked.id);
    const open = nextOpenFor(picked, Date.now());
    setOpenLocal(toLocalInput(open));
    setCloseLocal(toLocalInput(open + picked.durationHours * HOUR_MS));
    setWeekStart(startOfWeek(open));
    setDay(new Date(open).setHours(0, 0, 0, 0));
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

  /** 시간 버튼을 누르면 오픈이 그 시각이 되고, 마감은 템플릿 길이만큼 따라옵니다. */
  const pickSlot = (at: number) => {
    if (!picked) return;
    setOpenLocal(toLocalInput(at));
    setCloseLocal(toLocalInput(at + picked.durationHours * HOUR_MS));
  };

  const moveWeek = (delta: number) => {
    const w = weekStart + delta * 7 * 24 * HOUR_MS;
    setWeekStart(w);
    // 주를 옮기면 고른 날도 같은 요일로 따라갑니다 — 안 그러면 화면 밖의 날이 선택된 채 남습니다
    setDay(w + ((day - weekStart) % (7 * 24 * HOUR_MS)));
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
              title="언제 열까요"
              hint="막힌 시각은 누가 잡았는지 버튼에 적혀 있습니다"
              action={
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="이전 주"
                    onClick={() => moveWeek(-1)}
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
                    onClick={() => moveWeek(1)}
                    className="btn-outline px-2.5"
                  >
                    ›
                  </button>
                </span>
              }
            >
              <div className="flex flex-col gap-5">
                <DayPicker days={days} booked={booked} selected={day} onSelect={setDay} />
                <TimeSlots
                  dayMs={day}
                  durationH={picked?.durationHours ?? 4}
                  booked={booked}
                  selectedOpen={Number.isFinite(openMs) ? openMs : null}
                  onPick={pickSlot}
                />
              </div>
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

/* ── 날짜 · 시간 고르기 ─────────────────────────────
   격자를 눌러 시각을 잡는 방식이었는데, 몇 시를 누른 건지 놓기 전에는 알 수 없었고
   "여기 열 수 있나" 를 눈대중으로 판단해야 했습니다.
   시간 버튼으로 바꿉니다 — 열 수 있는 시각만 누를 수 있고, 막힌 시각은 누가 잡았는지
   버튼에 적힙니다. 판단을 화면이 대신합니다. */

const SLOT_MIN = 30;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;

interface Slot {
  round: CouponRoundView;
  open: number;
  close: number;
}

function DayPicker({
  days,
  booked,
  selected,
  onSelect,
}: {
  days: number[];
  booked: Slot[];
  selected: number;
  onSelect: (dayMs: number) => void;
}) {
  const today = new Date().setHours(0, 0, 0, 0);
  return (
    <div className="flex gap-1.5">
      {days.map((dayMs) => {
        const d = new Date(dayMs);
        const count = booked.filter((s) => s.open < dayMs + 24 * HOUR_MS && s.close > dayMs).length;
        const on = dayMs === selected;
        const past = dayMs + 24 * HOUR_MS <= Date.now();
        return (
          <button
            key={dayMs}
            type="button"
            disabled={past}
            onClick={() => onSelect(dayMs)}
            aria-pressed={on}
            className={`flex-1 rounded-xl border py-2.5 text-center transition-colors ${
              on
                ? "border-hig-fg bg-hig-fg text-hig-surface"
                : past
                  ? "border-hig-hairline text-hig-muted"
                  : "border-hig-hairline hover:bg-fill"
            }`}
          >
            <span className="t-caption block">
              {DAY_LABEL[DAYS_OF_WEEK[(d.getDay() + 6) % 7]!]}
            </span>
            <span
              className={`num t-body block font-semibold ${dayMs === today && !on ? "text-hig-link" : ""}`}
            >
              {d.getDate()}
            </span>
            {/* 잡힌 게 있는 날은 미리 알려 줍니다 — 눌러 보고 알면 늦습니다 */}
            <span className={`t-caption block ${on ? "text-hig-surface/70" : "text-hig-muted"}`}>
              {count > 0 ? `${count}건` : "비어 있음"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TimeSlots({
  dayMs,
  durationH,
  booked,
  selectedOpen,
  onPick,
}: {
  dayMs: number;
  durationH: number;
  booked: Slot[];
  selectedOpen: number | null;
  onPick: (openMs: number) => void;
}) {
  const now = Date.now();
  const slots: {
    at: number;
    taken: Slot | null;
    past: boolean;
  }[] = [];

  for (let i = 0; i < (DAY_END - DAY_START) * SLOTS_PER_HOUR; i += 1) {
    const at = dayMs + DAY_START * HOUR_MS + i * SLOT_MIN * 60_000;
    const end = at + durationH * HOUR_MS;
    // 이 시각에 열면 어느 회차와 부딪히는지 — 첫 번째 것만 알려 주면 충분합니다
    const taken = booked.find((s) => at < s.close && end > s.open) ?? null;
    slots.push({ at, taken, past: at < now });
  }

  const free = slots.filter((s) => !s.taken && !s.past).length;

  return (
    <div>
      <p className="t-body-sm mb-3 text-hig-secondary">
        {durationH}시간짜리 회차를 열 수 있는 시각{" "}
        <span className="num font-semibold text-hig-fg">{free}</span>개
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
        {slots.map(({ at, taken, past }) => {
          const label = new Date(at).toTimeString().slice(0, 5);
          const on = selectedOpen === at;
          const off = !!taken || past;
          return (
            <button
              key={at}
              type="button"
              disabled={off}
              onClick={() => onPick(at)}
              aria-pressed={on}
              title={
                taken
                  ? `${brandOf(taken.round.brandId).name} ${formatClock(taken.round.openAt)}-${formatClock(taken.round.closeAt)}`
                  : past
                    ? "이미 지난 시각입니다"
                    : undefined
              }
              className={`rounded-lg border px-1 py-2 text-center transition-colors ${
                on
                  ? "border-hig-fg bg-hig-fg text-hig-surface"
                  : taken
                    ? "border-transparent bg-fill text-hig-muted"
                    : past
                      ? "border-transparent text-hig-muted/60"
                      : "border-hig-hairline hover:border-hig-fg hover:bg-fill"
              }`}
            >
              <span className="num t-body-sm block font-semibold">{label}</span>
              {/* 왜 못 누르는지 버튼이 직접 말합니다 */}
              <span className="t-caption block truncate">
                {taken ? brandOf(taken.round.brandId).name : past ? "지남" : on ? "선택" : "가능"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

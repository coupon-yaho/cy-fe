import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BrandCalendar } from "@/components/coupon/brand-calendar";
import { SectionHead } from "@/components/coupon/section-head";
import { RoundCard, RoundRow } from "@/components/coupon/round-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { GRADE_LABEL, couponApi, type CouponRoundStatus, type CouponRoundView } from "@/lib/coupon";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "브랜드 데이 일정 · 쿠폰 야~호" },
      {
        name: "description",
        content: "브랜드 데이 일정. 발급 중인 회차와 오픈 예정 회차를 한눈에 봅니다.",
      },
    ],
  }),
  component: Schedule,
});

type Filter = "ALL" | CouponRoundStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "OPEN", label: "발급 중" },
  { key: "SCHEDULED", label: "오픈 예정" },
  { key: "CLOSED", label: "마감" },
];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  if (diff === -1) return `어제 · ${base}`;
  return base;
}

type View = "CALENDAR" | "LIST";

function Schedule() {
  const { session } = useAuth();
  // 사양서 U2 — 달력이 기본이고 기존 목록은 토글로 보존합니다.
  const [view, setView] = useState<View>("CALENDAR");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [mineOnly, setMineOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    refetchInterval: 15_000,
  });

  const rounds = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    return rounds
      .filter((r) => filter === "ALL" || r.status === filter)
      .filter((r) => !mineOnly || !session || r.eligibleGrades.includes(session.grade));
  }, [rounds, filter, mineOnly, session]);

  const live = filtered.filter((r) => r.status === "OPEN");

  const groups = useMemo(() => {
    const byDay = new Map<string, { label: string; at: number; rows: CouponRoundView[] }>();
    for (const r of [...filtered].sort((a, b) => Date.parse(a.openAt) - Date.parse(b.openAt))) {
      const key = dayKey(r.openAt);
      if (!byDay.has(key)) {
        byDay.set(key, { label: dayLabel(r.openAt), at: Date.parse(r.openAt), rows: [] });
      }
      byDay.get(key)!.rows.push(r);
    }
    return [...byDay.values()].sort((a, b) => a.at - b.at);
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16">
      <SectionHead
        eyebrow="전체 일정"
        title="브랜드 데이 일정"
        note="어느 날 어떤 브랜드가 열리는지 달력으로 봅니다."
        action={
          <div
            className="inline-flex rounded-full bg-yh-paper-2 p-1"
            role="group"
            aria-label="보기 방식"
          >
            {(
              [
                ["CALENDAR", "달력"],
                ["LIST", "목록"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`yh-body rounded-full px-4 py-1.5 font-bold transition-colors ${
                  view === key ? "bg-yh-surface text-yh-navy shadow-sm" : "text-yh-ink-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {view === "CALENDAR" && <BrandCalendar grade={session?.grade ?? null} />}

      {view === "LIST" && (
        <>
          <div className="mt-12 flex flex-wrap items-center gap-1.5 border-y border-yh-rule py-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`yh-body rounded-[3px] px-3.5 py-1.5 font-semibold transition-colors ${
                  filter === f.key
                    ? "bg-yh-solid text-yh-on-solid"
                    : "text-yh-ink-2 hover:bg-yh-paper-2 hover:text-yh-navy"
                }`}
              >
                {f.label}
                <span className="yh-num ml-2 text-[0.75rem] opacity-55">
                  {f.key === "ALL"
                    ? rounds.length
                    : rounds.filter((r) => r.status === f.key).length}
                </span>
              </button>
            ))}

            {session && (
              <button
                type="button"
                onClick={() => setMineOnly((v) => !v)}
                aria-pressed={mineOnly}
                className={`yh-body ml-auto rounded-[3px] border px-3.5 py-1.5 font-semibold transition-colors ${
                  mineOnly
                    ? "border-yh-navy bg-yh-surface text-yh-navy"
                    : "border-transparent text-yh-ink-2 hover:bg-yh-paper-2 hover:text-yh-navy"
                }`}
              >
                {GRADE_LABEL[session.grade]} 참여 가능만
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-80 rounded-[6px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Empty
              onReset={() => {
                setFilter("ALL");
                setMineOnly(false);
              }}
            />
          ) : (
            <>
              {live.length > 0 && filter === "ALL" && (
                <section className="mt-14">
                  <h3 className="yh-label yh-rule-head pt-4">지금 발급 중</h3>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {live.map((r) => (
                      <RoundCard key={r.id} round={r} grade={session?.grade ?? null} />
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-16">
                {groups.map((g) => (
                  <div key={g.label} className="mb-12">
                    <h3 className="yh-sub border-b border-yh-rule pb-2.5">{g.label}</h3>
                    {g.rows.map((r) => (
                      <RoundRow key={r.id} round={r} grade={session?.grade ?? null} />
                    ))}
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="yh-card mt-14 px-6 py-24 text-center">
      <p className="yh-title">조건에 맞는 회차가 없습니다</p>
      <p className="yh-lede mt-4 text-yh-ink-2">필터를 지우면 전체 일정이 보입니다.</p>
      <button type="button" onClick={onReset} className="yh-btn mt-9">
        필터 지우기
      </button>
    </div>
  );
}

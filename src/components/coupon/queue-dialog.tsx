import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatClock } from "@/components/coupon/timer";
import type { QueuePlace } from "@/lib/coupon";

/**
 * 대기열 모달.
 *
 * 대기열이 켜진 회차에서만 열립니다.
 * 순서가 되면 자동으로 발급되므로, 사용자가 할 일은 창을 열어 두는 것뿐입니다.
 * 그래서 바깥을 눌러도 닫히지 않고, 나가려면 대기 취소를 눌러야 합니다.
 *
 * 순번은 이 창에서 유일하게 큰 글자입니다 — 기다리는 사람이 보는 건 그 숫자 하나입니다.
 */
export function QueueDialog({
  open,
  campaign,
  place,
  startPosition,
  /** 순서가 와서 발급 버튼이 열린 상태. 남은 시간(초)을 함께 받습니다. */
  admitted,
  /** 발급을 실제로 처리하는 중 */
  issuing,
  remaining,
  closeAt,
  onIssue,
  onCancel,
}: {
  open: boolean;
  campaign: string;
  place: QueuePlace | null;
  startPosition: number;
  admitted: { secondsLeft: number } | null;
  issuing: boolean;
  remaining: number;
  closeAt: string;
  onIssue: () => void;
  onCancel: () => void;
}) {
  const position = place?.position ?? 0;
  const progress = startPosition > 0 ? Math.min(1, Math.max(0, 1 - position / startPosition)) : 0;

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="yh rounded-2xl border-yh-navy bg-yh-surface sm:max-w-md"
      >
        <DialogTitle className="yh-sub text-center">
          {issuing ? "발급하고 있습니다" : admitted ? "입장했습니다" : "차례를 기다리는 중입니다"}
        </DialogTitle>
        <DialogDescription className="yh-small text-center text-yh-ink-2">
          {campaign}
        </DialogDescription>

        {issuing ? (
          <div className="py-12 text-center">
            <p className="yh-figure">발급 중</p>
            <p className="yh-body mt-4 text-yh-ink-2">
              잠시만 기다려 주세요. 끝나면 쿠폰 번호가 나옵니다.
            </p>
          </div>
        ) : admitted ? (
          /* 순서가 왔습니다. 여기서 자동으로 발급하지 않는 이유는 PRD 의 선착순 정의
             때문입니다 — 입장은 순서를 보장하지만 발급을 보장하지 않고, 발급 순서는
             버튼을 누른 순서입니다. 그래서 남은 시간과 남은 수량을 같이 보여 줍니다. */
          <>
            <div className="pt-7 pb-2 text-center">
              <p className="yh-label">남은 시간</p>
              <p
                className={`yh-figure yh-num mt-2 ${
                  admitted.secondsLeft <= 30 ? "text-yh-accent" : "text-yh-navy"
                }`}
              >
                {clock(admitted.secondsLeft)}
              </p>
              <p className="yh-small mt-2 text-yh-ink-2">
                이 시간 안에 누르지 않으면 자리가 다음 사람에게 넘어갑니다.
              </p>
            </div>

            <button type="button" onClick={onIssue} className="yh-btn-live mt-5 w-full">
              발급받기
            </button>

            <dl className="mt-6 grid grid-cols-2 border-t border-yh-rule text-center">
              <Stat label="남은 수량" value={`${remaining.toLocaleString("ko-KR")}장`} />
              <Stat label="회차 마감" value={formatClock(closeAt)} />
            </dl>

            <p className="yh-small mt-5 text-center text-yh-ink-2">
              입장 순서와 발급 순서는 다릅니다. 먼저 누른 사람이 가져가므로 수량이 먼저 떨어질 수
              있습니다.
            </p>
          </>
        ) : (
          <>
            <div className="pt-8 pb-3 text-center">
              {/* 서버가 주는 값은 순번이 아니라 **내 앞의 인원**입니다
                  (cy-waiting `QueueEntry.rank`). 차례가 오면 0 이 됩니다 —
                  "내 순번" 이라고 적으면 1등이 0 으로 보입니다. */}
              <p className="yh-label">앞에 남은 사람</p>
              <p className="yh-figure yh-num mt-2">{position.toLocaleString("ko-KR")}</p>
            </div>

            <div
              className="h-1 w-full overflow-hidden rounded-full bg-yh-rule"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="대기 진행률"
            >
              <span
                className="block h-full bg-yh-solid transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(2, progress * 100)}%` }}
              />
            </div>

            {/* "내 뒤 N명" 과 "전체 대기 N명" 이 있었는데 들어냈습니다. 게이트웨이가
                주는 것은 내 앞의 인원과 예상 시간 둘뿐이라, 그 두 칸은 영영 "집계 중"
                으로 남습니다. 안 채워지는 칸은 기다리는 사람에게 고장으로 보입니다. */}
            <dl className="mt-7 grid grid-cols-1 border-t border-yh-rule text-center">
              <Stat label="예상 대기" value={eta(place?.etaSeconds ?? null)} />
            </dl>

            {/* 앞서 "새로고침하면 순번이 사라집니다" 라고 적어 두었는데 사실이 아닙니다.
                자리는 서버가 토큰으로 들고 있고, 프론트도 그 토큰을 남겨 두므로
                돌아와서 순번만 다시 물어보면 이어서 기다립니다. */}
            <p className="yh-small mt-7 text-center text-yh-ink-2">
              차례가 오면 이 창에 뜹니다. 새로고침해도 순번은 그대로입니다.
            </p>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="yh-small font-bold text-yh-navy underline underline-offset-4 hover:text-yh-accent"
              >
                대기 취소
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 초를 m:ss 로. 대기 시간은 분 단위로 읽는 게 자연스럽습니다. */
function clock(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "340초" 보다 "약 6분" 이 사람이 읽는 단위입니다. 1분 미만은 초로 둡니다. */
function eta(seconds: number | null): string {
  if (seconds == null) return "계산 불가";
  if (seconds < 60) return `약 ${seconds}초`;
  return `약 ${Math.round(seconds / 60)}분`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-yh-rule py-4 last:border-r-0">
      <dt className="yh-label">{label}</dt>
      <dd className="yh-num yh-body mt-1 font-bold">{value}</dd>
    </div>
  );
}

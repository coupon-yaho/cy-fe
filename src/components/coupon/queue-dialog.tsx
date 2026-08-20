import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { QueuePlace } from "@/lib/coupon";

/**
 * 대기열 모달.
 *
 * 대기열이 켜진 회차에서만 열립니다.
 * 순서가 되면 자동으로 발급되므로, 사용자가 할 일은 창을 열어 두는 것뿐입니다.
 * 그래서 바깥을 눌러도 닫히지 않고, 나가려면 대기 취소를 눌러야 합니다.
 */
export function QueueDialog({
  open,
  campaign,
  place,
  startPosition,
  admitted,
  onCancel,
}: {
  open: boolean;
  campaign: string;
  place: QueuePlace | null;
  startPosition: number;
  /** 순서가 되어 발급을 처리하는 중 */
  admitted: boolean;
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
        className="rounded-2xl sm:max-w-md"
      >
        <DialogTitle className="t-tile text-center">
          {admitted ? "발급하고 있습니다" : "차례를 기다리는 중입니다"}
        </DialogTitle>
        <DialogDescription className="t-body-sm text-center text-hig-secondary">
          {campaign}
        </DialogDescription>

        {admitted ? (
          <div className="py-10 text-center">
            <p className="t-hero num">순서 도착</p>
            <p className="t-body mt-3 text-hig-secondary">
              잠시만 기다려 주세요. 발급이 끝나면 쿠폰 번호가 나옵니다.
            </p>
          </div>
        ) : (
          <>
            <div className="pt-6 pb-2 text-center">
              <p className="eyebrow">내 순번</p>
              <p className="t-hero num mt-1">{position.toLocaleString("ko-KR")}</p>
            </div>

            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-fill"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="대기 진행률"
            >
              <span
                className="block h-full rounded-full bg-hig-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(2, progress * 100)}%` }}
              />
            </div>

            <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
              <Stat
                label="내 뒤"
                value={place ? `${place.behind.toLocaleString("ko-KR")}명` : "—"}
              />
              <Stat
                label="전체 대기"
                value={place ? `${place.totalWaiting.toLocaleString("ko-KR")}명` : "—"}
              />
              <Stat
                label="예상 대기"
                value={place?.etaSeconds != null ? `${place.etaSeconds}초` : "계산 불가"}
              />
            </dl>

            <p className="t-body-sm mt-6 text-center text-hig-secondary">
              순서가 되면 자동으로 발급됩니다. 창을 닫거나 새로고침하면 순번이 사라집니다.
            </p>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="t-body-sm text-hig-link hover:underline"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-hig-canvas py-3">
      <dt className="t-caption text-hig-muted">{label}</dt>
      <dd className="num t-body mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

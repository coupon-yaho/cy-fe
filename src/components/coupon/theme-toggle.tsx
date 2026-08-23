import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePref } from "@/hooks/use-theme";

const OPTIONS: { key: ThemePref; label: string; Icon: typeof Sun }[] = [
  { key: "system", label: "시스템 설정", Icon: Monitor },
  { key: "light", label: "밝게", Icon: Sun },
  { key: "dark", label: "어둡게", Icon: Moon },
];

/**
 * 화면 밝기 전환.
 *
 * 두 값을 오가는 스위치가 아니라 세 값 중 고르는 메뉴입니다 — "시스템 설정" 이
 * 기본이고, 그것을 되돌릴 수 없으면 한 번 고른 사람은 OS 를 따라갈 방법이 없습니다.
 *
 * 방아쇠 아이콘은 **지금 무엇을 보고 있는지**가 아니라 **무엇을 골랐는지**를
 * 보여 줍니다. 시스템을 고른 사람에게 달 모양을 띄우면 자기가 다크를 고른 줄 압니다.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { pref, choose } = useTheme();
  const current = OPTIONS.find((o) => o.key === pref) ?? OPTIONS[0]!;
  const Icon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`grid size-9 place-items-center rounded-full text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy ${className}`}
        aria-label={`화면 밝기, 현재 ${current.label}`}
      >
        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="yh w-44 rounded-xl border-yh-rule bg-yh-surface p-1"
      >
        {OPTIONS.map(({ key, label, Icon: OptIcon }) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => choose(key)}
            className={`yh-body flex items-center gap-2.5 rounded-lg font-medium ${
              pref === key ? "text-yh-navy" : "text-yh-ink-2"
            }`}
          >
            <OptIcon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
            {label}
            {pref === key && <span className="ml-auto text-yh-accent">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 메뉴 안에 펼쳐 놓는 형태.
 *
 * 좁은 화면에서는 헤더에 아이콘 하나를 더 놓을 자리가 없습니다(360px 에서 4px
 * 넘쳤습니다 — 실측). 그렇다고 전환을 없애면 다크를 쓰는 사람이 되돌릴 방법이
 * 사라지므로, 메뉴 시트 안으로 옮깁니다.
 *
 * 시트 안에서는 드롭다운을 또 여는 대신 세 값을 펼쳐 둡니다 — 이미 열린 판 위에
 * 또 판을 띄우는 것이라 어디를 눌러야 닫히는지 알기 어렵습니다.
 */
export function ThemeChoices() {
  const { pref, choose } = useTheme();

  return (
    <div>
      <p className="yh-label">화면 밝기</p>
      <div className="mt-3 flex gap-1.5" role="group" aria-label="화면 밝기">
        {OPTIONS.map(({ key, label, Icon }) => {
          const on = pref === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => choose(key)}
              aria-pressed={on}
              className={`yh-small flex flex-1 flex-col items-center gap-1.5 rounded-lg border py-2.5 font-bold transition-colors ${
                on
                  ? "border-yh-navy bg-yh-solid text-yh-on-solid"
                  : "border-yh-rule text-yh-ink-2 hover:text-yh-navy"
              }`}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

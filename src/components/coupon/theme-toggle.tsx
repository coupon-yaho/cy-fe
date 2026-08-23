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
export function ThemeToggle() {
  const { pref, choose } = useTheme();
  const current = OPTIONS.find((o) => o.key === pref) ?? OPTIONS[0]!;
  const Icon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-9 place-items-center rounded text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy"
        aria-label={`화면 밝기 — 현재 ${current.label}`}
      >
        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="yh w-44 rounded border-yh-rule bg-yh-surface p-1">
        {OPTIONS.map(({ key, label, Icon: OptIcon }) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => choose(key)}
            className={`yh-body flex items-center gap-2.5 rounded font-medium ${
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

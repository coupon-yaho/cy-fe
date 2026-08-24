import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

/* 알림이 무슨 일로 왔는지. 목록에서 아이콘과 색을 고르는 데 씁니다 —
   제목만 굵게 찍어 두면 발급·사용·취소가 전부 같은 줄로 보입니다. */
export type NotificationKind = "issued" | "used" | "restored" | "canceled";

const KINDS: NotificationKind[] = ["issued", "used", "restored", "canceled"];

export interface MockNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: number;
}

interface NotificationValue {
  items: MockNotification[];
  unread: number;
  notify: (kind: NotificationKind, title: string, body: string) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

/* ── 저장 ──────────────────────────────────────────
   리액트 상태로만 들고 있어서 새로고침 한 번에 전부 사라졌습니다. 쿠폰을 받고
   화면을 새로 고치면 "받았습니다" 가 없어져서 알림이 고장 난 것처럼 보였습니다.
   쿠폰함이 닉네임별로 남으므로(memberIdFor) 알림도 **회원별로** 남깁니다 —
   한 브라우저에서 계정을 바꿔 가며 보는 데모라 남의 알림이 보이면 안 됩니다. */
const KEY = "coupon-yaho.notifications.v1";
/** 목록은 최근 6개만 보여 주므로 그보다 넉넉하게만 남깁니다 */
const LIMIT = 30;

interface Slot {
  items: MockNotification[];
  /** 이 시각 이전 것은 읽은 것으로 봅니다. 개수로 세면 목록이 잘릴 때 어긋납니다. */
  seenAt: number;
}

type Store = Record<string, Slot>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** 예전 판에서 온 값이나 손이 닿은 값이 섞여도 화면이 깨지지 않게 걸러 냅니다. */
function readSlot(memberId: number): Slot {
  const slot = readStore()[String(memberId)];
  if (!slot || !Array.isArray(slot.items)) return { items: [], seenAt: 0 };
  const items = slot.items.filter(
    (n): n is MockNotification =>
      !!n &&
      typeof n.id === "string" &&
      typeof n.title === "string" &&
      typeof n.body === "string" &&
      typeof n.at === "number" &&
      KINDS.includes(n.kind),
  );
  return { items, seenAt: typeof slot.seenAt === "number" ? slot.seenAt : 0 };
}

function writeSlot(memberId: number, slot: Slot) {
  if (typeof window === "undefined") return;
  try {
    const store = readStore();
    store[String(memberId)] = { items: slot.items.slice(0, LIMIT), seenAt: slot.seenAt };
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 용량이 찼거나 사생활 보호 모드입니다. 화면의 알림은 그대로이니 넘어갑니다. */
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const memberId = session?.memberId ?? null;

  const [items, setItems] = useState<MockNotification[]>([]);
  const [seenAt, setSeenAt] = useState(0);

  /* 저장은 notify·markAllRead 를 부른 뒤에만 합니다. 회원이 바뀔 때도 아래 effect 가
     도는데 그때 같이 저장하면 **직전 회원의 알림이 새 회원 칸에** 적힙니다 —
     불러오기가 부른 setState 는 다음 렌더에야 반영되기 때문입니다. */
  const dirty = useRef(false);

  // 서버 렌더에서는 localStorage 를 못 읽습니다. 세션이 정해진 뒤 불러옵니다.
  useEffect(() => {
    if (!ready) return;
    const slot = memberId === null ? { items: [], seenAt: 0 } : readSlot(memberId);
    dirty.current = false;
    setItems(slot.items);
    setSeenAt(slot.seenAt);
  }, [ready, memberId]);

  useEffect(() => {
    if (!ready || memberId === null || !dirty.current) return;
    dirty.current = false;
    writeSlot(memberId, { items, seenAt });
  }, [ready, memberId, items, seenAt]);

  const notify = useCallback((kind: NotificationKind, title: string, body: string) => {
    dirty.current = true;
    setItems((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          title,
          body,
          at: Date.now(),
        },
        ...prev,
      ].slice(0, LIMIT),
    );
  }, []);

  const markAllRead = useCallback(() => {
    dirty.current = true;
    setSeenAt(Date.now());
  }, []);

  const value = useMemo<NotificationValue>(
    () => ({
      items,
      unread: items.filter((n) => n.at > seenAt).length,
      notify,
      markAllRead,
    }),
    [items, seenAt, notify, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

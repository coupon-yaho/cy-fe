import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/* 알림이 무슨 일로 왔는지. 목록에서 아이콘과 색을 고르는 데 씁니다 —
   제목만 굵게 찍어 두면 발급·사용·취소가 전부 같은 줄로 보입니다. */
export type NotificationKind = "issued" | "used" | "restored" | "canceled";

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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MockNotification[]>([]);
  const [readCount, setReadCount] = useState(0);

  const notify = useCallback((kind: NotificationKind, title: string, body: string) => {
    setItems((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        title,
        body,
        at: Date.now(),
      },
      ...prev,
    ]);
  }, []);

  const value = useMemo<NotificationValue>(
    () => ({
      items,
      unread: Math.max(0, items.length - readCount),
      notify,
      markAllRead: () => setReadCount(items.length),
    }),
    [items, readCount, notify],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

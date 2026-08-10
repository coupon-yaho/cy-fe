import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface MockNotification {
  id: string;
  title: string;
  body: string;
  at: number;
}

interface NotificationValue {
  items: MockNotification[];
  unread: number;
  notify: (title: string, body: string) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MockNotification[]>([]);
  const [readCount, setReadCount] = useState(0);

  const notify = useCallback((title: string, body: string) => {
    setItems((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, body, at: Date.now() },
      ...prev,
    ]);
  }, []);

  const markAllRead = useCallback(() => setReadCount((_) => 0), []);

  const value = useMemo<NotificationValue>(
    () => ({
      items,
      unread: Math.max(0, items.length - readCount),
      notify,
      markAllRead: () => setReadCount(items.length),
    }),
    [items, readCount, notify, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MembershipGrade } from "@/lib/coupon";
import {
  memberIdFor,
  readSession,
  writeSession,
  type Role,
  type Session,
} from "@/lib/auth-storage";

interface AuthValue {
  session: Session | null;
  ready: boolean;
  login: (input: { nickname: string; grade: MembershipGrade; role: Role }) => Session;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const login = useCallback((input: { nickname: string; grade: MembershipGrade; role: Role }) => {
    const s: Session = {
      memberId: memberIdFor(input.nickname),
      nickname: input.nickname,
      grade: input.grade,
      role: input.role,
      issuedAt: Date.now(),
    };
    writeSession(s);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, ready, login, logout }), [session, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** X-Member-Id · X-Membership-Grade 로 나갈 값 */
export function useMember() {
  const { session } = useAuth();
  return session ? { memberId: session.memberId, grade: session.grade } : null;
}

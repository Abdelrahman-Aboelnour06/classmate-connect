import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/api";

export type User = { email: string; username: string; fullName: string; studentCode: string };

type UserAuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  clearUser: () => void;
};

const UserAuthContext = createContext<UserAuthContextValue | undefined>(undefined);

export function UserAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const result = await getCurrentUser();
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const value = useMemo(() => ({ user, loading, refreshUser, clearUser: () => setUser(null) }), [user, loading]);
  return <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>;
}

export function useUserAuth() {
  const context = useContext(UserAuthContext);
  if (!context) throw new Error("useUserAuth must be used inside UserAuthProvider");
  return context;
}

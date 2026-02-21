import { createContext, useContext, useMemo, useState } from "react";

type AuthContextValue = {
  token: string | null;
  adminEmail: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, adminEmail: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("admin_token"));
  const [adminEmail, setAdminEmail] = useState<string | null>(() => localStorage.getItem("admin_email"));

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      adminEmail,
      isAuthenticated: Boolean(token),
      setAuth: (nextToken, email) => {
        localStorage.setItem("admin_token", nextToken);
        localStorage.setItem("admin_email", email);
        setToken(nextToken);
        setAdminEmail(email);
      },
      logout: () => {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_email");
        setToken(null);
        setAdminEmail(null);
      },
    }),
    [token, adminEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

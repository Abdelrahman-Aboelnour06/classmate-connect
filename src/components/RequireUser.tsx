import { Navigate, useLocation } from "react-router-dom";
import { useUserAuth } from "@/lib/user-auth-context";

export default function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUserAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

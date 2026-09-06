import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CalendarBlank } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { logoutAdmin } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function PageLayout({ title, children }: { title: string; children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-foreground px-6 py-4">
        <div className="container mx-auto flex items-center gap-4">
          {!isHome && (
            <Link to="/" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
              <ArrowLeft weight="bold" className="h-5 w-5" />
            </Link>
          )}
          <Link to="/" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#FBF3DB] flex items-center justify-center">
              <CalendarBlank weight="bold" className="h-4 w-4 text-[#956400]" />
            </div>
            <span className="font-display text-lg font-bold text-background">Schedule Sync</span>
          </Link>
          {title && !isHome && (
            <>
              <span className="text-primary-foreground/30">/</span>
              <span className="font-display text-sm font-medium text-background/80">{title}</span>
            </>
          )}
          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated ? (
                <Button size="sm" variant="secondary" onClick={() => { void logoutAdmin(); logout(); }}>
                  Logout
                </Button>
              ) : (
                <Link to="/login" className="text-sm text-primary-foreground/80 hover:text-primary-foreground">
                  Admin Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

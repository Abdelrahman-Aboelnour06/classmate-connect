import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calendar, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

export default function PageLayout({ title, children }: { title: string; children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-navy px-6 py-4">
        <div className="container mx-auto flex items-center gap-4">
          {!isHome && (
            <Link to="/" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <Link to="/" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg gradient-amber flex items-center justify-center">
              <Calendar className="h-4 w-4 text-secondary-foreground" />
            </div>
            <span className="font-display text-lg font-bold text-primary-foreground dark:text-cyan-400">Schedule Sync</span>
          </Link>
          {title && !isHome && (
            <>
              <span className="text-primary-foreground/30">/</span>
              <span className="font-display text-sm font-medium text-primary-foreground/80">{title}</span>
            </>
          )}
          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated ? (
                <Button size="sm" variant="secondary" onClick={logout}>
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

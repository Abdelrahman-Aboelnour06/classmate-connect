import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CalendarBlank, List, X } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useUserAuth } from "@/lib/user-auth-context";
import { Button } from "@/components/ui/button";
import { logoutAdmin } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function PageLayout({ title, children }: { title: string; children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { user } = useUserAuth();

  const navigation = [
    { label: "Compare", path: "/compare" },
    { label: "Students", path: "/students-by-courses" },
    { label: "Friends", path: "/friends" },
    { label: "Statistics", path: "/statistics" },
    { label: "Profile", path: "/profile" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-foreground px-4 py-3 sm:px-6 sm:py-4">
        <div className="container mx-auto flex min-w-0 items-center gap-3">
          {!isHome && (
            <Link to="/" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
              <ArrowLeft weight="bold" className="h-5 w-5" />
            </Link>
          )}
          <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setMenuOpen(false)}>
            <div className="brand-mark h-8 w-8 shrink-0 rounded-lg flex items-center justify-center">
              <CalendarBlank weight="bold" className="h-4 w-4" />
            </div>
            <span className="truncate font-display text-base font-bold text-background sm:text-lg">Schedule Sync</span>
          </Link>
          {title && !isHome && (
            <>
              <span className="text-primary-foreground/30">/</span>
              <span className="font-display text-sm font-medium text-background/80">{title}</span>
            </>
          )}
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {user && navigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${location.pathname === item.path ? "bg-primary-foreground/15 text-primary-foreground" : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <div className="hidden items-center gap-2 sm:flex">
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
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-primary-foreground hover:bg-primary-foreground/10 lg:hidden"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X weight="bold" aria-hidden="true" /> : <List weight="bold" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-navigation" className="container mx-auto mt-3 grid gap-1 border-t border-primary-foreground/15 pt-3 lg:hidden" aria-label="Mobile navigation">
            {user && navigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={`rounded-md px-3 py-3 text-sm ${location.pathname === item.path ? "bg-primary-foreground/15 text-primary-foreground" : "text-primary-foreground/80 hover:bg-primary-foreground/10"}`}
              >
                {item.label}
              </Link>
            ))}
            <div className="flex items-center justify-between border-t border-primary-foreground/15 pt-3 sm:hidden">
              <ThemeToggle />
              {isAuthenticated ? (
                <Button size="sm" variant="secondary" onClick={() => { void logoutAdmin(); logout(); setMenuOpen(false); }}>
                  Logout
                </Button>
              ) : (
                <Link to="/login" onClick={() => setMenuOpen(false)} className="text-sm text-primary-foreground/80">Admin Login</Link>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="container mx-auto min-w-0 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

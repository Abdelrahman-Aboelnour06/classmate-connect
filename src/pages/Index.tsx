import { Link } from "react-router-dom";
import { ArrowRight, ChartBar as BarChart3, CalendarBlank, Heart, List, UploadSimple, UsersThree } from "@phosphor-icons/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import UserLoginPage from "@/pages/UserLoginPage";
import { useUserAuth } from "@/lib/user-auth-context";

const modules = [
  {
    title: "Schedule Compare",
    description: "Compare schedules between students. Find shared courses, matching sessions, and commute overlap.",
    icon: CalendarBlank,
    iconClass: "bg-accent text-accent-foreground",
    path: "/compare",
    delay: "0.1s",
  },
  {
    title: "Students by Courses",
    description: "Find students taking specific course combinations. Filter by all or any match.",
    icon: UsersThree,
    iconClass: "bg-accent text-accent-foreground",
    path: "/students-by-courses",
    delay: "0.2s",
  },
  {
    title: "Friends & Enemies",
    description: "Track who you share classes with. Color-coded overlap analysis for your social circle.",
    icon: Heart,
    iconClass: "bg-accent text-accent-foreground",
    path: "/friends",
    delay: "0.3s",
  },
  {
    title: "Statistics",
    description: "View course grade distributions, averages, and calculate your percentile.",
    icon: BarChart3,
    iconClass: "brand-mark",
    path: "/statistics",
    delay: "0.4s",
  },
];

const Index = () => {
  const { isAuthenticated } = useAuth();
  const { user, loading } = useUserAuth();

  if (loading) return <div className="min-h-screen bg-background" aria-busy="true" />;
  if (!user) return <UserLoginPage />;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b border-border bg-foreground px-4 py-4 sm:px-6 sm:py-6">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <CalendarBlank weight="bold" className="h-5 w-5" />
            </div>
            <h1 className="truncate font-display text-lg font-bold text-background sm:text-xl">Schedule Sync</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/profile" className="text-sm text-background/80 hover:text-background">Profile</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6">
        {/* Hero section */}
        <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:text-left">
          <div>
          <h2
            className="font-editorial text-4xl italic leading-[1.1] text-foreground sm:text-5xl animate-fade-in"
          >
            Find the hours that overlap.
            <span className="block font-semibold text-yellow-600 dark:text-yellow-300">Keep the people that matter.</span>
          </h2>
          <p
            className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            Classmate Connect turns Cairo University schedules into a shared map of courses, classmates, and time together.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/compare" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Compare a schedule <ArrowRight weight="bold" aria-hidden="true" />
            </Link>
            <span className="text-sm text-muted-foreground">Built around your actual timetable</span>
          </div>
          </div>
          <div className="relative min-h-64 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-secondary/70" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">This week</p>
                  <p className="mt-1 font-display text-xl font-bold">Shared hours</p>
                </div>
                <List weight="bold" className="h-6 w-6 text-secondary" aria-hidden="true" />
              </div>
              {["Monday · 09:00", "Tuesday · 11:30", "Thursday · 13:00"].map((slot, index) => (
                <div key={slot} className="flex items-center gap-3 border-b border-border py-4 last:border-0">
                  <span className={`h-3 w-3 rounded-full ${index === 1 ? "bg-secondary" : "bg-primary"}`} aria-hidden="true" />
                  <span className="text-sm font-medium">{slot}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{index + 2} classmates</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Module cards */}
        <section className="grid gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => (
            <Link
              key={mod.path}
              to={mod.path}
              className="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover sm:p-6 animate-fade-in"
              style={{ animationDelay: mod.delay }}
            >
              <div className={`mb-4 inline-flex rounded-lg p-4 ${mod.iconClass}`}>
                <mod.icon weight="bold" className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold text-card-foreground">
                {mod.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {mod.description}
              </p>
              <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-secondary transition-all group-hover:gap-2">
                Explore
                <ArrowRight weight="bold" className="h-5 w-5" />
              </div>
            </Link>
          ))}
        </section>

        {isAuthenticated && (
          <section className="pb-20 flex justify-center animate-fade-in" style={{ animationDelay: "0.45s" }}>
            <Link
              to="/upload"
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <UploadSimple weight="bold" className="h-4 w-4" />
              Upload Data
            </Link>
          </section>
        )}
      </main>
    </div>
  );
};

export default Index;
import { Link } from "react-router-dom";
import { ArrowRight, ChartBar as BarChart3, CalendarBlank, Heart, UploadSimple, UsersThree } from "@phosphor-icons/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import UserLoginPage from "@/pages/UserLoginPage";
import { useUserAuth } from "@/lib/user-auth-context";

const modules = [
  {
    title: "Schedule Compare",
    description: "Compare schedules between students. Find shared courses, matching sessions, and commute overlap.",
    icon: CalendarBlank,
    iconClass: "bg-[#E7F0F7] text-[#42637A]",
    path: "/compare",
    delay: "0.1s",
  },
  {
    title: "Students by Courses",
    description: "Find students taking specific course combinations. Filter by all or any match.",
    icon: UsersThree,
    iconClass: "bg-[#E8F3E7] text-[#47704A]",
    path: "/students-by-courses",
    delay: "0.2s",
  },
  {
    title: "Friends & Enemies",
    description: "Track who you share classes with. Color-coded overlap analysis for your social circle.",
    icon: Heart,
    iconClass: "bg-[#F8E8E8] text-[#8A4A4A]",
    path: "/friends",
    delay: "0.3s",
  },
  {
    title: "Statistics",
    description: "View course grade distributions, averages, and calculate your percentile.",
    icon: BarChart3,
    iconClass: "bg-[#FBF3DB] text-[#956400]",
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
      <header className="border-b border-border bg-foreground px-6 py-6">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#FBF3DB] flex items-center justify-center">
              <CalendarBlank weight="bold" className="h-5 w-5 text-[#956400]" />
            </div>
            <h1 className="font-display text-xl font-bold text-background">Schedule Sync</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/user-login" className="text-sm text-background/80 hover:text-background">User Login</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6">
        {/* Hero section */}
        <section className="py-16 text-center">
          <h2
            className="font-editorial text-4xl italic leading-[1.1] tracking-[-0.03em] text-foreground sm:text-5xl animate-fade-in"
          >
            cairo university
            <span className="block text-secondary">Schedule Platform</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-4xl text-lg text-muted-foreground animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            Compare schedules and analyze course overlaps — all in one place.
          </p>
        </section>

        {/* Module cards */}
        <section className="grid gap-6 pb-10 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <Link
              key={mod.path}
              to={mod.path}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 hover:transition-shadow hover:duration-200 animate-fade-in"
              style={{ animationDelay: mod.delay }}
            >
              <div className={`mb-4 inline-flex rounded-lg p-4 ${mod.iconClass}`}>
                <mod.icon weight="bold" className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold text-card-foreground">
                {mod.title}
              </h3>
              <p className="mt-2 text-base text-muted-foreground leading-relaxed">
                {mod.description}
              </p>
              <div className="mt-4 flex items-center gap-1 text-base font-medium text-secondary transition-all group-hover:gap-2">
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
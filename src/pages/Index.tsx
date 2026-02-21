import { Link } from "react-router-dom";
import { Calendar, Users, Search, Heart, Upload, ArrowRight } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const modules = [
  {
    title: "Schedule Compare",
    description: "Compare schedules between students. Find shared courses, matching sessions, and commute overlap.",
    icon: Calendar,
    path: "/compare",
    delay: "0.1s",
  },
  {
    title: "Timetable Generator",
    description: "Generate conflict-free timetable combinations from your selected courses.",
    icon: Search,
    path: "/timetable",
    delay: "0.2s",
  },
  {
    title: "Students by Courses",
    description: "Find students taking specific course combinations. Filter by all or any match.",
    icon: Users,
    path: "/students-by-courses",
    delay: "0.3s",
  },
  {
    title: "Friends & Enemies",
    description: "Track who you share classes with. Color-coded overlap analysis for your social circle.",
    icon: Heart,
    path: "/friends",
    delay: "0.4s",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="gradient-navy px-6 py-6">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-amber flex items-center justify-center">
              <Calendar className="h-5 w-5 text-secondary-foreground" />
            </div>
            <h1 className="font-display text-xl font-bold text-primary-foreground dark:text-cyan-400">Schedule Sync</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-6">
        {/* Hero section */}
        <section className="py-16 text-center">
          <h2
            className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl animate-fade-in"
          >
            cairo university
            <span className="block text-secondary">Schedule Platform</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            Compare schedules, generate timetables, and analyze course overlaps — all in one place.
          </p>
        </section>

        {/* Module cards */}
        <section className="grid gap-6 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => (
            <Link
              key={mod.path}
              to={mod.path}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 animate-fade-in"
              style={{ animationDelay: mod.delay }}
            >
              <div className="mb-4 inline-flex rounded-lg gradient-amber p-4">
                <mod.icon className="h-6 w-6 text-secondary-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold text-card-foreground">
                {mod.title}
              </h3>
              <p className="mt-2 text-base text-muted-foreground leading-relaxed">
                {mod.description}
              </p>
              <div className="mt-4 flex items-center gap-1 text-base font-medium text-secondary transition-all group-hover:gap-2">
                Explore
                <ArrowRight className="h-5 w-5" />
              </div>
            </Link>
          ))}
        </section>

        <section className="pb-20 flex justify-center animate-fade-in" style={{ animationDelay: "0.45s" }}>
          <Link
            to="/upload"
            className="flex items-center gap-2 rounded-lg bg-secondary px-5 py-3 text-sm font-medium text-secondary-foreground transition-all hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Upload Data
          </Link>
        </section>
      </main>
    </div>
  );
};

export default Index;

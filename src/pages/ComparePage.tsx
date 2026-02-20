import { useState, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import StudentSearch from "@/components/StudentSearch";
import { getStudentSchedule, StudentScheduleRecord, formatTime } from "@/lib/api";
import { Loader2, CheckCircle2, ArrowLeftRight, Clock } from "lucide-react";

type Student = { student_id: string; student_name: string; student_name_ar: string | null };

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

export default function ComparePage() {
  const [studentA, setStudentA] = useState<Student | null>(null);
  const [studentB, setStudentB] = useState<Student | null>(null);
  const [scheduleA, setScheduleA] = useState<StudentScheduleRecord[]>([]);
  const [scheduleB, setScheduleB] = useState<StudentScheduleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSelectA = async (s: Student | null) => {
    setStudentA(s);
    if (s) {
      setLoading(true);
      try { setScheduleA(await getStudentSchedule(s.student_id)); } catch { setScheduleA([]); }
      setLoading(false);
    } else {
      setScheduleA([]);
    }
  };

  const handleSelectB = async (s: Student | null) => {
    setStudentB(s);
    if (s) {
      setLoading(true);
      try { setScheduleB(await getStudentSchedule(s.student_id)); } catch { setScheduleB([]); }
      setLoading(false);
    } else {
      setScheduleB([]);
    }
  };

  const analysis = useMemo(() => {
    if (!scheduleA.length || !scheduleB.length) return null;

    const sharedCourses = [...new Set(scheduleA.map(s => s.course_code))]
      .filter(code => scheduleB.some(s => s.course_code === code));

    const exactMatches: StudentScheduleRecord[] = [];
    const parallelSessions: Array<{ a: StudentScheduleRecord; b: StudentScheduleRecord }> = [];

    for (const a of scheduleA) {
      for (const b of scheduleB) {
        if (a.day_of_week === b.day_of_week && a.start_time === b.start_time && a.class_type === b.class_type) {
          if (a.course_code === b.course_code && a.location === b.location) {
            exactMatches.push(a);
          } else if (a.course_code === b.course_code && a.location !== b.location) {
            parallelSessions.push({ a, b });
          }
        }
      }
    }

    const sharedDays = [...new Set(scheduleA.map(s => s.day_of_week))]
      .filter(day => scheduleB.some(s => s.day_of_week === day));

    return { sharedCourses, exactMatches, parallelSessions, sharedDays };
  }, [scheduleA, scheduleB]);

  const renderScheduleList = (schedule: StudentScheduleRecord[], label: string) => {
    const byDay = DAYS.reduce<Record<string, StudentScheduleRecord[]>>((acc, day) => {
      const items = schedule.filter(s => s.day_of_week === day);
      if (items.length) acc[day] = items.sort((a, b) => a.start_time.localeCompare(b.start_time));
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-foreground">{label}</h3>
        {Object.entries(byDay).map(([day, items]) => (
          <div key={day}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{day}</h4>
            <div className="space-y-2">
              {items.map((item, i) => {
                const isExact = analysis?.exactMatches.some(
                  e => e.course_code === item.course_code && e.day_of_week === item.day_of_week && e.start_time === item.start_time
                );
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 text-sm transition-colors ${
                      isExact ? "border-secondary bg-secondary/10" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-card-foreground">{item.course_code}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(item.start_time)} – {formatTime(item.end_time)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.course_name} • {item.class_type}
                      {item.location && ` • ${item.location}`}
                      {item.group_number && ` • G${item.group_number}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!schedule.length && <p className="text-sm text-muted-foreground">No schedule data found.</p>}
      </div>
    );
  };

  return (
    <PageLayout title="Schedule Compare">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="animate-fade-in">
          <h2 className="font-display text-2xl font-bold text-foreground">Schedule Comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select two students to compare their schedules and find overlaps.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <StudentSearch label="Student A" onSelect={handleSelectA} selected={studentA} />
          <StudentSearch label="Student B (optional)" onSelect={handleSelectB} selected={studentB} />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-secondary" />
          </div>
        )}

        {/* Analysis summary */}
        {analysis && !loading && (
          <div className="grid gap-4 sm:grid-cols-3 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 text-secondary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-display font-semibold">Shared Courses</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-card-foreground">{analysis.sharedCourses.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{analysis.sharedCourses.join(", ") || "None"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 text-secondary">
                <ArrowLeftRight className="h-5 w-5" />
                <span className="font-display font-semibold">Exact Matches</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-card-foreground">{analysis.exactMatches.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Same course, time & location</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 text-secondary">
                <Clock className="h-5 w-5" />
                <span className="font-display font-semibold">Shared Days</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-card-foreground">{analysis.sharedDays.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{analysis.sharedDays.join(", ") || "None"}</p>
            </div>
          </div>
        )}

        {/* Schedule lists */}
        {!loading && (scheduleA.length > 0 || scheduleB.length > 0) && (
          <div className="grid gap-8 sm:grid-cols-2 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            {scheduleA.length > 0 && renderScheduleList(scheduleA, studentA?.student_name || "Student A")}
            {scheduleB.length > 0 && renderScheduleList(scheduleB, studentB?.student_name || "Student B")}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

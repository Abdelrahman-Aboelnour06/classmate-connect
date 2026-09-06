import { useState, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import ScheduleGrid from "@/components/ScheduleGrid";
import ComparisonScheduleGrid from "@/components/ComparisonScheduleGrid";
import StudentSearch from "@/components/StudentSearch";
import { getStudentSchedule, StudentScheduleRecord, formatTime } from "@/lib/api";
import { convertToRamadanSessionTiming } from "@/lib/ramadan-timing";
import { ArrowsLeftRight as ArrowLeftRight, CheckCircle as CheckCircle2, CircleNotch as Loader2, Clock, List, SquaresFour as Grid2x2 } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Student = { student_id: string; student_name: string; student_name_ar: string | null };

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

// Normalize times ending in :50 by adding 10 minutes
function normalizeTime(time: string): string {
  let [hour, minute] = time.split(":").map(Number);
  
  if (minute === 50) {
    minute = 0;
    hour += 1;
  }
  
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function ComparePage() {
  const [studentA, setStudentA] = useState<Student | null>(null);
  const [studentB, setStudentB] = useState<Student | null>(null);
  const [scheduleA, setScheduleA] = useState<StudentScheduleRecord[]>([]);
  const [scheduleB, setScheduleB] = useState<StudentScheduleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isRamadanTiming, setIsRamadanTiming] = useState(false);

  const handleSelectA = async (s: Student | null) => {
    setStudentA(s);
    if (s) {
      setLoading(true);
      try { setScheduleA(await getStudentSchedule(s.student_id, true)); } catch { setScheduleA([]); }
      setLoading(false);
    } else {
      setScheduleA([]);
    }
  };

  const handleSelectB = async (s: Student | null) => {
    setStudentB(s);
    if (s) {
      setLoading(true);
      try { setScheduleB(await getStudentSchedule(s.student_id, true)); } catch { setScheduleB([]); }
      setLoading(false);
    } else {
      setScheduleB([]);
    }
  };

  const handleClassmateSelect = async (student: Student) => {
    if (!studentA) {
      return;
    }

    if (student.student_id === studentA.student_id) {
      return;
    }

    await handleSelectB(student);
  };

  // Convert schedules for display based on timing mode
  const displayScheduleA = useMemo(() => {
    // Normalize times ending in :50 for all sessions, but keep originals
    const normalizedSchedule = scheduleA.map(session => ({
      ...session,
      original_start_time: session.start_time,
      original_end_time: session.end_time,
      start_time: normalizeTime(session.start_time),
      end_time: normalizeTime(session.end_time),
    }));

    if (!isRamadanTiming) return normalizedSchedule;

    return normalizedSchedule.map((session) => {
      const converted = convertToRamadanSessionTiming(session.start_time, session.end_time);
      return {
        ...session,
        start_time: converted.startTime,
        end_time: converted.endTime,
      };
    });
  }, [scheduleA, isRamadanTiming]);

  const displayScheduleB = useMemo(() => {
    // Normalize times ending in :50 for all sessions, but keep originals
    const normalizedSchedule = scheduleB.map((session) => ({
      ...session,
      original_start_time: session.start_time,
      original_end_time: session.end_time,
      start_time: normalizeTime(session.start_time),
      end_time: normalizeTime(session.end_time),
    }));

    if (!isRamadanTiming) return normalizedSchedule;

    return normalizedSchedule.map((session) => {
      const converted = convertToRamadanSessionTiming(session.start_time, session.end_time);
      return {
        ...session,
        start_time: converted.startTime,
        end_time: converted.endTime,
      };
    });
  }, [scheduleB, isRamadanTiming]);

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
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between animate-fade-in">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Schedule Comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select two students to compare their schedules and find overlaps.
            </p>
          </div>
          
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="ramadan-toggle-compare" className="text-sm font-medium cursor-pointer">
              {isRamadanTiming ? "Ramadan Timing" : "Standard Timing"}
            </Label>
            <Switch
              id="ramadan-toggle-compare"
              checked={isRamadanTiming}
              onCheckedChange={setIsRamadanTiming}
            />
          </div>
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
                <span className="font-display font-semibold">Shared Classes</span>
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
          <div className="space-y-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            {isRamadanTiming && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <Clock className="inline h-4 w-4 mr-2" />
                  <strong>Ramadan Timing:</strong> Contact hours reduced to 45 minutes (40 min study + 5 min break). 
                  Classes ending after 7:00 PM are adjusted to 4:15 PM and require makeup coordination.
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <div className="flex border border-border rounded-lg">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-none rounded-l-[calc(0.5rem-1px)]"
                >
                  <Grid2x2 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-none rounded-r-[calc(0.5rem-1px)] border-l-0"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {viewMode === "grid" ? (
              <>
                {scheduleA.length > 0 && scheduleB.length > 0 ? (
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                      Comparison: {studentA?.student_name || "Student A"} vs {studentB?.student_name || "Student B"}
                    </h3>
                    <div className="mb-4 space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgb(134 239 172)" }} />
                        <span className="text-muted-foreground">Shared Class (Same room)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgb(253 186 116)" }} />
                        <span className="text-muted-foreground">Same course & time, different room</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgb(219 234 254)" }} />
                        <span className="text-muted-foreground">{studentA?.student_name || "Student A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgb(236 201 75)" }} />
                        <span className="text-muted-foreground">{studentB?.student_name || "Student B"}</span>
                      </div>
                    </div>
                    <ComparisonScheduleGrid
                      scheduleA={displayScheduleA}
                      scheduleB={displayScheduleB}
                      exactMatches={analysis?.exactMatches || []}
                      studentAName={studentA?.student_name || "Student A"}
                      studentBName={studentB?.student_name || "Student B"}
                      onClassmateSelect={handleClassmateSelect}
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {scheduleA.length > 0 && (
                      <div>
                        <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                          {studentA?.student_name || "Student A"}
                        </h3>
                        <ScheduleGrid
                          schedule={displayScheduleA}
                          highlightCourses={new Set(analysis?.exactMatches.map(e => e.course_code) || [])}
                          onClassmateSelect={handleClassmateSelect}
                        />
                      </div>
                    )}
                    {scheduleB.length > 0 && (
                      <div>
                        <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                          {studentB?.student_name || "Student B"}
                        </h3>
                        <ScheduleGrid schedule={displayScheduleB} highlightCourses={new Set(analysis?.exactMatches.map(e => e.course_code) || [])} />
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-8">
                {scheduleA.length > 0 && renderScheduleList(displayScheduleA, studentA?.student_name || "Student A")}
                {scheduleB.length > 0 && renderScheduleList(displayScheduleB, studentB?.student_name || "Student B")}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

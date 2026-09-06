import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/PageLayout";
import ScheduleGrid from "@/components/ScheduleGrid";
import {
  BusyTimeSlotFilter,
  exportStudentsByCoursesExcel,
  findStudentsByCourses,
  getAllCourses,
  getStudentSchedule,
  StudentsByCoursesAvailabilityMode,
  StudentScheduleRecord,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, CircleNotch as Loader2, DownloadSimple as Download } from "@phosphor-icons/react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type AvailabilitySearchFilter = {
  busyTimeSlot?: BusyTimeSlotFilter;
  availabilityMode: StudentsByCoursesAvailabilityMode;
  summary: string | null;
};

function formatMinutesToTime(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildFreeNowSlot(now: Date): { slot: BusyTimeSlotFilter; summary: string } {
  const dayOfWeek = DAYS[now.getDay()];
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const startMinute = currentMinute >= 23 * 60 + 59 ? 23 * 60 + 58 : currentMinute;
  const endMinute = Math.min(startMinute + 1, 23 * 60 + 59);
  const startTime = formatMinutesToTime(startMinute);
  const endTime = formatMinutesToTime(endMinute);

  return {
    slot: {
      dayOfWeek,
      startTime,
      endTime,
    },
    summary: `Free now (${dayOfWeek} ${startTime})`,
  };
}

export default function StudentsByCoursesPage() {
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [matchType, setMatchType] = useState<"all" | "any">("all");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; students: Array<{ student_id: string; student_name: string; student_name_ar: string | null }> } | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{ student_id: string; student_name: string } | null>(null);
  const [schedule, setSchedule] = useState<StudentScheduleRecord[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [busyDayOfWeek, setBusyDayOfWeek] = useState("");
  const [busyStartTime, setBusyStartTime] = useState("");
  const [busyEndTime, setBusyEndTime] = useState("");
  const [freeNowOnly, setFreeNowOnly] = useState(false);
  const [resultFilterSummary, setResultFilterSummary] = useState<string | null>(null);

  const coursesQuery = useQuery({
    queryKey: ["all-courses"],
    queryFn: getAllCourses,
  });

  const filteredCourses = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = coursesQuery.data || [];
    const filtered = q
      ? list.filter((course) => course.course_code.toLowerCase().includes(q) || course.course_name.toLowerCase().includes(q))
      : list;

    const selectedSet = new Set(selectedCourses);
    const pinned = filtered.filter((course) => selectedSet.has(course.course_code));
    const rest = filtered.filter((course) => !selectedSet.has(course.course_code));
    const remainingSlots = Math.max(0, 60 - pinned.length);

    return [...pinned, ...rest.slice(0, remainingSlots)];
  }, [coursesQuery.data, filter, selectedCourses]);

  const highlightedCourses = useMemo(
    () => new Set(selectedCourses.map((courseCode) => courseCode.toUpperCase())),
    [selectedCourses],
  );

  const toggleCourse = (code: string) => {
    setSelectedCourses((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const buildAvailabilityFilter = (): AvailabilitySearchFilter => {
    if (freeNowOnly) {
      const freeNowSlot = buildFreeNowSlot(new Date());
      return {
        busyTimeSlot: freeNowSlot.slot,
        availabilityMode: "free",
        summary: freeNowSlot.summary,
      };
    }

    const hasAnyInput = Boolean(busyDayOfWeek || busyStartTime || busyEndTime);
    if (!hasAnyInput) {
      return {
        availabilityMode: "busy",
        summary: null,
      };
    }

    if (!busyDayOfWeek || !busyStartTime || !busyEndTime) {
      throw new Error("To filter busy students, select day, start time, and end time.");
    }

    if (busyEndTime <= busyStartTime) {
      throw new Error("Busy slot end time must be after start time.");
    }

    return {
      busyTimeSlot: {
        dayOfWeek: busyDayOfWeek,
        startTime: busyStartTime,
        endTime: busyEndTime,
      },
      availabilityMode: "busy",
      summary: `Busy at ${busyDayOfWeek} ${busyStartTime}-${busyEndTime}`,
    };
  };

  const freeNowPreview = freeNowOnly ? buildFreeNowSlot(new Date()) : null;

  const runSearch = async () => {
    if (!selectedCourses.length) return;

    setExportError(null);
    setSelectedStudent(null);
    setSchedule([]);

    let filterConfig: AvailabilitySearchFilter;
    try {
      filterConfig = buildAvailabilityFilter();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Invalid busy slot filter.");
      return;
    }

    setLoading(true);
    try {
      setResult(
        await findStudentsByCourses(
          selectedCourses,
          matchType,
          filterConfig.busyTimeSlot,
          filterConfig.availabilityMode,
        ),
      );
      setResultFilterSummary(filterConfig.summary);
    } catch (error) {
      setResult(null);
      setResultFilterSummary(null);
      setExportError(error instanceof Error ? error.message : "Failed to find students.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCourses.length) return;

    let filterConfig: AvailabilitySearchFilter;
    try {
      filterConfig = buildAvailabilityFilter();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Invalid busy slot filter.");
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const { blob, fileName } = await exportStudentsByCoursesExcel(
        selectedCourses,
        matchType,
        filterConfig.busyTimeSlot,
        filterConfig.availabilityMode,
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export students.");
    } finally {
      setExporting(false);
    }
  };

  const handleStudentClick = async (student: { student_id: string; student_name: string }) => {
    if (selectedStudent?.student_id === student.student_id) {
      setSelectedStudent(null);
      setSchedule([]);
      return;
    }
    setSelectedStudent(student);
    setLoadingSchedule(true);
    try {
      const data = await getStudentSchedule(student.student_id, true);
      setSchedule(data.map((s) => ({
        ...s,
        original_start_time: s.start_time,
        original_end_time: s.end_time,
      })));
    } catch {
      setSchedule([]);
    } finally {
      setLoadingSchedule(false);
    }
  };

  return (
    <PageLayout title="Students by Courses">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Students by Courses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find students taking all selected courses or at least one.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter courses..." />

          <div className="max-h-56 overflow-auto grid gap-2 sm:grid-cols-2">
            {filteredCourses.map((course) => {
              const isSelected = selectedCourses.includes(course.course_code);
              return (
                <button
                  key={course.course_code}
                  onClick={() => toggleCourse(course.course_code)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${isSelected ? "border-secondary bg-secondary/10" : "border-border"}`}
                >
                  <p className="font-medium">{course.course_code}</p>
                  <p className="text-xs text-muted-foreground">{course.course_name}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-border/70 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Who&apos;s free now</p>
                <p className="text-xs text-muted-foreground">
                  Show students with no class at the current minute.
                </p>
              </div>
              <Switch
                checked={freeNowOnly}
                onCheckedChange={(checked) => {
                  setFreeNowOnly(checked);
                  setExportError(null);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Busy time slot filter (optional)</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBusyDayOfWeek("");
                  setBusyStartTime("");
                  setBusyEndTime("");
                }}
                disabled={freeNowOnly || (!busyDayOfWeek && !busyStartTime && !busyEndTime)}
              >
                Clear
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="busy-day">Day</label>
                <select
                  id="busy-day"
                  value={busyDayOfWeek}
                  onChange={(event) => setBusyDayOfWeek(event.target.value)}
                  disabled={freeNowOnly}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select day</option>
                  {DAYS.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="busy-start">Start time</label>
                <Input
                  id="busy-start"
                  type="time"
                  step={300}
                  value={busyStartTime}
                  disabled={freeNowOnly}
                  onChange={(event) => setBusyStartTime(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="busy-end">End time</label>
                <Input
                  id="busy-end"
                  type="time"
                  step={300}
                  value={busyEndTime}
                  disabled={freeNowOnly}
                  onChange={(event) => setBusyEndTime(event.target.value)}
                />
              </div>
            </div>

            {freeNowOnly ? (
              <p className="text-xs text-muted-foreground">
                Free-now mode is active.
                {freeNowPreview ? ` Current slot: ${freeNowPreview.slot.dayOfWeek} ${freeNowPreview.slot.startTime}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                When set, results only include students who have at least one class overlapping this slot.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant={matchType === "all" ? "default" : "outline"} size="sm" onClick={() => setMatchType("all")}>All</Button>
            <Button variant={matchType === "any" ? "default" : "outline"} size="sm" onClick={() => setMatchType("any")}>Any</Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={handleExport} disabled={!selectedCourses.length || loading || exporting}>
                {exporting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-1 h-4 w-4" />
                    Export Excel
                  </>
                )}
              </Button>
              <Button onClick={runSearch} disabled={!selectedCourses.length || loading}>
                {loading ? "Searching..." : "Find Students"}
              </Button>
            </div>
          </div>

          {exportError && <p className="text-sm text-destructive">{exportError}</p>}
        </div>

        {result && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-3">
              Matched students: {result.count}
              {resultFilterSummary ? ` • ${resultFilterSummary}` : ""}
            </p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {result.students.map((student) => {
                const isActive = selectedStudent?.student_id === student.student_id;
                return (
                  <button
                    key={student.student_id}
                    onClick={() => handleStudentClick(student)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "border-secondary bg-secondary/10 ring-1 ring-secondary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-medium text-card-foreground">{student.student_name}</p>
                    <p className="text-xs text-muted-foreground">{student.student_id}{student.student_name_ar ? ` • ${student.student_name_ar}` : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedStudent && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setSchedule([]); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {selectedStudent.student_name}'s Schedule
                </h3>
                <p className="text-xs text-muted-foreground">{selectedStudent.student_id}</p>
              </div>
            </div>

            {loadingSchedule ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
              </div>
            ) : schedule.length > 0 ? (
              <ScheduleGrid schedule={schedule} highlightCourses={highlightedCourses} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No schedule found for this student.</p>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

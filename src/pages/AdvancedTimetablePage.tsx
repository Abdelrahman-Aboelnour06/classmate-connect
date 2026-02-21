"use client";

import { useMemo, useState } from "react";
import PageLayout from "@/components/PageLayout";
import ScheduleGrid from "@/components/ScheduleGrid";
import { useQuery } from "@tanstack/react-query";
import { generateTimetables, getAllCourses, formatTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Grid2x2, List } from "lucide-react";

type Session = {
  course_code: string;
  course_name: string;
  class_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string | null;
  group_number: string | null;
};

export default function AdvancedTimetablePage() {
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ total: number; current_index: number; has_next: boolean; timetable: Session[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const coursesQuery = useQuery({
    queryKey: ["all-courses"],
    queryFn: getAllCourses,
  });

  const filteredCourses = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = coursesQuery.data || [];
    if (!q) return list.slice(0, 80);
    return list
      .filter((course) => course.course_code.toLowerCase().includes(q) || course.course_name.toLowerCase().includes(q))
      .slice(0, 80);
  }, [coursesQuery.data, filter]);

  const toggleCourse = (code: string) => {
    setSelectedCourses((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const runGeneration = async (nextIndex = 0) => {
    if (!selectedCourses.length) return;
    setLoading(true);
    try {
      const data = await generateTimetables(selectedCourses, nextIndex, 100);
      setResult(data);
      setIndex(data.current_index);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="Timetable Generator">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Timetable Generator</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select courses, then generate conflict-free timetable options.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter courses by code or name..." />
          <div className="max-h-56 overflow-auto grid gap-2 sm:grid-cols-2">
            {filteredCourses.map((course) => {
              const isSelected = selectedCourses.includes(course.course_code);
              return (
                <button
                  key={course.course_code}
                  onClick={() => toggleCourse(course.course_code)}
                  className={`text-left rounded-lg border px-3 py-2 text-sm ${isSelected ? "border-secondary bg-secondary/10" : "border-border"}`}
                >
                  <p className="font-medium">{course.course_code}</p>
                  <p className="text-xs text-muted-foreground">{course.course_name}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedCourses.map((code) => (
              <span key={code} className="rounded-md bg-secondary/10 px-2 py-1 text-xs text-secondary">
                {code}
              </span>
            ))}
          </div>

          <Button onClick={() => runGeneration(0)} disabled={!selectedCourses.length || loading}>
            {loading ? "Generating..." : "Generate Timetables"}
          </Button>
        </div>

        {result && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Option {result.current_index + 1} of {result.total}
              </p>
              <div className="flex gap-2">
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
                <Button variant="outline" size="sm" disabled={index <= 0 || loading} onClick={() => runGeneration(index - 1)}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={!result.has_next || loading} onClick={() => runGeneration(index + 1)}>
                  Next
                </Button>
              </div>
            </div>

            {viewMode === "grid" ? (
              <ScheduleGrid schedule={result.timetable} />
            ) : (
              <div className="space-y-2">
                {result.timetable.map((session, idx) => (
                  <div key={idx} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{session.course_code} • {session.class_type}</span>
                      <span className="text-xs text-muted-foreground">{session.day_of_week}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                      {session.location ? ` • ${session.location}` : ""}
                      {session.group_number ? ` • G${session.group_number}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

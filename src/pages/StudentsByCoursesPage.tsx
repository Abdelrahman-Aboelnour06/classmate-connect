import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/PageLayout";
import { findStudentsByCourses, getAllCourses } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StudentsByCoursesPage() {
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [matchType, setMatchType] = useState<"all" | "any">("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; students: Array<{ student_id: string; student_name: string; student_name_ar: string | null }> } | null>(null);

  const coursesQuery = useQuery({
    queryKey: ["all-courses"],
    queryFn: getAllCourses,
  });

  const filteredCourses = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = coursesQuery.data || [];
    if (!q) return list.slice(0, 60);
    return list
      .filter((course) => course.course_code.toLowerCase().includes(q) || course.course_name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [coursesQuery.data, filter]);

  const toggleCourse = (code: string) => {
    setSelectedCourses((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const runSearch = async () => {
    if (!selectedCourses.length) return;
    setLoading(true);
    try {
      setResult(await findStudentsByCourses(selectedCourses, matchType));
    } finally {
      setLoading(false);
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

          <div className="flex items-center gap-2">
            <Button variant={matchType === "all" ? "default" : "outline"} size="sm" onClick={() => setMatchType("all")}>All</Button>
            <Button variant={matchType === "any" ? "default" : "outline"} size="sm" onClick={() => setMatchType("any")}>Any</Button>
            <Button onClick={runSearch} disabled={!selectedCourses.length || loading} className="ml-auto">
              {loading ? "Searching..." : "Find Students"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-3">Matched students: {result.count}</p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {result.students.map((student) => (
                <div key={student.student_id} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="font-medium text-card-foreground">{student.student_name}</p>
                  <p className="text-xs text-muted-foreground">{student.student_id}{student.student_name_ar ? ` • ${student.student_name_ar}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

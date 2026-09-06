import { useState, useEffect, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from "recharts";
import { Calculator, ChartBar as BarChart3, Check, CaretUpDown as ChevronsUpDown, CircleNotch as Loader2, WarningCircle as AlertCircle } from "@phosphor-icons/react";
import { fetchStatisticsData, fetchStatisticsFilters, getAllCourses } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function StatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [semesters, setSemesters] = useState<string[]>(["All"]);
  const [programs, setPrograms] = useState<string[]>(["All"]);
  const [availableCourses, setAvailableCourses] = useState<{code: string, name: string}[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [semester, setSemester] = useState("All");
  const [program, setProgram] = useState("All");
  const [open, setOpen] = useState(false);
  
  const [dbData, setDbData] = useState<any[]>([]);
  const [userGrade, setUserGrade] = useState("");
  const [percentileResult, setPercentileResult] = useState<number | null>(null);

  useEffect(() => {
    async function loadFilters() {
      try {
        const [statsData, coursesData] = await Promise.all([
          fetchStatisticsFilters(),
          getAllCourses().catch(() => [])
        ]);

        const map: Record<string, string> = {};
        if (coursesData && Array.isArray(coursesData)) {
          coursesData.forEach(c => map[c.course_code] = c.course_name);
        }

        if (statsData && Array.isArray(statsData)) {
          const uniqueSemesters = Array.from(new Set(statsData.map((d: any) => d.semester))).filter(Boolean) as string[];
          
          // Smart Sort for Semesters
          uniqueSemesters.sort((a, b) => {
            const yearA = parseInt(a.match(/\d{4}/)?.[0] || "0");
            const yearB = parseInt(b.match(/\d{4}/)?.[0] || "0");
            if (yearA !== yearB) return yearB - yearA; 
            const terms: Record<string, number> = { "Fall": 3, "Summer": 2, "Spring": 1 };
            const termA = terms[a.split(' ')[0]] || 0;
            const termB = terms[b.split(' ')[0]] || 0;
            return termB - termA;
          });

          const uniquePrograms = Array.from(new Set(statsData.map((d: any) => d.program))).filter(Boolean) as string[];
          uniquePrograms.sort((a, b) => a.localeCompare(b));

          setSemesters(["All", ...uniqueSemesters]);
          setPrograms(["All", ...uniquePrograms]);

          const uniqueCodes = Array.from(new Set(statsData.map((d: any) => d.course_code))).filter(Boolean) as string[];
          const formattedCourses = uniqueCodes.map(code => ({ code, name: map[code] || "" }));
          
          formattedCourses.sort((a, b) => a.code.localeCompare(b.code));
          setAvailableCourses(formattedCourses);
        }
      } catch (err: any) {
        setError(err.message || "Could not connect to backend.");
      }
    }
    loadFilters();
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const courseParam = searchQuery || "All";
        const data = await fetchStatisticsData(courseParam, semester, program);
        setDbData(data || []);
      } catch (err: any) {
        setError(err.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [semester, program, searchQuery]);

  const chartData = useMemo(() => {
    const gradeMap: Record<string, number> = {};
    dbData.forEach(row => {
      gradeMap[row.grade] = Number(row.student_count) || 0;
    });
    const gradeOrder = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
    return Object.keys(gradeMap)
      .sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b))
      .map(grade => ({ grade, count: gradeMap[grade] }));
  }, [dbData]);

  const calculatePercentile = () => {
    if (!userGrade || chartData.length === 0) return;
    const gradeIndex = chartData.findIndex(d => d.grade.toUpperCase() === userGrade.toUpperCase());
    if (gradeIndex === -1) { alert("Invalid grade."); return; }
    const totalStudents = chartData.reduce((sum, item) => sum + item.count, 0);
    const studentsBelow = chartData.slice(gradeIndex + 1).reduce((sum, item) => sum + item.count, 0);
    const studentsSame = chartData[gradeIndex].count / 2;
    setPercentileResult(Math.round(((studentsBelow + studentsSame) / totalStudents) * 100));
  };

  return (
    <PageLayout title="Course Statistics">
      <div className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Database Explorer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col space-y-6">
            <div className="w-full space-y-2">
              <label className="text-sm font-medium">Find Course</label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between h-12 bg-secondary/10">
                    <span className="truncate">
                      {searchQuery ? `${searchQuery} - ${availableCourses.find((c) => c.code === searchQuery)?.name}` : "Search..."}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Type code or name..." />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandEmpty>No courses found.</CommandEmpty>
                      <CommandGroup>
                        {availableCourses.map((course) => (
                          <CommandItem key={course.code} value={`${course.code} ${course.name}`} onSelect={() => { setSearchQuery(course.code === searchQuery ? "" : course.code); setOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", searchQuery === course.code ? "opacity-100" : "opacity-0")} />
                            <span className="font-medium">{course.code}</span>
                            <span className="ml-2 text-muted-foreground">{course.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Semester</label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger><SelectValue placeholder="Semester" /></SelectTrigger>
                  <SelectContent>{semesters.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Program</label>
                <Select value={program} onValueChange={setProgram}>
                  <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
                  <SelectContent>{programs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
          <CardContent className="h-[350px]">
            {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="grade" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" className="text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
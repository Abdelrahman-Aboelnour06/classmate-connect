import { useMemo, useState } from "react";
import { formatTime, StudentScheduleRecord, getClassStudents } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getTimeSlotIndex(time: string): number {
  const [hour] = time.split(":").map(Number);
  return hour;
}

function getMinuteOffset(time: string): number {
  const [, minute] = time.split(":").map(Number);
  return minute;
}

interface ComparisonScheduleGridProps {
  scheduleA: StudentScheduleRecord[];
  scheduleB: StudentScheduleRecord[];
  exactMatches: StudentScheduleRecord[];
  studentAName?: string;
  studentBName?: string;
}

export default function ComparisonScheduleGrid({
  scheduleA,
  scheduleB,
  exactMatches,
  studentAName = "Student A",
  studentBName = "Student B",
}: ComparisonScheduleGridProps) {
  const [selectedClass, setSelectedClass] = useState<StudentScheduleRecord | null>(null);

  const { data: classmates, isLoading: loadingClassmates } = useQuery({
    queryKey: ["class-students", selectedClass?.course_code, selectedClass?.class_type, selectedClass?.day_of_week, selectedClass?.original_start_time, selectedClass?.group_number],
    queryFn: () => {
      if (!selectedClass) return Promise.resolve([]);
      return getClassStudents(
        selectedClass.course_code,
        selectedClass.class_type,
        selectedClass.day_of_week,
        selectedClass.original_start_time || selectedClass.start_time,
        selectedClass.group_number || undefined
      );
    },
    enabled: !!selectedClass,
  });

  // Fixed time range: 8 AM to 10 PM
  const timeSlots = useMemo(() => {
    const min = 8;
    const max = 22;
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const hour = min + i;
      return `${String(hour).padStart(2, "0")}:00`;
    });
  }, []);

  const gridA = useMemo(() => {
    const map: Record<string, Record<string, StudentScheduleRecord[]>> = {};
    for (const day of DAYS) {
      map[day] = {};
      for (const slot of timeSlots) {
        map[day][slot] = [];
      }
    }
    for (const item of scheduleA) {
      const day = item.day_of_week;
      const startHour = getTimeSlotIndex(item.start_time);
      for (let i = 0; i < timeSlots.length; i++) {
        const slotHour = getTimeSlotIndex(timeSlots[i]);
        if (slotHour === startHour) {
          map[day][timeSlots[i]].push(item);
          break;
        }
      }
    }
    return map;
  }, [scheduleA, timeSlots]);

  const gridB = useMemo(() => {
    const map: Record<string, Record<string, StudentScheduleRecord[]>> = {};
    for (const day of DAYS) {
      map[day] = {};
      for (const slot of timeSlots) {
        map[day][slot] = [];
      }
    }
    for (const item of scheduleB) {
      const day = item.day_of_week;
      const startHour = getTimeSlotIndex(item.start_time);
      for (let i = 0; i < timeSlots.length; i++) {
        const slotHour = getTimeSlotIndex(timeSlots[i]);
        if (slotHour === startHour) {
          map[day][timeSlots[i]].push(item);
          break;
        }
      }
    }
    return map;
  }, [scheduleB, timeSlots]);

  const getClassHeight = (item: StudentScheduleRecord) => {
    const startHour = getTimeSlotIndex(item.start_time);
    const endHour = getTimeSlotIndex(item.end_time);
    const endMinute = getMinuteOffset(item.end_time);
    let duration = endHour - startHour;
    if (endMinute > 0) duration += endMinute / 60;
    return `${Math.max(duration * 4, 4)}rem`;
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
      <div className="inline-block min-w-full">
        {/* Header */}
        <div className="grid gap-0 bg-muted/50 sticky top-0 z-10" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
          <div className="border-r border-border px-3 py-2 text-xs font-semibold text-muted-foreground" />
          {DAYS.map((day) => (
            <div key={day} className="border-r border-border px-2 py-2 text-xs font-semibold text-center text-foreground">
              {day.substring(0, 3)}
            </div>
          ))}
        </div>

        {/* Time slots */}
        {timeSlots.map((slot) => (
          <div key={slot} className="grid gap-0 border-b border-border" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
            <div className="border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30 sticky left-0 z-5 min-h-16 flex items-center">
              {formatTime(slot)}
            </div>

            {DAYS.map((day) => {
              const itemsA = gridA[day][slot];
              const itemsB = gridB[day][slot];
              const matchedA = itemsA.filter((a) =>
                itemsB.some(
                  (b) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time
                )
              );
              const nonMatchedA = itemsA.filter((a) =>
                !itemsB.some(
                  (b) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time
                )
              );
              const nonMatchedB = itemsB.filter((b) =>
                !itemsA.some(
                  (a) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time
                )
              );

              return (
                <div
                  key={`${day}-${slot}`}
                  className="border-r border-border px-2 py-2 min-h-16 text-xs space-y-1 relative bg-white dark:bg-slate-950"
                >
                  {/* Matched courses (full width, green) - stack vertically with offset */}
                  {matchedA.map((item, idx) => (
                    <div
                      key={`match-${idx}`}
                      onClick={() => setSelectedClass(item)}
                      className="rounded-lg border p-1.5 text-xs transition-colors absolute w-[calc(100%-0.5rem)] cursor-pointer hover:shadow-lg"
                      style={{
                        minHeight: getClassHeight(item),
                        zIndex: 10 + idx,
                        top: `${0.5 + idx * 0.25}rem`,
                        backgroundColor: "rgb(134 239 172)", // green for match
                        borderColor: "rgb(52 211 153)", // green border
                      }}
                    >
                      <div className="font-semibold leading-tight text-green-900">{item.course_code}</div>
                      <div className="text-xs opacity-75 leading-tight text-green-800">{item.class_type}</div>
                      <div className="text-xs opacity-75 leading-tight text-green-800">
                        {item.start_time} - {item.end_time}
                      </div>
                      <div className="text-xs font-medium text-green-900 mt-1">Shared Course</div>
                    </div>
                  ))}

                  {/* Non-matched courses (split left/right) - stack within their side */}
                  {nonMatchedA.map((item, idx) => (
                    <div
                      key={`a-${idx}`}
                      onClick={() => setSelectedClass(item)}
                      className="rounded-lg border p-1 text-xs transition-colors absolute cursor-pointer hover:shadow-lg"
                      style={{
                        minHeight: getClassHeight(item),
                        zIndex: 1 + idx,
                        left: "1px",
                        top: `${0.5 + idx * 0.25}rem`,
                        width: "calc(50% - 0.25rem)",
                        backgroundColor: "rgb(219 234 254)", // light blue for Student A
                        borderColor: "rgb(147 197 253)", // blue border
                      }}
                    >
                      <div className="font-semibold leading-tight text-blue-900">{item.course_code}</div>
                      <div className="text-xs opacity-75 leading-tight text-blue-800">{item.class_type}</div>
                      <div className="text-xs opacity-75 leading-tight text-blue-800">
                        {item.start_time} - {item.end_time}
                      </div>
                    </div>
                  ))}
                  {nonMatchedB.map((item, idx) => (
                    <div
                      key={`b-${idx}`}
                      onClick={() => setSelectedClass(item)}
                      className="rounded-lg border p-1 text-xs transition-colors absolute cursor-pointer hover:shadow-lg"
                      style={{
                        minHeight: getClassHeight(item),
                        zIndex: 1 + idx,
                        left: "50%",
                        top: `${0.5 + idx * 0.25}rem`,
                        width: "calc(50% - 0.25rem)",
                        backgroundColor: "rgb(236 201 75)", // yellow for Student B
                        borderColor: "rgb(202 138 4)", // amber border
                      }}
                    >
                      <div className="font-semibold leading-tight text-amber-900">{item.course_code}</div>
                      <div className="text-xs opacity-75 leading-tight text-amber-900">{item.class_type}</div>
                      <div className="text-xs opacity-75 leading-tight text-amber-900">
                        {item.start_time} - {item.end_time}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Dialog open={!!selectedClass} onOpenChange={(open) => !open && setSelectedClass(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Classmates in {selectedClass?.course_code}
            </DialogTitle>
            <DialogDescription>
              {selectedClass?.class_type} • {selectedClass?.day_of_week} at {selectedClass?.start_time}
              {selectedClass?.group_number && ` • Group ${selectedClass.group_number}`}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {loadingClassmates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : classmates && classmates.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  {classmates.length} student{classmates.length !== 1 ? 's' : ''} in this class
                </p>
                <div className="space-y-1">
                  {classmates.map((student) => (
                    <div
                      key={student.student_id}
                      className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="font-medium text-sm">{student.student_name}</div>
                      <div className="text-xs text-muted-foreground">{student.student_id}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No classmates found in this class.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

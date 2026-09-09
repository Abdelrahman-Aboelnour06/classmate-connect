import { useMemo, useState } from "react";
import { formatTime, StudentScheduleRecord, getClassStudents } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleNotch as Loader2, UsersThree as Users } from "@phosphor-icons/react";
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

function getTimeInMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

interface ComparisonScheduleGridProps {
  scheduleA: StudentScheduleRecord[];
  scheduleB: StudentScheduleRecord[];
  exactMatches: StudentScheduleRecord[];
  studentAName?: string;
  studentBName?: string;
  onClassmateSelect?: (student: { student_id: string; student_name: string; student_name_ar: string | null }) => void;
}

export default function ComparisonScheduleGrid({
  scheduleA,
  scheduleB,
  exactMatches,
  studentAName = "Student A",
  studentBName = "Student B",
  onClassmateSelect,
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
    const durationMinutes = Math.max(
      getTimeInMinutes(item.end_time) - getTimeInMinutes(item.start_time),
      30,
    );
    return `${(durationMinutes / 60) * 4}rem`;
  };

  const getClassTop = (time: string, stackIndex = 0) => {
    const minuteOffsetRem = (getMinuteOffset(time) / 60) * 4;
    return `${0.5 + minuteOffsetRem + stackIndex * 0.25}rem`;
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
              // Exact match: same course, time, AND room
              const exactMatchedA = itemsA.filter((a) =>
                itemsB.some(
                  (b) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time &&
                    a.location === b.location
                )
              );
              // Same course & time but different room
              const diffRoomMatchedA = itemsA.filter((a) =>
                itemsB.some(
                  (b) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time &&
                    a.location !== b.location
                ) &&
                !itemsB.some(
                  (b) =>
                    a.course_code === b.course_code &&
                    a.day_of_week === b.day_of_week &&
                    a.start_time === b.start_time &&
                    a.location === b.location
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
                  {/* Exact matched courses (same room, full width, green) */}
                  {exactMatchedA.map((item, idx) => (
                    <div
                      key={`match-${idx}`}
                      onClick={() => setSelectedClass(item)}
                      className="rounded-lg border p-1.5 text-xs transition-colors absolute w-[calc(100%-0.5rem)] cursor-pointer hover:shadow-lg"
                      style={{
                        minHeight: getClassHeight(item),
                        zIndex: 10 + idx,
                        top: getClassTop(item.start_time, idx),
                        backgroundColor: "rgb(134 239 172)", // green for exact match
                        borderColor: "rgb(52 211 153)",
                      }}
                    >
                      <div className="font-semibold leading-tight text-green-900">{item.course_code}</div>
                      <div className="text-xs opacity-75 leading-tight text-green-800">{item.class_type}</div>
                      <div className="text-xs opacity-75 leading-tight text-green-800">
                        {item.start_time} - {item.end_time}
                      </div>
                      {item.location && <div className="text-xs opacity-75 leading-tight text-green-800">{item.location}</div>}
                      <div className="text-xs font-medium text-green-900 mt-1">Shared Class</div>
                    </div>
                  ))}

                  {/* Same course & time but different room (orange) */}
                  {diffRoomMatchedA.map((item, idx) => {
                    const matchingB = itemsB.find(
                      (b) =>
                        item.course_code === b.course_code &&
                        item.day_of_week === b.day_of_week &&
                        item.start_time === b.start_time
                    );
                    return (
                      <div
                        key={`diff-room-${idx}`}
                        onClick={() => setSelectedClass(item)}
                        className="rounded-lg border p-1.5 text-xs transition-colors absolute w-[calc(100%-0.5rem)] cursor-pointer hover:shadow-lg"
                        style={{
                          minHeight: getClassHeight(item),
                          zIndex: 10 + exactMatchedA.length + idx,
                          top: getClassTop(item.start_time, exactMatchedA.length + idx),
                          backgroundColor: "rgb(253 186 116)", // orange for different room
                          borderColor: "rgb(251 146 60)",
                        }}
                      >
                        <div className="font-semibold leading-tight text-orange-900">{item.course_code}</div>
                        <div className="text-xs opacity-75 leading-tight text-orange-800">{item.class_type}</div>
                        <div className="text-xs opacity-75 leading-tight text-orange-800">
                          {item.start_time} - {item.end_time}
                        </div>
                        <div className="text-xs font-medium text-orange-900 mt-1">Different Room</div>
                        <div className="text-xs opacity-75 leading-tight text-orange-800">
                          {item.location || "?"} / {matchingB?.location || "?"}
                        </div>
                      </div>
                    );
                  })}

                  {/* Non-matched courses (split left/right) - stack within their side */}
                  {nonMatchedA.map((item, idx) => (
                    <div
                      key={`a-${idx}`}
                      onClick={() => setSelectedClass(item)}
                      className="rounded-lg border p-1 text-xs transition-all absolute cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-yellow-500 dark:hover:border-yellow-200"
                      style={{
                        minHeight: getClassHeight(item),
                        zIndex: 1 + idx,
                        left: "1px",
                        top: getClassTop(item.start_time, idx),
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
                        top: getClassTop(item.start_time, idx),
                        width: "calc(50% - 0.25rem)",
                        backgroundColor: "rgb(250 204 21)", // vibrant yellow for Student B
                        borderColor: "rgb(234 179 8)", // amber border
                      }}
                    >
                      <div className="font-semibold leading-tight text-yellow-950">{item.course_code}</div>
                      <div className="text-xs opacity-75 leading-tight text-yellow-950">{item.class_type}</div>
                      <div className="text-xs opacity-75 leading-tight text-yellow-950">
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
            <DialogDescription className="space-y-1">
              {selectedClass?.course_name && (
                <span className="block text-foreground">{selectedClass.course_name}</span>
              )}
              <span className="block">
                {selectedClass?.class_type} • {selectedClass?.day_of_week} at {selectedClass?.start_time}
                {selectedClass?.group_number && ` • Group ${selectedClass.group_number}`}
              </span>
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
                      className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => {
                        onClassmateSelect?.(student);
                        setSelectedClass(null);
                      }}
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

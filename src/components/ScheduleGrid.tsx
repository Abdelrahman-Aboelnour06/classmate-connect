import { useMemo, useState } from "react";
import { formatTime, getClassStudents } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleNotch, UsersThree } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

type ScheduleItem = {
  id?: number;
  course_code: string;
  course_name: string;
  class_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string;
  group_number?: string | null;
  original_start_time?: string;
  original_end_time?: string;
};

type Classmate = {
  student_id: string;
  student_name: string;
  student_name_ar: string | null;
};

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

export default function ScheduleGrid({
  schedule,
  highlightCourses,
  onClassmateSelect,
}: {
  schedule: ScheduleItem[];
  highlightCourses?: Set<string>;
  onClassmateSelect?: (student: Classmate) => void;
}) {
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(null);

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
  const { timeSlots, minHour, maxHour } = useMemo(() => {
    const min = 8; // 8 AM
    const max = 22; // 10 PM

    const slots = Array.from({ length: max - min + 1 }, (_, i) => {
      const hour = min + i;
      return `${String(hour).padStart(2, "0")}:00`;
    });

    return { timeSlots: slots, minHour: min, maxHour: max };
  }, []);

  const grid = useMemo(() => {
    const map: Record<string, Record<string, ScheduleItem[]>> = {};

    for (const day of DAYS) {
      map[day] = {};
      for (const slot of timeSlots) {
        map[day][slot] = [];
      }
    }

    for (const item of schedule) {
      const day = item.day_of_week;
      const startHour = getTimeSlotIndex(item.start_time);

      // Find the slot that matches or precedes this time
      let slotIndex = -1;
      for (let i = 0; i < timeSlots.length; i++) {
        const slotHour = getTimeSlotIndex(timeSlots[i]);
        if (slotHour === startHour) {
          slotIndex = i;
          break;
        }
      }

      if (slotIndex !== -1 && map[day]) {
        map[day][timeSlots[slotIndex]].push(item);
      }
    }

    return map;
  }, [schedule, timeSlots]);

  const getClassHeight = (item: ScheduleItem) => {
    const durationMinutes = Math.max(
      getTimeInMinutes(item.end_time) - getTimeInMinutes(item.start_time),
      30,
    );
    return `${(durationMinutes / 60) * 4}rem`;
  };

  const getClassTop = (time: string) => {
    const minuteOffsetRem = (getMinuteOffset(time) / 60) * 4;
    return `${0.5 + minuteOffsetRem}rem`;
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
              const itemsInSlot = grid[day][slot].filter(item => getTimeSlotIndex(item.start_time) === getTimeSlotIndex(slot));
              const totalItems = itemsInSlot.length;
              
              return (
                <div
                  key={`${day}-${slot}`}
                  className="border-r border-border px-2 py-2 min-h-16 text-xs space-y-1 relative bg-white dark:bg-slate-950"
                >
                  {grid[day][slot].map((item, idx) => {
                    const isHighlighted = highlightCourses?.has(item.course_code);
                    const startHour = getTimeSlotIndex(item.start_time);
                    const slotHour = getTimeSlotIndex(slot);
                    const startMinute = getMinuteOffset(item.start_time);

                    // Only render if this is the correct slot for this item
                    if (startHour !== slotHour) return null;

                    // Calculate horizontal positioning for multiple items
                    const itemWidth = totalItems > 1 ? (100 / totalItems) : 100;
                    const leftOffset = totalItems > 1 ? (idx * itemWidth) : 0;

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedClass(item)}
                        className={`rounded-lg border p-1.5 text-xs transition-all absolute cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${
                          isHighlighted
                            ? "border-yellow-500 bg-yellow-300 text-yellow-950 font-medium shadow-md hover:border-yellow-600 hover:bg-yellow-400 dark:border-yellow-300 dark:bg-yellow-400 dark:text-yellow-950 dark:hover:border-yellow-200 dark:hover:bg-yellow-300"
                            : "border-border bg-muted/50 text-muted-foreground hover:border-slate-400 hover:bg-muted dark:hover:border-slate-500 dark:hover:bg-slate-800"
                        }`}
                        style={{
                          minHeight: getClassHeight(item),
                          top: getClassTop(item.start_time),
                          left: `calc(${leftOffset}% + 0.5rem)`,
                          width: totalItems > 1 ? `calc(${itemWidth}% - 0.75rem)` : 'calc(100% - 1rem)',
                          zIndex: idx + 1,
                        }}
                      >
                        <div className="font-mono font-semibold leading-tight">{item.course_code}</div>
                        <div className="mt-1 inline-flex rounded-full bg-[#E7F0F7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#42637A] dark:bg-slate-700 dark:text-slate-100">{item.class_type}</div>
                        <div className="font-mono text-xs opacity-75 leading-tight">
                          {item.start_time.padStart(5, "0")} - {item.end_time.padStart(5, "0")}
                        </div>
                        {item.location && <div className="text-xs opacity-75 truncate">{item.location}</div>}
                      </div>
                    );
                  })}
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
              <UsersThree weight="bold" className="h-5 w-5" />
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
                <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground" />
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
                      <div className="font-mono text-xs text-muted-foreground">{student.student_id}</div>
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

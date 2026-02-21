import { useMemo, useState } from "react";
import { formatTime, getClassStudents } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Loader2 } from "lucide-react";
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getTimeSlotIndex(time: string): number {
  const [hour] = time.split(":").map(Number);
  return hour;
}

function getMinuteOffset(time: string): number {
  const [, minute] = time.split(":").map(Number);
  return minute;
}

export default function ScheduleGrid({ schedule, highlightCourses }: { schedule: ScheduleItem[]; highlightCourses?: Set<string> }) {
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
                        className={`rounded-lg border p-1.5 text-xs transition-colors absolute top-2 cursor-pointer hover:shadow-lg ${
                          isHighlighted
                            ? "border-secondary bg-secondary/20 text-secondary-foreground font-medium shadow-md"
                            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted/70"
                        }`}
                        style={{
                          minHeight: getClassHeight(item),
                          left: `calc(${leftOffset}% + 0.5rem)`,
                          width: totalItems > 1 ? `calc(${itemWidth}% - 0.75rem)` : 'calc(100% - 1rem)',
                          zIndex: idx + 1,
                        }}
                      >
                        <div className="font-semibold leading-tight">{item.course_code}</div>
                        <div className="text-xs opacity-75 leading-tight">{item.class_type}</div>
                        <div className="text-xs opacity-75 leading-tight">
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

import { supabase } from "@/integrations/supabase/client";

// Arabic normalization: أ/إ/آ→ا, ة→ه, ى→ي
export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

// Extract location code from strings like "[20503]..."
export function extractLocation(raw: string): string {
  const match = raw.match(/\[(\d+)\]/);
  return match ? match[1] : raw;
}

// Format time for display
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export type StudentScheduleRecord = {
  student_id: string;
  student_name: string;
  student_name_ar: string | null;
  course_code: string;
  course_name: string;
  class_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string | null;
  group_number: string | null;
};

export async function searchStudents(query: string): Promise<Array<{ student_id: string; student_name: string; student_name_ar: string | null }>> {
  const normalized = normalizeArabic(query);
  
  const { data, error } = await supabase
    .from("students")
    .select("student_id, student_name, student_name_ar")
    .or(`student_name.ilike.%${query}%,student_id.ilike.%${query}%,student_name_ar.ilike.%${normalized}%`)
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function getStudentSchedule(studentId: string): Promise<StudentScheduleRecord[]> {
  const { data: student } = await supabase
    .from("students")
    .select("id, student_id, student_name, student_name_ar")
    .eq("student_id", studentId)
    .single();

  if (!student) return [];

  const { data: schedules, error } = await supabase
    .from("schedules")
    .select(`
      class_id,
      classes:class_id (
        id,
        location,
        group_number,
        course_id,
        time_slot_id,
        class_type_id,
        courses:course_id (course_code, course_name),
        time_slots:time_slot_id (day_of_week, start_time, end_time),
        class_types:class_type_id (type_name)
      )
    `)
    .eq("student_id", student.id);

  if (error) throw error;
  if (!schedules) return [];

  return schedules.map((s: any) => ({
    student_id: student.student_id,
    student_name: student.student_name,
    student_name_ar: student.student_name_ar,
    course_code: s.classes.courses.course_code,
    course_name: s.classes.courses.course_name,
    class_type: s.classes.class_types.type_name,
    day_of_week: s.classes.time_slots.day_of_week,
    start_time: s.classes.time_slots.start_time,
    end_time: s.classes.time_slots.end_time,
    location: s.classes.location,
    group_number: s.classes.group_number,
  }));
}

export async function getAllCourses(): Promise<Array<{ course_code: string; course_name: string }>> {
  const { data, error } = await supabase
    .from("courses")
    .select("course_code, course_name")
    .order("course_code");

  if (error) throw error;
  return data || [];
}

export async function getClassmates(courseCode: string, excludeStudentId?: string): Promise<Array<{ student_id: string; student_name: string; student_name_ar: string | null }>> {
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("course_code", courseCode)
    .single();

  if (!course) return [];

  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      students:student_id (student_id, student_name, student_name_ar)
    `)
    .eq("course_id", course.id);

  if (error) throw error;
  if (!enrollments) return [];

  return enrollments
    .map((e: any) => e.students)
    .filter((s: any) => !excludeStudentId || s.student_id !== excludeStudentId);
}

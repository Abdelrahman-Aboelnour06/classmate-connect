import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csv } = await req.json();
    if (!csv) {
      return new Response(JSON.stringify({ success: false, error: "No CSV data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const lines = csv.split("\n").filter((l: string) => l.trim());
    if (lines.length < 2) {
      return new Response(JSON.stringify({ success: false, error: "CSV has no data rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse header
    const header = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line: string) => {
      const values = line.split(",").map((v: string) => v.trim());
      const row: Record<string, string> = {};
      header.forEach((h: string, i: number) => { row[h] = values[i] || ""; });
      return row;
    });

    // Caches to avoid redundant lookups
    const studentCache = new Map<string, string>();
    const courseCache = new Map<string, string>();
    const typeCache = new Map<string, string>();
    const slotCache = new Map<string, string>();
    const classCache = new Map<string, string>();

    let studentsCount = 0, coursesCount = 0, schedulesCount = 0;

    for (const row of rows) {
      const studentIdVal = row.student_id;
      const studentName = row.student_name;
      const studentNameAr = row.student_name_ar || null;
      const courseCode = row.course_code;
      const courseName = row.course_name;
      const classType = row.class_type;
      const dayOfWeek = row.day_of_week;
      const startTime = row.start_time;
      const endTime = row.end_time;
      const location = row.location || null;
      const groupNumber = row.group_number || null;

      if (!studentIdVal || !courseCode || !dayOfWeek || !startTime || !endTime) continue;

      // Upsert student
      let studentUuid = studentCache.get(studentIdVal);
      if (!studentUuid) {
        const { data: existing } = await supabase.from("students").select("id").eq("student_id", studentIdVal).single();
        if (existing) {
          studentUuid = existing.id;
        } else {
          const { data: inserted } = await supabase.from("students").insert({ student_id: studentIdVal, student_name: studentName, student_name_ar: studentNameAr }).select("id").single();
          studentUuid = inserted!.id;
          studentsCount++;
        }
        studentCache.set(studentIdVal, studentUuid!);
      }

      // Upsert course
      let courseUuid = courseCache.get(courseCode);
      if (!courseUuid) {
        const { data: existing } = await supabase.from("courses").select("id").eq("course_code", courseCode).single();
        if (existing) {
          courseUuid = existing.id;
        } else {
          const { data: inserted } = await supabase.from("courses").insert({ course_code: courseCode, course_name: courseName }).select("id").single();
          courseUuid = inserted!.id;
          coursesCount++;
        }
        courseCache.set(courseCode, courseUuid!);
      }

      // Upsert class type
      let typeUuid = typeCache.get(classType);
      if (!typeUuid) {
        const { data: existing } = await supabase.from("class_types").select("id").eq("type_name", classType).single();
        if (existing) {
          typeUuid = existing.id;
        } else {
          const { data: inserted } = await supabase.from("class_types").insert({ type_name: classType }).select("id").single();
          typeUuid = inserted!.id;
        }
        typeCache.set(classType, typeUuid!);
      }

      // Upsert time slot
      const slotKey = `${dayOfWeek}|${startTime}|${endTime}`;
      let slotUuid = slotCache.get(slotKey);
      if (!slotUuid) {
        const { data: existing } = await supabase.from("time_slots").select("id").eq("day_of_week", dayOfWeek).eq("start_time", startTime).eq("end_time", endTime).single();
        if (existing) {
          slotUuid = existing.id;
        } else {
          const { data: inserted } = await supabase.from("time_slots").insert({ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime }).select("id").single();
          slotUuid = inserted!.id;
        }
        slotCache.set(slotKey, slotUuid!);
      }

      // Upsert class
      const classKey = `${courseUuid}|${slotUuid}|${typeUuid}|${location}|${groupNumber}`;
      let classUuid = classCache.get(classKey);
      if (!classUuid) {
        const q = supabase.from("classes").select("id")
          .eq("course_id", courseUuid!)
          .eq("time_slot_id", slotUuid!)
          .eq("class_type_id", typeUuid!);
        
        if (location) q.eq("location", location); else q.is("location", null);
        if (groupNumber) q.eq("group_number", groupNumber); else q.is("group_number", null);
        
        const { data: existing } = await q.single();
        if (existing) {
          classUuid = existing.id;
        } else {
          const { data: inserted } = await supabase.from("classes").insert({
            course_id: courseUuid!, time_slot_id: slotUuid!, class_type_id: typeUuid!,
            location, group_number: groupNumber,
          }).select("id").single();
          classUuid = inserted!.id;
        }
        classCache.set(classKey, classUuid!);
      }

      // Upsert enrollment
      const { data: existingEnrollment } = await supabase.from("enrollments").select("id")
        .eq("student_id", studentUuid!).eq("course_id", courseUuid!).single();
      if (!existingEnrollment) {
        await supabase.from("enrollments").insert({ student_id: studentUuid!, course_id: courseUuid! });
      }

      // Upsert schedule
      const { data: existingSchedule } = await supabase.from("schedules").select("id")
        .eq("student_id", studentUuid!).eq("class_id", classUuid!).single();
      if (!existingSchedule) {
        await supabase.from("schedules").insert({ student_id: studentUuid!, class_id: classUuid! });
        schedulesCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      stats: { students: studentsCount, courses: coursesCount, schedules: schedulesCount },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Import error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Import failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { db } from "./db.js";
import { extractLocationCode, normalizeArabic, to24Hour } from "./utils.js";

const insertStudent = db.prepare(`
  INSERT INTO students (student_id, student_name, student_name_ar, student_name_normalized)
  VALUES (@student_id, @student_name, @student_name_ar, @student_name_normalized)
  ON CONFLICT(student_id) DO UPDATE SET
    student_name = excluded.student_name,
    student_name_ar = excluded.student_name_ar,
    student_name_normalized = excluded.student_name_normalized
`);

const insertCourse = db.prepare(`
  INSERT INTO courses (course_code, course_name, course_name_normalized)
  VALUES (@course_code, @course_name, @course_name_normalized)
  ON CONFLICT(course_code) DO UPDATE SET
    course_name = excluded.course_name,
    course_name_normalized = excluded.course_name_normalized
`);

const insertClassType = db.prepare(`
  INSERT INTO class_types (type_name)
  VALUES (?)
  ON CONFLICT(type_name) DO NOTHING
`);

const insertTimeSlot = db.prepare(`
  INSERT INTO time_slots (day_of_week, start_time, end_time)
  VALUES (?, ?, ?)
  ON CONFLICT(day_of_week, start_time, end_time) DO NOTHING
`);

const insertClass = db.prepare(`
  INSERT INTO classes (course_id, time_slot_id, class_type_id, location, group_number)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(course_id, time_slot_id, class_type_id, location, group_number) DO NOTHING
`);

const insertEnrollment = db.prepare(`
  INSERT INTO enrollments (student_id, course_id)
  VALUES (?, ?)
  ON CONFLICT(student_id, course_id) DO NOTHING
`);

const insertSchedule = db.prepare(`
  INSERT INTO schedules (student_id, class_id)
  VALUES (?, ?)
  ON CONFLICT(student_id, class_id) DO NOTHING
`);

const findStudentId = db.prepare("SELECT id FROM students WHERE student_id = ?");
const findCourseId = db.prepare("SELECT id FROM courses WHERE course_code = ?");
const findClassTypeId = db.prepare("SELECT id FROM class_types WHERE type_name = ?");
const findTimeSlotId = db.prepare("SELECT id FROM time_slots WHERE day_of_week = ? AND start_time = ? AND end_time = ?");
const findClassId = db.prepare("SELECT id FROM classes WHERE course_id = ? AND time_slot_id = ? AND class_type_id = ? AND location = ? AND group_number = ?");

function normalizeRecord(row, rowIndex = 0) {
  // Handle cases where properties might be undefined
  const getValue = (val) => String(val || "").trim();
  
  // Log column names for first row to debug
  if (rowIndex === 0) {
    console.log("CSV columns detected:", Object.keys(row));
    console.log("First row data:", row);
  }
  
  // Direct column access - no fancy detection needed
  // Your CSV uses: type, day, start, end, group
  const startTime = getValue(row.start || row.start_time || "");
  const endTime = getValue(row.end || row.end_time || "");
  const dayOfWeek = getValue(row.day || row.day_of_week || "");
  const classType = getValue(row.type || row.class_type || "");
  const groupNumber = getValue(row.group || row.group_number || "");
  
  if (rowIndex === 0) {
    console.log("Column mapping result:", {
      startTime,
      endTime,
      dayOfWeek,
      classType,
    });
  }
  
  return {
    student_id: getValue(row.student_id || ""),
    student_name: getValue(row.student_name || ""),
    student_name_ar: getValue(row.student_name_ar || "") || null,
    course_code: getValue(row.course_code || "").toUpperCase(),
    course_name: getValue(row.course_name || ""),
    class_type: classType || "Lecture",
    day_of_week: dayOfWeek,
    start_time: to24Hour(startTime),
    end_time: to24Hour(endTime),
    location: extractLocationCode(getValue(row.location || "")),
    group_number: groupNumber,
  };
}

const migrateOne = db.transaction((record) => {
  insertStudent.run({
    student_id: record.student_id,
    student_name: record.student_name,
    student_name_ar: record.student_name_ar,
    student_name_normalized: normalizeArabic(record.student_name_ar || record.student_name),
  });

  insertCourse.run({
    course_code: record.course_code,
    course_name: record.course_name,
    course_name_normalized: normalizeArabic(record.course_name),
  });

  insertClassType.run(record.class_type);
  insertTimeSlot.run(record.day_of_week, record.start_time, record.end_time);

  const student = findStudentId.get(record.student_id);
  const course = findCourseId.get(record.course_code);
  const classType = findClassTypeId.get(record.class_type);
  const timeSlot = findTimeSlotId.get(record.day_of_week, record.start_time, record.end_time);

  if (!student || !course || !classType || !timeSlot) return false;

  insertClass.run(course.id, timeSlot.id, classType.id, record.location, record.group_number);
  const klass = findClassId.get(course.id, timeSlot.id, classType.id, record.location, record.group_number);

  if (!klass) return false;

  insertEnrollment.run(student.id, course.id);
  insertSchedule.run(student.id, klass.id);

  return true;
});

const clearTransaction = db.transaction(() => {
  // Disable foreign key constraints temporarily for cleanup
  db.prepare("PRAGMA foreign_keys = OFF").run();
  
  try {
    // Delete in correct order to respect foreign key constraints
    const tables = ["schedules", "classes", "enrollments", "students", "courses", "time_slots", "class_types"];
    
    for (const table of tables) {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  Cleared ${table}: ${result.changes} rows deleted`);
    }
  } finally {
    // Always re-enable foreign keys
    db.prepare("PRAGMA foreign_keys = ON").run();
  }
});

function clearAllData() {
  try {
    console.log("Starting database clear transaction...");
    clearTransaction();
    console.log("Database cleared successfully");
  } catch (e) {
    // Try to re-enable foreign keys even on error
    try {
      db.prepare("PRAGMA foreign_keys = ON").run();
    } catch {
      // Ignore
    }
    throw new Error(`Failed to clear database: ${e instanceof Error ? e.message : "Unknown error"}`);
  }
}

export function migrateCsvToDb(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  if (!csvContent.trim()) {
    throw new Error("CSV file is empty");
  }

  // Clear all old data before importing new data
  console.log("Starting database clear...");
  clearAllData();
  console.log("Database clear completed");

  // Verify database is empty
  const preImportStats = {
    students: db.prepare("SELECT COUNT(*) as c FROM students").get().c,
    courses: db.prepare("SELECT COUNT(*) as c FROM courses").get().c,
    classes: db.prepare("SELECT COUNT(*) as c FROM classes").get().c,
    enrollments: db.prepare("SELECT COUNT(*) as c FROM enrollments").get().c,
    schedules: db.prepare("SELECT COUNT(*) as c FROM schedules").get().c,
  };

  console.log("Database state before import:", preImportStats);

  if (preImportStats.students > 0 || preImportStats.courses > 0) {
    console.warn("WARNING: Old data still present in database despite clear attempt");
    console.warn("Attempting alternative clear strategy...");
    
    // Try alternative clear with explicit individual deletes
    try {
      db.prepare("DELETE FROM schedules WHERE 1=1").run();
      db.prepare("DELETE FROM classes WHERE 1=1").run();
      db.prepare("DELETE FROM enrollments WHERE 1=1").run();
      db.prepare("DELETE FROM students WHERE 1=1").run();
      db.prepare("DELETE FROM courses WHERE 1=1").run();
      db.prepare("DELETE FROM time_slots WHERE 1=1").run();
      db.prepare("DELETE FROM class_types WHERE 1=1").run();
      
      const retryStats = {
        students: db.prepare("SELECT COUNT(*) as c FROM students").get().c,
        courses: db.prepare("SELECT COUNT(*) as c FROM courses").get().c,
      };
      console.log("After retry clear:", retryStats);
      
      if (retryStats.students > 0 || retryStats.courses > 0) {
        throw new Error("Database clear failed - old data still present after retry");
      }
    } catch (retryError) {
      throw new Error(`Failed to clear database: ${retryError instanceof Error ? retryError.message : "Unknown error"}`);
    }
  }

  let rows;
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    throw new Error(`Failed to parse CSV: ${e instanceof Error ? e.message : "Invalid CSV format"}`);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("CSV contains no data rows");
  }

  // Validate headers - accept both naming conventions
  const firstRow = rows[0];
  const columnNames = Object.keys(firstRow);
  
  // Check for required columns with case-insensitive, flexible matching
  const hasColumn = (row, ...names) => {
    return names.some(name => 
      Object.keys(row).some(k => k.toLowerCase() === name.toLowerCase())
    );
  };
  
  const requiredBase = ["student_id", "student_name", "course_code", "course_name"];
  const requiredTime = ["day", "start", "end"]; // either short or long names
  
  // Check base required columns
  for (const col of requiredBase) {
    if (!hasColumn(firstRow, col)) {
      throw new Error(`CSV missing required column: ${col}`);
    }
  }
  
  // Check time-related columns (accept either naming)
  const hasDay = hasColumn(firstRow, "day_of_week", "day");
  const hasStart = hasColumn(firstRow, "start_time", "start");
  const hasEnd = hasColumn(firstRow, "end_time", "end");
  
  if (!hasDay) throw new Error(`CSV missing day column (day_of_week or day)`);
  if (!hasStart) throw new Error(`CSV missing start time column (start_time or start)`);
  if (!hasEnd) throw new Error(`CSV missing end time column (end_time or end)`);

  let imported = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const record = normalizeRecord(row, i);
    
    // Detailed validation
    if (!record.student_id) {
      errors.push(`Row ${i + 1}: Missing student_id`);
      continue;
    }
    if (!record.student_name) {
      errors.push(`Row ${i + 1}: Missing student_name`);
      continue;
    }
    if (!record.course_code) {
      errors.push(`Row ${i + 1}: Missing course_code`);
      continue;
    }
    if (!record.course_name) {
      errors.push(`Row ${i + 1}: Missing course_name`);
      continue;
    }
    if (!record.day_of_week) {
      errors.push(`Row ${i + 1}: Missing day_of_week`);
      continue;
    }
    
    const startTime = record.start_time;
    const endTime = record.end_time;
    
    if (!startTime) {
      errors.push(`Row ${i + 1}: Invalid start_time format "${row.start_time}" (expected HH:MM or H:MM AM/PM)`);
      continue;
    }
    if (!endTime) {
      errors.push(`Row ${i + 1}: Invalid end_time format "${row.end_time}" (expected HH:MM or H:MM AM/PM)`);
      continue;
    }

    try {
      if (migrateOne(record)) {
        imported += 1;
      } else {
        errors.push(`Row ${i + 1}: Failed to insert schedule (possibly missing student, course, or class type)`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      // Don't report every duplicate constraint error if we're expecting some
      if (errorMsg.includes("UNIQUE constraint") || errorMsg.includes("constraint failed")) {
        // These are expected in some cases due to duplicates in CSV
        errors.push(`Row ${i + 1}: ${errorMsg}`);
      } else {
        errors.push(`Row ${i + 1}: ${errorMsg}`);
      }
    }
  }

  const postImportStats = {
    students: db.prepare("SELECT COUNT(*) as c FROM students").get().c,
    courses: db.prepare("SELECT COUNT(*) as c FROM courses").get().c,
    classes: db.prepare("SELECT COUNT(*) as c FROM classes").get().c,
    enrollments: db.prepare("SELECT COUNT(*) as c FROM enrollments").get().c,
    schedules: db.prepare("SELECT COUNT(*) as c FROM schedules").get().c,
  };

  const stats = {
    students: postImportStats.students,
    courses: postImportStats.courses,
    classes: postImportStats.classes,
    enrollments: postImportStats.enrollments,
    schedules: postImportStats.schedules,
    importedRows: imported,
    totalRows: rows.length,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log("Import statistics:", {
    imported,
    total: rows.length,
    errorCount: errors.length,
    studentCount: postImportStats.students,
    courseCount: postImportStats.courses,
  });

  if (errors.length > 0) {
    const errorSummary = errors.slice(0, 5).join("\n");
    const moreText = errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : "";
    console.warn(`CSV import completed with ${errors.length} errors (${imported}/${rows.length} rows imported):\n${errorSummary}${moreText}`);
  }

  return stats;
}

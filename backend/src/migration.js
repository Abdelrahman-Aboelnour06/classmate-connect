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

function normalizeRecord(row) {
  const getValue = (val) => String(val || "").trim();

  const startTime = getValue(row.start || row.start_time || "");
  const endTime = getValue(row.end || row.end_time || "");
  const dayOfWeek = getValue(row.day || row.day_of_week || "");
  const classType = getValue(row.type || row.class_type || "");
  const groupNumber = getValue(row.group || row.group_number || "");
  
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

function migrateOne(record, caches) {
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

  const timeSlotKey = `${record.day_of_week}\u0000${record.start_time}\u0000${record.end_time}`;
  const student = caches.students.get(record.student_id) || findStudentId.get(record.student_id);
  const course = caches.courses.get(record.course_code) || findCourseId.get(record.course_code);
  const classType = caches.classTypes.get(record.class_type) || findClassTypeId.get(record.class_type);
  const timeSlot = caches.timeSlots.get(timeSlotKey)
    || findTimeSlotId.get(record.day_of_week, record.start_time, record.end_time);

  if (!student || !course || !classType || !timeSlot) return false;

  caches.students.set(record.student_id, student);
  caches.courses.set(record.course_code, course);
  caches.classTypes.set(record.class_type, classType);
  caches.timeSlots.set(timeSlotKey, timeSlot);

  insertClass.run(course.id, timeSlot.id, classType.id, record.location, record.group_number);
  const classKey = `${course.id}\u0000${timeSlot.id}\u0000${classType.id}\u0000${record.location}\u0000${record.group_number}`;
  const klass = caches.classes.get(classKey)
    || findClassId.get(course.id, timeSlot.id, classType.id, record.location, record.group_number);

  if (!klass) return false;

  caches.classes.set(classKey, klass);

  insertEnrollment.run(student.id, course.id);
  insertSchedule.run(student.id, klass.id);

  return true;
}

function migrateAll(records, errors) {
  let imported = 0;
  const caches = {
    students: new Map(),
    courses: new Map(),
    classTypes: new Map(),
    timeSlots: new Map(),
    classes: new Map(),
  };

  for (const { record, rowNumber } of records) {
    try {
      if (migrateOne(record, caches)) {
        imported += 1;
      } else {
        errors.push(`Row ${rowNumber}: Failed to insert schedule (possibly missing student, course, or class type)`);
      }
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return imported;
}

const reconcileAndMigrate = db.transaction((records, errors) => {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS desired_students (student_id TEXT PRIMARY KEY);
    CREATE TEMP TABLE IF NOT EXISTS desired_courses (course_code TEXT PRIMARY KEY);
    CREATE TEMP TABLE IF NOT EXISTS desired_classes (
      course_code TEXT NOT NULL,
      class_type TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL,
      group_number TEXT NOT NULL,
      PRIMARY KEY (course_code, class_type, day_of_week, start_time, end_time, location, group_number)
    );
    CREATE TEMP TABLE IF NOT EXISTS desired_enrollments (
      student_id TEXT NOT NULL,
      course_code TEXT NOT NULL,
      PRIMARY KEY (student_id, course_code)
    );
    CREATE TEMP TABLE IF NOT EXISTS desired_schedules (
      student_id TEXT NOT NULL,
      course_code TEXT NOT NULL,
      class_type TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL,
      group_number TEXT NOT NULL,
      PRIMARY KEY (student_id, course_code, class_type, day_of_week, start_time, end_time, location, group_number)
    );
  `);

  db.exec(`
    DELETE FROM desired_students;
    DELETE FROM desired_courses;
    DELETE FROM desired_classes;
    DELETE FROM desired_enrollments;
    DELETE FROM desired_schedules;
  `);

  const desiredStudent = db.prepare("INSERT OR IGNORE INTO desired_students (student_id) VALUES (?)");
  const desiredCourse = db.prepare("INSERT OR IGNORE INTO desired_courses (course_code) VALUES (?)");
  const desiredClass = db.prepare(`
    INSERT OR IGNORE INTO desired_classes
      (course_code, class_type, day_of_week, start_time, end_time, location, group_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const desiredEnrollment = db.prepare("INSERT OR IGNORE INTO desired_enrollments (student_id, course_code) VALUES (?, ?)");
  const desiredSchedule = db.prepare(`
    INSERT OR IGNORE INTO desired_schedules
      (student_id, course_code, class_type, day_of_week, start_time, end_time, location, group_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const { record } of records) {
    desiredStudent.run(record.student_id);
    desiredCourse.run(record.course_code);
    desiredClass.run(
      record.course_code,
      record.class_type,
      record.day_of_week,
      record.start_time,
      record.end_time,
      record.location,
      record.group_number,
    );
    desiredEnrollment.run(record.student_id, record.course_code);
    desiredSchedule.run(
      record.student_id,
      record.course_code,
      record.class_type,
      record.day_of_week,
      record.start_time,
      record.end_time,
      record.location,
      record.group_number,
    );
  }

  db.exec(`
    DELETE FROM schedules
    WHERE id IN (
      SELECT sch.id
      FROM schedules sch
      JOIN students s ON s.id = sch.student_id
      JOIN classes cl ON cl.id = sch.class_id
      JOIN courses c ON c.id = cl.course_id
      JOIN class_types ct ON ct.id = cl.class_type_id
      JOIN time_slots ts ON ts.id = cl.time_slot_id
      WHERE NOT EXISTS (
        SELECT 1 FROM desired_schedules d
        WHERE d.student_id = s.student_id
          AND d.course_code = c.course_code
          AND d.class_type = ct.type_name
          AND d.day_of_week = ts.day_of_week
          AND d.start_time = ts.start_time
          AND d.end_time = ts.end_time
          AND d.location = cl.location
          AND d.group_number = cl.group_number
      )
    );

    DELETE FROM enrollments
    WHERE id IN (
      SELECT e.id
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      WHERE NOT EXISTS (
        SELECT 1 FROM desired_enrollments d
        WHERE d.student_id = s.student_id AND d.course_code = c.course_code
      )
    );

    DELETE FROM classes
    WHERE NOT EXISTS (
      SELECT 1 FROM desired_classes d
      JOIN courses c ON c.course_code = d.course_code
      JOIN class_types ct ON ct.type_name = d.class_type
      JOIN time_slots ts ON ts.day_of_week = d.day_of_week
        AND ts.start_time = d.start_time AND ts.end_time = d.end_time
      WHERE d.course_code = (SELECT course_code FROM courses WHERE id = classes.course_id)
        AND d.class_type = (SELECT type_name FROM class_types WHERE id = classes.class_type_id)
        AND d.day_of_week = (SELECT day_of_week FROM time_slots WHERE id = classes.time_slot_id)
        AND d.start_time = (SELECT start_time FROM time_slots WHERE id = classes.time_slot_id)
        AND d.end_time = (SELECT end_time FROM time_slots WHERE id = classes.time_slot_id)
        AND d.location = classes.location
        AND d.group_number = classes.group_number
    );

    DELETE FROM courses WHERE NOT EXISTS (SELECT 1 FROM desired_courses d WHERE d.course_code = courses.course_code);
    DELETE FROM students WHERE NOT EXISTS (SELECT 1 FROM desired_students d WHERE d.student_id = students.student_id);
    DELETE FROM time_slots WHERE NOT EXISTS (SELECT 1 FROM classes WHERE classes.time_slot_id = time_slots.id);
    DELETE FROM class_types WHERE NOT EXISTS (SELECT 1 FROM classes WHERE classes.class_type_id = class_types.id);
  `);

  return migrateAll(records, errors);
});

export function validateCsvContent(csvContent) {
  if (!csvContent.trim()) {
    throw new Error("CSV file is empty");
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

  // Check for required columns with case-insensitive, flexible matching
  const hasColumn = (row, ...names) => {
    return names.some(name => 
      Object.keys(row).some(k => k.toLowerCase() === name.toLowerCase())
    );
  };
  
  const requiredBase = ["student_id", "student_name", "course_code", "course_name"];
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

  const errors = [];
  const records = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const record = normalizeRecord(row);
    
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

    records.push({ record, rowNumber: i + 1 });
  }

  return { rows, records, errors };
}

export function migrateCsvToDb(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  const { rows, records, errors } = validateCsvContent(csvContent);

  if (records.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  const imported = reconcileAndMigrate(records, errors);
  db.prepare("INSERT INTO student_search(student_search) VALUES ('rebuild')").run();

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

  if (errors.length > 0) {
    const errorSummary = errors.slice(0, 5).join("\n");
    const moreText = errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : "";
    console.warn(`CSV import completed with ${errors.length} errors (${imported}/${rows.length} rows imported):\n${errorSummary}${moreText}`);
  }

  return stats;
}

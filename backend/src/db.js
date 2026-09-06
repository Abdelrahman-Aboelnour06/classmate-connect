import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "backend", "data", "classmate-connect.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  student_name_ar TEXT,
  student_name_normalized TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL UNIQUE,
  course_name TEXT NOT NULL,
  course_name_normalized TEXT
);

CREATE TABLE IF NOT EXISTS class_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  UNIQUE(day_of_week, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  time_slot_id INTEGER NOT NULL,
  class_type_id INTEGER NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  group_number TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (class_type_id) REFERENCES class_types(id) ON DELETE CASCADE,
  UNIQUE(course_id, time_slot_id, class_type_id, location, group_number)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE(student_id, class_id)
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS student_search USING fts5(
  student_id UNINDEXED,
  student_name,
  student_name_ar,
  student_name_normalized,
  content='students',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS students_ai AFTER INSERT ON students BEGIN
  INSERT INTO student_search(rowid, student_id, student_name, student_name_ar, student_name_normalized)
  VALUES (new.id, new.student_id, new.student_name, new.student_name_ar, new.student_name_normalized);
END;

CREATE TRIGGER IF NOT EXISTS students_ad AFTER DELETE ON students BEGIN
  INSERT INTO student_search(student_search, rowid, student_id, student_name, student_name_ar, student_name_normalized)
  VALUES ('delete', old.id, old.student_id, old.student_name, old.student_name_ar, old.student_name_normalized);
END;

CREATE TRIGGER IF NOT EXISTS students_au AFTER UPDATE ON students BEGIN
  INSERT INTO student_search(student_search, rowid, student_id, student_name, student_name_ar, student_name_normalized)
  VALUES ('delete', old.id, old.student_id, old.student_name, old.student_name_ar, old.student_name_normalized);
  INSERT INTO student_search(rowid, student_id, student_name, student_name_ar, student_name_normalized)
  VALUES (new.id, new.student_id, new.student_name, new.student_name_ar, new.student_name_normalized);
END;

CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_student_name ON students(student_name);
CREATE INDEX IF NOT EXISTS idx_students_student_name_ar ON students(student_name_ar);
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(course_code);
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(course_name);
CREATE INDEX IF NOT EXISTS idx_timeslots_day ON time_slots(day_of_week);
CREATE INDEX IF NOT EXISTS idx_classes_course_id ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_slot_id ON classes(time_slot_id);
CREATE INDEX IF NOT EXISTS idx_classes_type_id ON classes(class_type_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_schedules_student_id ON schedules(student_id);
CREATE INDEX IF NOT EXISTS idx_schedules_class_id ON schedules(class_id);
`);

db.prepare("INSERT INTO student_search(student_search) VALUES ('rebuild')").run();

#!/usr/bin/env python3
"""
build_database.py

Builds/populates the classmate-connect SQLite database directly from a
master_schedule CSV, without going through the Node /api/upload-csv
endpoint. Schema matches backend/db.js exactly, so the resulting .db
file is a drop-in replacement the Node app can read normally, and you
can also open/edit it yourself with any SQLite tool (DB Browser for
SQLite, sqlite3 CLI, etc.) once it's built.

Usage:
    python build_database.py --csv master_schedule.csv --db classmate-connect.db
    python build_database.py --csv master_schedule.csv --db classmate-connect.db --rebuild

--rebuild wipes and recreates all tables before importing (like a
fresh migration). Without it, rows are upserted into whatever is
already in the target .db file (safe to re-run).
"""

import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Schema — mirrors backend/db.js exactly
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
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
"""

DROP_SQL = """
DROP TRIGGER IF EXISTS students_ai;
DROP TRIGGER IF EXISTS students_ad;
DROP TRIGGER IF EXISTS students_au;
DROP TABLE IF EXISTS student_search;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS time_slots;
DROP TABLE IF EXISTS class_types;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;
"""

# ---------------------------------------------------------------------------
# Normalization helpers — mirror backend/utils.js exactly
# ---------------------------------------------------------------------------

ARABIC_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي"})


def normalize_arabic(text: str = "") -> str:
    return (text or "").translate(ARABIC_MAP).strip()


def extract_location_code(raw: str = "") -> str:
    match = re.search(r"\[(\d+)\]", raw or "")
    return match.group(1) if match else (raw or "").strip()


def to_24_hour(time_value: str = "") -> str:
    value = (time_value or "").strip()
    if re.fullmatch(r"\d{1,2}:\d{2}", value):
        hour_str, minute = value.split(":")
        hour = int(hour_str)
        # 1-7 with no AM/PM marker is treated as PM (uni runs 8 AM-10 PM)
        if 1 <= hour <= 7:
            hour += 12
        return f"{hour:02d}:{minute}"

    match = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)", value, re.IGNORECASE)
    if not match:
        return ""
    hour = int(match.group(1))
    minute = match.group(2)
    meridiem = match.group(3).upper()
    if meridiem == "PM" and hour != 12:
        hour += 12
    if meridiem == "AM" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute}"


def get(row: dict, *names: str) -> str:
    """Case-sensitive lookup across possible column name variants, first non-empty wins."""
    for name in names:
        val = row.get(name)
        if val:
            return str(val).strip()
    return ""


def normalize_record(row: dict) -> dict:
    return {
        "student_id": get(row, "student_id"),
        "student_name": get(row, "student_name"),
        "student_name_ar": get(row, "student_name_ar") or None,
        "course_code": get(row, "course_code").upper(),
        "course_name": get(row, "course_name"),
        "class_type": get(row, "type", "class_type") or "Lecture",
        "day_of_week": get(row, "day", "day_of_week"),
        "start_time": to_24_hour(get(row, "start", "start_time")),
        "end_time": to_24_hour(get(row, "end", "end_time")),
        "location": extract_location_code(get(row, "location")),
        "group_number": get(row, "group", "group_number"),
    }


# ---------------------------------------------------------------------------
# Import logic
# ---------------------------------------------------------------------------

def read_csv_records(csv_path: Path):
    records, errors = [], []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=1):
            record = normalize_record(row)
            missing = [
                field
                for field in ("student_id", "student_name", "course_code", "course_name", "day_of_week")
                if not record[field]
            ]
            if missing:
                errors.append(f"Row {i}: missing {', '.join(missing)}")
                continue
            if not record["start_time"]:
                errors.append(f"Row {i}: invalid start_time '{get(row, 'start', 'start_time')}'")
                continue
            if not record["end_time"]:
                errors.append(f"Row {i}: invalid end_time '{get(row, 'end', 'end_time')}'")
                continue
            records.append(record)
    return records, errors


def build_database(csv_path: Path, db_path: Path, rebuild: bool) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    if rebuild:
        conn.executescript(DROP_SQL)
    conn.executescript(SCHEMA_SQL)

    records, errors = read_csv_records(csv_path)
    if not records:
        print("No valid rows found in CSV. Nothing imported.")
        for e in errors[:10]:
            print(f"  {e}")
        conn.close()
        return

    with conn:  # single transaction, committed at the end (or rolled back on error)
        student_cache, course_cache, type_cache, slot_cache, class_cache = {}, {}, {}, {}, {}
        imported = 0

        for record in records:
            conn.execute(
                """
                INSERT INTO students (student_id, student_name, student_name_ar, student_name_normalized)
                VALUES (:student_id, :student_name, :student_name_ar, :normalized)
                ON CONFLICT(student_id) DO UPDATE SET
                    student_name = excluded.student_name,
                    student_name_ar = excluded.student_name_ar,
                    student_name_normalized = excluded.student_name_normalized
                """,
                {**record, "normalized": normalize_arabic(record["student_name_ar"] or record["student_name"])},
            )
            conn.execute(
                """
                INSERT INTO courses (course_code, course_name, course_name_normalized)
                VALUES (:course_code, :course_name, :normalized)
                ON CONFLICT(course_code) DO UPDATE SET
                    course_name = excluded.course_name,
                    course_name_normalized = excluded.course_name_normalized
                """,
                {**record, "normalized": normalize_arabic(record["course_name"])},
            )
            conn.execute(
                "INSERT INTO class_types (type_name) VALUES (?) ON CONFLICT(type_name) DO NOTHING",
                (record["class_type"],),
            )
            conn.execute(
                """
                INSERT INTO time_slots (day_of_week, start_time, end_time)
                VALUES (?, ?, ?)
                ON CONFLICT(day_of_week, start_time, end_time) DO NOTHING
                """,
                (record["day_of_week"], record["start_time"], record["end_time"]),
            )

            student = student_cache.get(record["student_id"]) or conn.execute(
                "SELECT id FROM students WHERE student_id = ?", (record["student_id"],)
            ).fetchone()
            course = course_cache.get(record["course_code"]) or conn.execute(
                "SELECT id FROM courses WHERE course_code = ?", (record["course_code"],)
            ).fetchone()
            class_type = type_cache.get(record["class_type"]) or conn.execute(
                "SELECT id FROM class_types WHERE type_name = ?", (record["class_type"],)
            ).fetchone()
            slot_key = (record["day_of_week"], record["start_time"], record["end_time"])
            time_slot = slot_cache.get(slot_key) or conn.execute(
                "SELECT id FROM time_slots WHERE day_of_week = ? AND start_time = ? AND end_time = ?",
                slot_key,
            ).fetchone()

            if not (student and course and class_type and time_slot):
                continue

            student_cache[record["student_id"]] = student
            course_cache[record["course_code"]] = course
            type_cache[record["class_type"]] = class_type
            slot_cache[slot_key] = time_slot

            conn.execute(
                """
                INSERT INTO classes (course_id, time_slot_id, class_type_id, location, group_number)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(course_id, time_slot_id, class_type_id, location, group_number) DO NOTHING
                """,
                (course[0], time_slot[0], class_type[0], record["location"], record["group_number"]),
            )
            class_key = (course[0], time_slot[0], class_type[0], record["location"], record["group_number"])
            klass = class_cache.get(class_key) or conn.execute(
                """
                SELECT id FROM classes
                WHERE course_id = ? AND time_slot_id = ? AND class_type_id = ? AND location = ? AND group_number = ?
                """,
                class_key,
            ).fetchone()
            if not klass:
                continue
            class_cache[class_key] = klass

            conn.execute(
                "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?) ON CONFLICT(student_id, course_id) DO NOTHING",
                (student[0], course[0]),
            )
            conn.execute(
                "INSERT INTO schedules (student_id, class_id) VALUES (?, ?) ON CONFLICT(student_id, class_id) DO NOTHING",
                (student[0], klass[0]),
            )
            imported += 1

    counts = {
        table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in ("students", "courses", "classes", "enrollments", "schedules")
    }
    conn.close()

    print(f"Imported {imported}/{len(records)} valid rows ({len(errors)} rows skipped).")
    print(f"Database now has: {counts}")
    if errors:
        print("\nFirst skipped rows:")
        for e in errors[:10]:
            print(f"  {e}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")


def main():
    parser = argparse.ArgumentParser(description="Build the classmate-connect SQLite DB from a CSV, outside the web app.")
    parser.add_argument("--csv", required=True, type=Path, help="Path to master_schedule.csv")
    parser.add_argument("--db", required=True, type=Path, help="Path to the target SQLite .db file (created if missing)")
    parser.add_argument("--rebuild", action="store_true", help="Drop and recreate all tables before importing")
    args = parser.parse_args()

    if not args.csv.exists():
        sys.exit(f"CSV not found: {args.csv}")

    build_database(args.csv, args.db, args.rebuild)


if __name__ == "__main__":
    main()

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "classmate-connect-"));
process.env.DB_PATH = path.join(testDirectory, "migration.db");

const [{ db }, { migrateCsvToDb }] = await Promise.all([
  import("../src/db.js"),
  import("../src/migration.js"),
]);

const csvPath = path.join(testDirectory, "schedule.csv");
fs.writeFileSync(csvPath, [
  "student_id,student_name,student_name_ar,course_code,course_name,class_type,day_of_week,start_time,end_time,location,group_number",
  "1001,Ahmed Ali,,CS101,Computer Science,Lecture,Monday,09:00,10:30,Room 101,A",
  "1002,Fatima Hassan,,CS101,Computer Science,Lecture,Monday,09:00,10:30,Room 101,A",
].join("\n"));

after(() => {
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test("imports a valid schedule CSV into the normalized database", () => {
  const result = migrateCsvToDb(csvPath);

  assert.equal(result.importedRows, 2);
  assert.equal(result.totalRows, 2);
  assert.equal(result.students, 2);
  assert.equal(result.courses, 1);
  assert.equal(result.schedules, 2);
  assert.equal(result.errors, undefined);
});
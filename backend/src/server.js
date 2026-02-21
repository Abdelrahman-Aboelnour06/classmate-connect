import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db.js";
import { normalizeArabic } from "./utils.js";
import { migrateCsvToDb } from "./migration.js";
import { scrapeToMasterCsv } from "./scraper.js";
import { requireAdmin, signAdminToken } from "./auth.js";
import { buildTimetableCombinations } from "./advanced-timetable.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const explicitOrigins = [process.env.FRONTEND_ORIGIN || "http://localhost:8080", "http://localhost:5173"];
  if (explicitOrigins.includes(origin)) return true;

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login payload" });

  const admin = db.prepare("SELECT id, email, password_hash FROM admins WHERE email = ?").get(parsed.data.email);
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(parsed.data.password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  return res.json({ token: signAdminToken(admin), admin: { email: admin.email } });
});

app.post("/api/update", requireAdmin, async (_req, res) => {
  const outputCsv = path.join(process.cwd(), "backend", "data", "master_schedule.csv");

  try {
    const scrape = await scrapeToMasterCsv({ outputCsv });
    if (!scrape.records) return res.status(500).json({ status: "error", message: "No data scraped" });

    try {
      const stats = migrateCsvToDb(outputCsv);
      return res.json({ status: "success", scrape, migration: stats });
    } catch (migrationError) {
      return res.status(207).json({
        status: "partial",
        scrape,
        migration_error: migrationError instanceof Error ? migrationError.message : "Migration failed",
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error instanceof Error ? error.message : "Scrape failure",
    });
  }
});

app.post("/api/upload-csv", requireAdmin, async (req, res) => {
  // Log the request for debugging
  console.log("CSV upload request received");
  console.log("Body type:", typeof req.body);
  console.log("Body keys:", Object.keys(req.body || {}));
  console.log("Body csv type:", typeof req.body?.csv);
  console.log("Body csv length:", req.body?.csv?.length);

  const schema = z.object({ csv: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  
  if (!parsed.success) {
    console.error("Validation error:", parsed.error);
    let errorMsg = "Invalid CSV payload";
    if (parsed.error?.errors && Array.isArray(parsed.error.errors)) {
      errorMsg = parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
    }
    return res.status(400).json({ 
      status: "error",
      error: `${errorMsg}. Expected { csv: "content" }`
    });
  }

  try {
    const outputCsv = path.join(process.cwd(), "backend", "data", "master_schedule.csv");
    fs.mkdirSync(path.dirname(outputCsv), { recursive: true });
    fs.writeFileSync(outputCsv, parsed.data.csv, "utf8");

    const stats = migrateCsvToDb(outputCsv);
    console.log("CSV import successful:", stats);
    return res.json({ status: "success", migration: stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV migration failed";
    console.error("CSV upload error:", message);
    return res.status(400).json({
      status: "error",
      error: message,
    });
  }
});

app.get("/api/courses", (_req, res) => {
  const rows = db.prepare("SELECT course_code, course_name FROM courses ORDER BY course_code").all();
  res.json(rows);
});

app.get("/api/search/students", (req, res) => {
  const q = String(req.query.q || "").trim();
  const normalized = normalizeArabic(q);
  const rows = db
    .prepare(
      `SELECT student_id, student_name, student_name_ar
       FROM students
       WHERE student_id LIKE @id
          OR student_name LIKE @name
          OR student_name_ar LIKE @nameAr
          OR student_name_normalized LIKE @normalized
       ORDER BY student_name
       LIMIT 30`,
    )
    .all({
      id: `%${q}%`,
      name: `%${q}%`,
      nameAr: `%${q}%`,
      normalized: `%${normalized}%`,
    });
  res.json(rows);
});

app.get("/api/search/schedule", (req, res) => {
  const query = String(req.query.query || "").trim();
  const strict = String(req.query.strict || "0") === "1";
  const normalized = normalizeArabic(query);

  const whereClause = strict
    ? "s.student_id = @query"
    : "(s.student_id = @query OR s.student_id LIKE @likeQ OR s.student_name LIKE @likeQ OR s.student_name_ar LIKE @likeQ OR s.student_name_normalized LIKE @likeN)";

  const sql = `
    SELECT
      s.student_id, s.student_name, s.student_name_ar,
      c.course_code, c.course_name,
      ct.type_name as class_type,
      ts.day_of_week, ts.start_time, ts.end_time,
      cl.location, cl.group_number
    FROM schedules sch
    JOIN students s ON s.id = sch.student_id
    JOIN classes cl ON cl.id = sch.class_id
    JOIN courses c ON c.id = cl.course_id
    JOIN class_types ct ON ct.id = cl.class_type_id
    JOIN time_slots ts ON ts.id = cl.time_slot_id
    WHERE ${whereClause}
    ORDER BY ts.day_of_week, ts.start_time, c.course_code
  `;

  const rows = db.prepare(sql).all({ query, likeQ: `%${query}%`, likeN: `%${normalized}%` });
  res.json(rows);
});

app.get("/api/class-roster", (req, res) => {
  const schema = z.object({
    courseCode: z.string().min(1),
    day: z.string().min(1),
    start: z.string().min(1),
    type: z.string().min(1),
    location: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid roster query" });

  const q = parsed.data;
  const locationCondition = q.location ? "AND cl.location = @location" : "";

  const rows = db
    .prepare(
      `SELECT s.student_id, s.student_name, s.student_name_ar
       FROM schedules sch
       JOIN students s ON s.id = sch.student_id
       JOIN classes cl ON cl.id = sch.class_id
       JOIN courses c ON c.id = cl.course_id
       JOIN class_types ct ON ct.id = cl.class_type_id
       JOIN time_slots ts ON ts.id = cl.time_slot_id
       WHERE c.course_code = @courseCode
         AND ts.day_of_week = @day
         AND ts.start_time = @start
         AND ct.type_name = @type
         ${locationCondition}
       ORDER BY s.student_name`,
    )
    .all(q);

  res.json(rows);
});

app.get("/api/classmates", (req, res) => {
  const schema = z.object({ courseCode: z.string().min(1), studentName: z.string().optional(), excludeStudentId: z.string().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid classmates query" });

  const q = parsed.data;
  const rows = db
    .prepare(
      `SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       WHERE c.course_code = @courseCode
       ORDER BY s.student_name`,
    )
    .all(q)
    .filter((student) => {
      if (q.excludeStudentId && student.student_id === q.excludeStudentId) return false;
      if (q.studentName && student.student_name === q.studentName) return false;
      return true;
    });

  res.json(rows);
});

app.get("/api/class-students", (req, res) => {
  const schema = z.object({ 
    courseCode: z.string().min(1), 
    classType: z.string().min(1),
    dayOfWeek: z.string().min(1),
    startTime: z.string().min(1),
    groupNumber: z.string().optional()
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid class students query" });

  const { courseCode, classType, dayOfWeek, startTime, groupNumber } = parsed.data;
  
  let query = `
    SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
    FROM schedules sc
    JOIN students s ON s.id = sc.student_id
    JOIN classes cl ON cl.id = sc.class_id
    JOIN courses c ON c.id = cl.course_id
    JOIN class_types ct ON ct.id = cl.class_type_id
    JOIN time_slots ts ON ts.id = cl.time_slot_id
    WHERE c.course_code = ?
      AND ct.class_type = ?
      AND ts.day_of_week = ?
      AND ts.start_time = ?`;
  
  const params = [courseCode, classType, dayOfWeek, startTime];
  
  if (groupNumber) {
    query += ` AND cl.group_number = ?`;
    params.push(groupNumber);
  }
  
  query += ` ORDER BY s.student_name`;
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.get("/api/cohort-classmates", (req, res) => {
  const schema = z.object({ courseCode: z.string().min(1), studentId: z.string().min(4) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid cohort query" });

  const { courseCode, studentId } = parsed.data;
  const targetYear = studentId.slice(1, 3);

  const rows = db
    .prepare(
      `SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       WHERE c.course_code = ?
       ORDER BY s.student_name`,
    )
    .all(courseCode)
    .filter((student) => student.student_id !== studentId && student.student_id.slice(1, 3) === targetYear);

  res.json(rows);
});

app.post("/api/timetables", (req, res) => {
  console.log("=== /api/timetables REQUEST ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("Headers:", req.headers);
  
  const schema = z.object({
    selectedCourses: z.array(z.string()).min(1),
    index: z.number().int().min(0).default(0),
    maxResults: z.number().int().min(1).max(200).default(50)
  });

  const parsed = schema.safeParse(req.body || {});
  console.log("Parsed result:", parsed);
  
  if (!parsed.success) {
    console.log("Validation errors:", parsed.error.errors);
    return res.status(400).json({ error: "Invalid timetable payload", details: parsed.error.errors });
  }

  const { selectedCourses, index, maxResults } = parsed.data;

  try {
    console.log("🔍 buildTimetableCombinations called with:", { selectedCourses, maxResults });
    const combinations = buildTimetableCombinations(db, selectedCourses, maxResults);
    console.log("📊 Combinations generated:", combinations.length, "total");

    if (!combinations.length) {
      console.log("⚠️ No combinations found");
      return res.status(404).json({ error: "No valid timetable combinations found" });
    }

    const safeIndex = Math.min(index, combinations.length - 1);
    const response = {
      current_index: safeIndex,
      total: combinations.length,
      has_next: safeIndex < combinations.length - 1,
      timetable: combinations[safeIndex],
    };
    console.log("✅ Sending response:", { current_index: response.current_index, total: response.total, has_next: response.has_next, timetable_length: response.timetable.length });
    return res.json(response);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to generate timetables"
    });
  }
});

app.post("/api/students-by-courses", (req, res) => {
  const schema = z.object({ courseCodes: z.array(z.string()).min(1), matchType: z.enum(["all", "any"]) });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid students-by-courses payload" });

  const { courseCodes, matchType } = parsed.data;
  const placeholders = courseCodes.map(() => "?").join(",");

  const rows = db
    .prepare(
      `SELECT s.student_id, s.student_name, s.student_name_ar, COUNT(DISTINCT c.course_code) as matched_count
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       WHERE c.course_code IN (${placeholders})
       GROUP BY s.id
       HAVING ${matchType === "all" ? "matched_count = ?" : "matched_count >= 1"}
       ORDER BY s.student_name`,
    )
    .all(...courseCodes, ...(matchType === "all" ? [courseCodes.length] : []));

  res.json({ count: rows.length, students: rows });
});

app.post("/api/friends-and-enemies/analyze", (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    friendIds: z.array(z.string()).default([]),
    enemyIds: z.array(z.string()).default([]),
  });

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid friends-and-enemies payload" });

  const { studentId, friendIds, enemyIds } = parsed.data;

  // Get your schedule
  const yourSchedule = db
    .prepare(
      `SELECT
        s.student_id, s.student_name,
        c.course_code, c.course_name,
        ct.type_name as class_type,
        ts.day_of_week, ts.start_time, ts.end_time,
        cl.location, cl.group_number
       FROM schedules sch
       JOIN students s ON s.id = sch.student_id
       JOIN classes cl ON cl.id = sch.class_id
       JOIN courses c ON c.id = cl.course_id
       JOIN class_types ct ON ct.id = cl.class_type_id
       JOIN time_slots ts ON ts.id = cl.time_slot_id
       WHERE s.student_id = ?
       ORDER BY ts.day_of_week, ts.start_time, c.course_code`,
    )
    .all(studentId);

  if (!yourSchedule || yourSchedule.length === 0) {
    return res.status(404).json({ error: "Student schedule not found" });
  }

  // Get friends' schedules
  const friendSchedules = [];
  if (friendIds.length > 0) {
    const placeholders = friendIds.map(() => "?").join(",");
    friendSchedules.push(...db
      .prepare(
        `SELECT
          s.student_id, s.student_name,
          c.course_code, c.course_name,
          ct.type_name as class_type,
          ts.day_of_week, ts.start_time, ts.end_time,
          cl.location, cl.group_number
         FROM schedules sch
         JOIN students s ON s.id = sch.student_id
         JOIN classes cl ON cl.id = sch.class_id
         JOIN courses c ON c.id = cl.course_id
         JOIN class_types ct ON ct.id = cl.class_type_id
         JOIN time_slots ts ON ts.id = cl.time_slot_id
         WHERE s.student_id IN (${placeholders})
         ORDER BY s.student_id, ts.day_of_week, ts.start_time, c.course_code`,
      )
      .all(...friendIds));
  }

  // Get enemies' schedules
  const enemySchedules = [];
  if (enemyIds.length > 0) {
    const placeholders = enemyIds.map(() => "?").join(",");
    enemySchedules.push(...db
      .prepare(
        `SELECT
          s.student_id, s.student_name,
          c.course_code, c.course_name,
          ct.type_name as class_type,
          ts.day_of_week, ts.start_time, ts.end_time,
          cl.location, cl.group_number
         FROM schedules sch
         JOIN students s ON s.id = sch.student_id
         JOIN classes cl ON cl.id = sch.class_id
         JOIN courses c ON c.id = cl.course_id
         JOIN class_types ct ON ct.id = cl.class_type_id
         JOIN time_slots ts ON ts.id = cl.time_slot_id
         WHERE s.student_id IN (${placeholders})
         ORDER BY s.student_id, ts.day_of_week, ts.start_time, c.course_code`,
      )
      .all(...enemyIds));
  }

  // Analyze each of your classes
  const analyzed = yourSchedule.map((yourClass) => {
    const friendsInClass = friendSchedules.filter((f) => 
      f.course_code === yourClass.course_code &&
      f.day_of_week === yourClass.day_of_week &&
      f.start_time === yourClass.start_time &&
      f.class_type === yourClass.class_type &&
      f.location === yourClass.location
    );

    const enemiesInClass = enemySchedules.filter((e) =>
      e.course_code === yourClass.course_code &&
      e.day_of_week === yourClass.day_of_week &&
      e.start_time === yourClass.start_time &&
      e.class_type === yourClass.class_type &&
      e.location === yourClass.location
    );

    const hasFriends = friendsInClass.length > 0;
    const hasEnemies = enemiesInClass.length > 0;

    let category = "alone";
    if (hasFriends && hasEnemies) {
      category = "both";
    } else if (hasFriends) {
      category = "friends-only";
    } else if (hasEnemies) {
      category = "enemies-only";
    }

    return {
      ...yourClass,
      category,
      friends: friendsInClass,
      enemies: enemiesInClass,
    };
  });

  res.json({ analysis: analyzed });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Backend API running on http://localhost:${port}`);
});

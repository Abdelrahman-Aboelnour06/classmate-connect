import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import XLSX from "xlsx";
import { z } from "zod";
import { db } from "./db.js";
import { normalizeArabic } from "./utils.js";
import { migrateCsvToDb, validateCsvContent } from "./migration.js";
import { scrapeToMasterCsv } from "./scraper.js";
import {
  clearAdminSessionCookie,
  clearUserSessionCookie,
  createCsrfToken,
  csrfProtection,
  requireAdmin,
  requireUser,
  setAdminSessionCookie,
  setUserSessionCookie,
  signAdminToken,
} from "./auth.js";
import { queries } from "./queries.js";
import { createUserSession, deleteUserSession, usersDb } from "./users-db.js";
import {
  createLoginChallenge,
  createRegistrationChallenge,
  createQrCode,
  createTwoFactorSetup,
  enableUserTwoFactor,
  getUserTwoFactor,
  sendEmailCode,
  verifyLoginChallenge,
  verifyRegistrationChallenge,
} from "./two-factor.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);
app.use(helmet());
app.use((req, res, next) => {
  if (isProduction && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect(`https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});
if (isProduction) app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(express.json({ limit: "5mb" }));

let coursesCache = null;

function invalidateReadCaches() {
  coursesCache = null;
}

function buildFtsQuery(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const explicitOrigins = [process.env.FRONTEND_ORIGIN || "http://localhost:8080", "http://localhost:5173"];
  if (explicitOrigins.includes(origin)) return true;

  // Allow Cloudflare quick tunnel subdomains for temporary sharing.
  if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)) return true;

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
app.use(csrfProtection);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts" },
});
const accountAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.email || req.body?.identifier || "unknown").trim().toLowerCase(),
  message: { error: "Too many authentication attempts" },
});

const userEmail = z.string().trim().toLowerCase().email().max(254);
const username = z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/);
const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);
const botCheck = z.object({ website: z.string().max(0), startedAt: z.number().int().positive() }).strict();

function passesBotCheck(body) {
  return body.website === "" && Number.isFinite(body.startedAt) && Date.now() - body.startedAt >= 800;
}

const findUserByEmailQuery = usersDb.prepare("SELECT id, email, username, full_name, student_code, password_hash, two_factor_secret, two_factor_enabled FROM users WHERE email = ?");
const findUserByUsernameQuery = usersDb.prepare("SELECT id, email, username, full_name, student_code, password_hash, two_factor_secret, two_factor_enabled FROM users WHERE username = ?");
const findAdminByEmailQuery = db.prepare("SELECT id, email, password_hash FROM admins WHERE email = ?");
const insertUserQuery = usersDb.prepare(`
  INSERT INTO users (email, username, full_name, student_code, password_hash, terms_accepted_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

app.get("/api/auth/csrf", (_req, res) => {
  res.json({ token: createCsrfToken(res) });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", authLimiter, accountAuthLimiter, async (req, res) => {
  const schema = z.object({ email: userEmail, password: z.string().min(1), ...botCheck.shape }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !passesBotCheck(parsed.data)) return res.status(401).json({ error: "Invalid credentials" });

  const admin = findAdminByEmailQuery.get(parsed.data.email);
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(parsed.data.password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  setAdminSessionCookie(res, signAdminToken(admin));
  return res.json({ admin: { email: admin.email } });
});

app.post("/api/auth/logout", (req, res) => {
  clearAdminSessionCookie(res);
  res.status(204).end();
});

app.post("/api/users/register", authLimiter, accountAuthLimiter, async (req, res) => {
  const schema = z
    .object({
      email: userEmail.refine((value) => value.endsWith("@eng-st.cu.edu.eg"), "Use your @eng-st.cu.edu.eg email"),
      username,
      fullName: z.string().trim().min(2).max(100),
      studentCode: z.string().trim().regex(/^[A-Za-z0-9-]{3,24}$/),
      password,
      termsAccepted: z.literal(true),
      ...botCheck.shape,
    })
    .strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !passesBotCheck(parsed.data)) return res.status(400).json({ error: "Invalid registration details" });

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const verificationToken = await createRegistrationChallenge({
      email: parsed.data.email,
      username: parsed.data.username,
      fullName: parsed.data.fullName,
      studentCode: parsed.data.studentCode,
      passwordHash,
    });
    if (!verificationToken) return res.status(503).json({ error: "Email verification is not configured. Contact the site administrator." });
    return res.status(202).json({ emailVerificationRequired: true, verificationToken, expiresInMinutes: 5 });
  } catch {
    return res.status(400).json({ error: "Unable to start email verification" });
  }
});

app.post("/api/users/register/verify", authLimiter, async (req, res) => {
  const schema = z.object({ verificationToken: z.string().min(20), code: z.string().regex(/^\d{6}$/) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the six-digit email verification code." });

  const registration = verifyRegistrationChallenge(parsed.data.verificationToken, parsed.data.code);
  if (!registration) return res.status(400).json({ error: "Invalid or expired email verification code." });

  try {
    const result = insertUserQuery.run(registration.email, registration.username, registration.fullName, registration.studentCode, registration.passwordHash);
    const session = createUserSession(Number(result.lastInsertRowid));
    setUserSessionCookie(res, session.token, 12 * 60 * 60 * 1000);
    return res.status(201).json({ user: { email: registration.email, username: registration.username, fullName: registration.fullName, studentCode: registration.studentCode } });
  } catch {
    return res.status(400).json({ error: "Unable to create account" });
  }
});

app.post("/api/users/login", authLimiter, accountAuthLimiter, async (req, res) => {
  const schema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1), ...botCheck.shape }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !passesBotCheck(parsed.data)) return res.status(401).json({ error: "Invalid credentials" });

  const identifier = parsed.data.identifier.toLowerCase();
  if (identifier === process.env.ADMIN_EMAIL.toLowerCase()) {
    const admin = findAdminByEmailQuery.get(identifier);
    const validAdmin = admin ? await bcrypt.compare(parsed.data.password, admin.password_hash) : false;
    if (admin && validAdmin) {
      setAdminSessionCookie(res, signAdminToken(admin));
      return res.json({ user: { email: admin.email, username: "admin", fullName: "Administrator", studentCode: "" }, admin: true });
    }
  }

  const user = identifier.includes("@")
    ? findUserByEmailQuery.get(identifier)
    : findUserByUsernameQuery.get(parsed.data.identifier);
  const valid = user ? await bcrypt.compare(parsed.data.password, user.password_hash) : false;
  if (!user || !valid) return res.status(401).json({ error: "Invalid credentials" });

  if (user.two_factor_enabled) {
    return res.json({ twoFactorRequired: true, challengeToken: createLoginChallenge(user), methods: ["totp", "email"] });
  }

  const session = createUserSession(user.id);
  setUserSessionCookie(res, session.token, 12 * 60 * 60 * 1000);
  return res.json({ user: { email: user.email, username: user.username, fullName: user.full_name, studentCode: user.student_code } });
});

app.post("/api/users/2fa/email", async (req, res) => {
  const schema = z.object({ challengeToken: z.string().min(20) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !(await sendEmailCode(parsed.data.challengeToken))) {
    return res.status(400).json({ error: "Email verification is not configured or the challenge expired." });
  }
  return res.json({ status: "sent" });
});

app.post("/api/users/2fa/verify", async (req, res) => {
  const schema = z.object({ challengeToken: z.string().min(20), method: z.enum(["totp", "email"]), code: z.string().regex(/^\d{6}$/) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid six-digit verification code." });

  const user = await verifyLoginChallenge(parsed.data.challengeToken, parsed.data.method, parsed.data.code);
  if (!user) return res.status(401).json({ error: "Invalid or expired verification code." });

  const session = createUserSession(user.id);
  setUserSessionCookie(res, session.token, 12 * 60 * 60 * 1000);
  return res.json({ user: { email: user.email, username: user.username, fullName: user.full_name, studentCode: user.student_code } });
});

app.get("/api/users/2fa/setup", requireUser, async (req, res) => {
  const user = getUserTwoFactor(req.user.id);
  if (!user) return res.status(404).json({ error: "User account not found" });
  if (user.two_factor_enabled) return res.json({ enabled: true });

  const setup = createTwoFactorSetup(user);
  return res.json({ enabled: false, secret: setup.secret, qrCode: await createQrCode(setup.uri) });
});

app.post("/api/users/2fa/setup", requireUser, async (req, res) => {
  const schema = z.object({ secret: z.string().min(16), code: z.string().regex(/^\d{6}$/) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !(await enableUserTwoFactor(req.user.id, parsed.data.secret, parsed.data.code))) {
    return res.status(400).json({ error: "Invalid authenticator code. Scan the QR code and try again." });
  }
  return res.json({ enabled: true });
});

app.get("/api/users/me", requireUser, (req, res) => {
  res.json({ user: { email: req.user.email, username: req.user.username, fullName: req.user.full_name || req.user.username, studentCode: req.user.student_code || "" } });
});

app.post("/api/users/logout", (req, res) => {
  const cookieHeader = req.headers.cookie || "";
  const sessionCookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("user_session=") || part.startsWith("__Host-user_session="));
  if (sessionCookie) deleteUserSession(decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf("=") + 1)));
  clearUserSessionCookie(res);
  res.status(204).end();
});

app.post("/api/update", requireAdmin, async (_req, res) => {
  const outputCsv = path.join(process.cwd(), "backend", "data", "master_schedule.csv");

  try {
    const scrape = await scrapeToMasterCsv({ outputCsv });
    if (!scrape.records) return res.status(500).json({ status: "error", message: "No data scraped" });

    try {
      const stats = migrateCsvToDb(outputCsv);
      invalidateReadCaches();
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
  const schema = z.object({ csv: z.string().min(1) }).strict();
  const parsed = schema.safeParse(req.body);
  
  if (!parsed.success) {
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
    invalidateReadCaches();
    return res.json({ status: "success", migration: stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV migration failed";
    return res.status(400).json({
      status: "error",
      error: message,
    });
  }
});

app.post("/api/validate-csv", requireAdmin, (req, res) => {
  const schema = z.object({ csv: z.string().min(1) }).strict();
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ status: "error", error: "Expected { csv: \"content\" }" });
  }

  try {
    const validation = validateCsvContent(parsed.data.csv);
    return res.json({
      status: "success",
      totalRows: validation.rows.length,
      validRows: validation.records.length,
      errors: validation.errors,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      error: error instanceof Error ? error.message : "CSV validation failed",
    });
  }
});

app.get("/api/courses", requireUser, (_req, res) => {
  if (!coursesCache) {
    coursesCache = queries.getCourses();
  }
  res.json(coursesCache);
});

app.get("/api/search/students", requireUser, (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const ftsQuery = buildFtsQuery(q);
  const rows = queries.searchStudents({ id: `%${q}%`, ftsQuery });
  res.json(rows);
});

app.get("/api/search/schedule", requireUser, (req, res) => {
  const query = String(req.query.query || "").trim();
  const strict = String(req.query.strict || "0") === "1";
  if (!query) return res.json([]);

  const ftsQuery = buildFtsQuery(query);

  const rows = queries.searchSchedule({ query, id: `%${query}%`, ftsQuery }, strict);
  res.json(rows);
});

app.get("/api/class-roster", requireUser, (req, res) => {
  const schema = z.object({
    courseCode: z.string().min(1),
    day: z.string().min(1),
    start: z.string().min(1),
    type: z.string().min(1),
    location: z.string().optional(),
  }).strict();

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid roster query" });

  const q = parsed.data;
  const rows = queries.classRoster({ ...q, location: q.location || null });

  res.json(rows);
});

app.get("/api/classmates", requireUser, (req, res) => {
  const schema = z.object({ courseCode: z.string().min(1), studentName: z.string().optional(), excludeStudentId: z.string().optional() }).strict();
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid classmates query" });

  const q = parsed.data;
  const rows = queries.classmates({
    courseCode: q.courseCode,
    excludeStudentId: q.excludeStudentId || null,
    studentName: q.studentName || null,
  });

  res.json(rows);
});

app.get("/api/class-students", requireUser, (req, res) => {
  const schema = z.object({ 
    courseCode: z.string().min(1), 
    classType: z.string().min(1),
    dayOfWeek: z.string().min(1),
    startTime: z.string().min(1),
    groupNumber: z.string().optional()
  }).strict();
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid class students query" });

  const { courseCode, classType, dayOfWeek, startTime, groupNumber } = parsed.data;
  
  const rows = queries.classStudents({
    courseCode,
    classType,
    dayOfWeek,
    startTime,
    groupNumber: groupNumber || null,
  });
  res.json(rows);
});

app.get("/api/cohort-classmates", requireUser, (req, res) => {
  const schema = z.object({ courseCode: z.string().min(1), studentId: z.string().min(4) }).strict();
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid cohort query" });

  const { courseCode, studentId } = parsed.data;
  const targetYear = studentId.slice(1, 3);

  const rows = queries.cohortClassmates({ courseCode, studentId, targetYear });

  res.json(rows);
});

const busyTimeSlotSchema = z
  .object({
    dayOfWeek: z.string().trim().min(1),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((slot) => slot.endTime > slot.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

const studentsByCoursesSchema = z.object({
  courseCodes: z.array(z.string()).min(1),
  matchType: z.enum(["all", "any"]),
  busyTimeSlot: busyTimeSlotSchema.optional(),
  availabilityMode: z.enum(["busy", "free"]).default("busy"),
}).strict();

function normalizeCourseCodes(courseCodes) {
  return [...new Set(courseCodes.map((code) => String(code).trim().toUpperCase()).filter(Boolean))];
}

function getStudentsByCoursesRows(courseCodes, matchType, busyTimeSlot, availabilityMode = "busy") {
  const placeholders = courseCodes.map(() => "?").join(",");
  const havingClauses = [matchType === "all" ? "matched_count = ?" : "matched_count >= 1"];
  const params = [...courseCodes, ...(matchType === "all" ? [courseCodes.length] : [])];

  if (busyTimeSlot) {
    const overlapExistsClause = `EXISTS (
      SELECT 1
      FROM schedules sch2
      JOIN classes cl2 ON cl2.id = sch2.class_id
      JOIN time_slots ts2 ON ts2.id = cl2.time_slot_id
      WHERE sch2.student_id = s.id
        AND ts2.day_of_week = ?
        AND ts2.start_time < ?
        AND ts2.end_time > ?
    )`;

    havingClauses.push(availabilityMode === "free" ? `NOT ${overlapExistsClause}` : overlapExistsClause);

    params.push(busyTimeSlot.dayOfWeek, busyTimeSlot.endTime, busyTimeSlot.startTime);
  }

  return db
    .prepare(
      `SELECT s.student_id, s.student_name, s.student_name_ar, COUNT(DISTINCT c.course_code) as matched_count
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       WHERE c.course_code IN (${placeholders})
       GROUP BY s.id
       HAVING ${havingClauses.join(" AND ")}
       ORDER BY s.student_name`,
    )
    .all(...params);
}

function classifyClassType(typeName) {
  const normalizedType = String(typeName || "").toLowerCase();

  if (normalizedType.includes("lecture") || normalizedType.includes("lec")) {
    return "lec";
  }

  if (
    normalizedType.includes("tutorial") ||
    normalizedType.includes("tut") ||
    normalizedType.includes("section") ||
    normalizedType.includes("lab") ||
    normalizedType.includes("practical")
  ) {
    return "tut";
  }

  return "other";
}

function formatClassSlot(dayOfWeek, startTime, endTime, groupNumber) {
  const groupSuffix = groupNumber && String(groupNumber) !== "0" ? ` (G${groupNumber})` : "";
  return `${dayOfWeek} ${startTime}-${endTime}${groupSuffix}`;
}

function buildExportFileName(courseCodes) {
  const rawName = `${courseCodes.join("-")}.xlsx`;

  return rawName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

app.post("/api/students-by-courses", requireUser, (req, res) => {
  const parsed = studentsByCoursesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid students-by-courses payload" });

  const matchType = parsed.data.matchType;
  const courseCodes = normalizeCourseCodes(parsed.data.courseCodes);
  const busyTimeSlot = parsed.data.busyTimeSlot;
  const availabilityMode = parsed.data.availabilityMode;
  if (!courseCodes.length) return res.status(400).json({ error: "No valid course codes provided" });

  const rows = getStudentsByCoursesRows(courseCodes, matchType, busyTimeSlot, availabilityMode);

  res.json({ count: rows.length, students: rows });
});

app.post("/api/students-by-courses/export", requireUser, (req, res) => {
  const parsed = studentsByCoursesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid students-by-courses export payload" });

  const matchType = parsed.data.matchType;
  const courseCodes = normalizeCourseCodes(parsed.data.courseCodes);
  const busyTimeSlot = parsed.data.busyTimeSlot;
  const availabilityMode = parsed.data.availabilityMode;
  if (!courseCodes.length) return res.status(400).json({ error: "No valid course codes provided" });

  const students = getStudentsByCoursesRows(courseCodes, matchType, busyTimeSlot, availabilityMode);
  const headers = ["Code", "Name", ...courseCodes.flatMap((code) => [`${code} Lec`, `${code} Tut`])];

  const classDetailsMap = new Map();

  if (students.length > 0) {
    const studentIds = students.map((student) => student.student_id);
    const studentPlaceholders = studentIds.map(() => "?").join(",");
    const coursePlaceholders = courseCodes.map(() => "?").join(",");

    const classRows = db
      .prepare(
        `SELECT
          s.student_id,
          c.course_code,
          ct.type_name as class_type,
          ts.day_of_week,
          ts.start_time,
          ts.end_time,
          cl.group_number
         FROM schedules sch
         JOIN students s ON s.id = sch.student_id
         JOIN classes cl ON cl.id = sch.class_id
         JOIN courses c ON c.id = cl.course_id
         JOIN class_types ct ON ct.id = cl.class_type_id
         JOIN time_slots ts ON ts.id = cl.time_slot_id
         WHERE s.student_id IN (${studentPlaceholders})
           AND c.course_code IN (${coursePlaceholders})
         ORDER BY s.student_id, c.course_code, ct.type_name, ts.day_of_week, ts.start_time`,
      )
      .all(...studentIds, ...courseCodes);

    for (const row of classRows) {
      const key = `${row.student_id}::${row.course_code}`;
      if (!classDetailsMap.has(key)) {
        classDetailsMap.set(key, { lec: new Set(), tut: new Set() });
      }

      const slot = formatClassSlot(row.day_of_week, row.start_time, row.end_time, row.group_number);
      const classType = classifyClassType(row.class_type);
      const details = classDetailsMap.get(key);

      if (classType === "lec") {
        details.lec.add(slot);
      } else if (classType === "tut") {
        details.tut.add(slot);
      } else {
        details.tut.add(`${row.class_type}: ${slot}`);
      }
    }
  }

  const rows = students.map((student) => {
    const row = [student.student_id, student.student_name];

    for (const courseCode of courseCodes) {
      const details = classDetailsMap.get(`${student.student_id}::${courseCode}`);
      row.push(details ? Array.from(details.lec).join(" | ") : "");
      row.push(details ? Array.from(details.tut).join(" | ") : "");
    }

    return row;
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = buildExportFileName(courseCodes);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return res.send(buffer);
});

app.post("/api/friends-and-enemies/analyze", requireUser, (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    friendIds: z.array(z.string()).default([]),
    enemyIds: z.array(z.string()).default([]),
  }).strict();

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

// --- STATISTICS ROUTES ---
app.post('/api/statistics/upload', requireAdmin, (req, res) => {
  const rowSchema = z.object({
    course_code: z.string().trim().min(1).max(32),
    semester: z.string().trim().min(1).max(64),
    program: z.string().trim().min(1).max(128),
    grade: z.string().trim().min(1).max(4),
    student_count: z.number().int().nonnegative(),
  }).strict();
  const parsed = z.object({ data: z.array(rowSchema).min(1).max(5000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data format" });
  const { data } = parsed.data;

  try {
    if (db.prepare) {
      // If using better-sqlite3
      const stmt = db.prepare('INSERT INTO course_statistics (course_code, semester, program, grade, student_count) VALUES (?, ?, ?, ?, ?)');
      const insertMany = db.transaction((rows) => {
        for (const row of rows) stmt.run(row.course_code, row.semester, row.program, row.grade, row.student_count);
      });
      insertMany(data);
      res.json({ success: true, count: data.length });
    } else {
      // If using standard sqlite3
      const placeholders = data.map(() => '(?, ?, ?, ?, ?)').join(',');
      const values = data.flatMap(d => [d.course_code, d.semester, d.program, d.grade, d.student_count]);
      db.run(`INSERT INTO course_statistics (course_code, semester, program, grade, student_count) VALUES ${placeholders}`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: data.length });
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to save statistics" });
  }
});

app.get('/api/statistics', requireUser, (req, res) => {
  const { course, semester, program } = req.query;

  // Let the Database do the heavy lifting and math!
  let query = 'SELECT grade, SUM(student_count) as student_count FROM course_statistics WHERE 1=1';
  const params = [];

  if (course && course !== 'All') { query += ' AND course_code = ?'; params.push(course); }
  if (semester && semester !== 'All') { query += ' AND semester = ?'; params.push(semester); }
  if (program && program !== 'All') { query += ' AND program = ?'; params.push(program); }

  query += ' GROUP BY grade';

  try {
    if (db.prepare) {
      const rows = db.prepare(query).all(...params);
      res.json(rows);
    } else {
      db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

app.get('/api/statistics/filters', requireUser, (req, res) => {
  const query = 'SELECT DISTINCT course_code, semester, program FROM course_statistics';
  try {
    if (db.prepare) {
      const rows = db.prepare(query).all();
      res.json(rows);
    } else {
      db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch filters" });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Backend API running on http://localhost:${port}`);
});

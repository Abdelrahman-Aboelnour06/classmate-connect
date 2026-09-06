import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { findUserBySession } from "./users-db.js";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
if (!ADMIN_EMAIL) throw new Error("ADMIN_EMAIL is required");

export function signAdminToken(admin) {
  return jwt.sign({ id: admin.id, email: admin.email, role: "admin" }, JWT_SECRET, {
    expiresIn: "12h",
  });
}

export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const cookies = parseCookies(req.headers.cookie);
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : cookies[adminCookieName] || "";
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const user = verifyAdminToken(token);
    if (!user) {
      return res.status(403).json({ error: "Access denied" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function verifyAdminToken(token) {
  try {
    const user = jwt.verify(token, JWT_SECRET);
    return user.role === "admin" && user.email === ADMIN_EMAIL ? user : null;
  } catch {
    return null;
  }
}

const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = isProduction ? "__Host-user_session" : "user_session";
const adminCookieName = isProduction ? "__Host-admin_session" : "admin_session";

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
  );
}

function cookieOptions(maxAge) {
  return [
    `Path=/`,
    `Max-Age=${Math.floor(maxAge / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");
}

export function setUserSessionCookie(res, token, maxAgeMs) {
  res.append("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(token)}; ${cookieOptions(maxAgeMs)}`);
}

export function clearUserSessionCookie(res) {
  res.append("Set-Cookie", `${sessionCookieName}=; ${cookieOptions(0)}`);
}

export function setAdminSessionCookie(res, token, maxAgeMs = 12 * 60 * 60 * 1000) {
  res.append("Set-Cookie", `${adminCookieName}=${encodeURIComponent(token)}; ${cookieOptions(maxAgeMs)}`);
}

export function clearAdminSessionCookie(res) {
  res.append("Set-Cookie", `${adminCookieName}=; ${cookieOptions(0)}`);
}

export function requireUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const user = findUserBySession(cookies[sessionCookieName]);
  if (user) {
    req.user = user;
    next();
    return;
  }

  const admin = verifyAdminToken(cookies[adminCookieName] || "");
  if (!admin) return res.status(401).json({ error: "Authentication required" });
  req.user = { id: admin.id, email: admin.email, username: "admin", role: "admin" };
  next();
}

export function createCsrfToken(res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const secure = isProduction ? "; Secure" : "";
  res.append("Set-Cookie", `csrf_token=${encodeURIComponent(token)}; Path=/; Max-Age=43200; SameSite=Strict${secure}`);
  return token;
}

export function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers.authorization?.startsWith("Bearer ")) return next();

  const cookies = parseCookies(req.headers.cookie);
  const expected = cookies.csrf_token;
  const received = req.headers["x-csrf-token"];
  if (!expected || typeof received !== "string" || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.status(403).json({ error: "Request could not be verified" });
  }
  next();
}

export { sessionCookieName };
